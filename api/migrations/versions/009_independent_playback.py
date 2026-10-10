"""Independent playback mode and atomic room-control guards."""
from alembic import op

revision = '009'
down_revision = '794d25c627f8'
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""
ALTER TABLE sessions ADD COLUMN playback_mode text NOT NULL DEFAULT 'dj'
  CHECK (playback_mode IN ('dj', 'independent'));
ALTER TABLE sessions ADD COLUMN playback_mode_version integer NOT NULL DEFAULT 0
  CHECK (playback_mode_version >= 0);
INSERT INTO feature_flags (key, enabled) VALUES ('INDEPENDENT_PLAYBACK', false)
  ON CONFLICT (key) DO NOTHING;

CREATE FUNCTION public.require_dj_playback(p_session_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session sessions; v_version text;
BEGIN
  SELECT * INTO v_session FROM sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.status != 'active' OR v_session.expires_at < now() THEN
    RAISE EXCEPTION 'Playback conflict: room is inactive';
  END IF;
  v_version := nullif(current_setting('app.playback_mode_version', true), '');
  IF v_session.playback_mode != 'dj' OR
     (v_version IS NULL AND v_session.playback_mode_version != 0) OR
     (v_version IS NOT NULL AND v_version::integer != v_session.playback_mode_version) THEN
    RAISE EXCEPTION 'Playback conflict: room mode changed; refresh the room';
  END IF;
END; $$;

CREATE FUNCTION public.set_playback_mode(p_session_id uuid, p_mode text, p_expected_version integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session sessions;
BEGIN
  SELECT * INTO v_session FROM sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.status != 'active' OR v_session.expires_at < now() THEN
    RAISE EXCEPTION 'Playback conflict: room is inactive';
  END IF;
  IF v_session.host_user_id IS DISTINCT FROM auth.uid() OR NOT EXISTS (
    SELECT 1 FROM session_participants WHERE session_id = p_session_id AND user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'Only the host can change the room mode'; END IF;
  IF p_mode NOT IN ('dj', 'independent') OR p_mode IS NULL THEN
    RAISE EXCEPTION 'Invalid playback mode';
  END IF;
  IF v_session.playback_mode_version != p_expected_version OR p_expected_version IS NULL THEN
    RAISE EXCEPTION 'Playback conflict: room mode changed; refresh the room';
  END IF;
  IF v_session.playback_mode = p_mode THEN RETURN; END IF;
  IF p_mode = 'independent' AND NOT EXISTS (
    SELECT 1 FROM feature_flags WHERE key = 'INDEPENDENT_PLAYBACK' AND enabled
  ) OR p_mode = 'independent' AND NOT EXISTS (
    SELECT 1 FROM feature_flags WHERE key = 'YOUTUBE_EMBED' AND enabled
  ) THEN RAISE EXCEPTION 'Playback conflict: Shared Queue is not enabled'; END IF;
  PERFORM set_config('app.mode_transition', 'on', true);
  UPDATE sessions SET playback_mode = p_mode, playback_mode_version = playback_mode_version + 1,
    dj_user_id = CASE WHEN p_mode = 'dj' THEN host_user_id ELSE dj_user_id END,
    auto_pilot = false WHERE id = p_session_id;
  PERFORM set_config('app.mode_transition', '', true);
END; $$;

-- Retain the existing functions' behavior and grants; guard even internal RPC calls.
DO $$
DECLARE fn text; src text; definition text; target text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['play_next(uuid,text,boolean)', 'play_specific_song(uuid,uuid,boolean)',
    'play_previous_song(uuid,boolean)', 'cast_skip_vote(uuid,uuid,integer)',
    'pass_dj_token(uuid,uuid)', 'set_repeat_mode(uuid,text)'] LOOP
    SELECT prosrc, pg_get_functiondef(oid) INTO src, definition FROM pg_proc
      WHERE oid = ('public.' || fn)::regprocedure;
    target := CASE WHEN fn LIKE 'cast_skip_vote%' THEN
      '(SELECT session_id FROM queue_items WHERE id = p_queue_item_id)' ELSE 'p_session_id' END;
    definition := replace(definition, src, regexp_replace(src, 'BEGIN',
      'BEGIN' || E'\n  -- independent-playback guard\n  PERFORM public.require_dj_playback(' || target || ');', ''));
    EXECUTE definition;
  END LOOP;
END; $$;

CREATE FUNCTION public.guard_playback_writes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'sessions' AND TG_OP = 'INSERT' THEN
    IF NEW.playback_mode_version != 0 OR (NEW.playback_mode = 'independent' AND
      (NEW.auto_pilot OR NOT EXISTS (SELECT 1 FROM feature_flags WHERE key = 'INDEPENDENT_PLAYBACK' AND enabled)
       OR NOT EXISTS (SELECT 1 FROM feature_flags WHERE key = 'YOUTUBE_EMBED' AND enabled))) THEN
      RAISE EXCEPTION 'Playback conflict: invalid initial playback mode';
    END IF;
  ELSIF TG_TABLE_NAME = 'queue_items' THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM 1 FROM sessions WHERE id = NEW.session_id AND status = 'active' AND expires_at > now() FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Playback conflict: room is inactive'; END IF;
      IF NEW.status != 'queued' THEN PERFORM require_dj_playback(NEW.session_id); END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN PERFORM require_dj_playback(NEW.session_id); END IF;
  ELSIF TG_TABLE_NAME = 'skip_votes' THEN
    IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM queue_items WHERE id = OLD.queue_item_id) THEN RETURN OLD; END IF;
    PERFORM require_dj_playback((SELECT session_id FROM queue_items
      WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.queue_item_id ELSE NEW.queue_item_id END));
  ELSE
    IF current_setting('app.mode_transition', true) IS DISTINCT FROM 'on' THEN
      IF NEW.playback_mode IS DISTINCT FROM OLD.playback_mode OR
        NEW.playback_mode_version IS DISTINCT FROM OLD.playback_mode_version THEN
        RAISE EXCEPTION 'Playback conflict: use set_playback_mode';
      END IF;
      IF NEW.auto_pilot IS DISTINCT FROM OLD.auto_pilot OR NEW.repeat_mode IS DISTINCT FROM OLD.repeat_mode THEN
        PERFORM require_dj_playback(NEW.id);
      END IF;
      IF NEW.playback_mode = 'independent' AND NEW.dj_user_id IS DISTINCT FROM OLD.dj_user_id THEN
        RAISE EXCEPTION 'Playback conflict: DJ controls are unavailable in Shared Queue';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_queue_playback BEFORE INSERT OR UPDATE ON queue_items
  FOR EACH ROW EXECUTE FUNCTION guard_playback_writes();
CREATE TRIGGER guard_vote_playback BEFORE INSERT OR UPDATE OR DELETE ON skip_votes
  FOR EACH ROW EXECUTE FUNCTION guard_playback_writes();
CREATE TRIGGER guard_session_playback BEFORE INSERT OR UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION guard_playback_writes();

CREATE OR REPLACE FUNCTION public.handle_dj_leave() RETURNS trigger AS $$
BEGIN
  UPDATE sessions SET dj_user_id = host_user_id WHERE id = OLD.session_id
    AND dj_user_id = OLD.user_id AND host_user_id IS NOT NULL AND status != 'ended'
    AND playback_mode = 'dj';
  RETURN OLD;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
"""

_DOWNGRADE_SQL = r"""
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM sessions WHERE playback_mode = 'independent' AND status = 'active') THEN
    RAISE EXCEPTION 'End or convert all Shared Queue rooms before downgrading';
  END IF;
END; $$;
DROP TRIGGER guard_queue_playback ON queue_items;
DROP TRIGGER guard_vote_playback ON skip_votes;
DROP TRIGGER guard_session_playback ON sessions;
DROP FUNCTION guard_playback_writes();
DO $$
DECLARE fn text; src text; definition text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['play_next(uuid,text,boolean)', 'play_specific_song(uuid,uuid,boolean)',
    'play_previous_song(uuid,boolean)', 'cast_skip_vote(uuid,uuid,integer)',
    'pass_dj_token(uuid,uuid)', 'set_repeat_mode(uuid,text)'] LOOP
    SELECT prosrc, pg_get_functiondef(oid) INTO src, definition FROM pg_proc
      WHERE oid = ('public.' || fn)::regprocedure;
    EXECUTE replace(definition, src, regexp_replace(src,
      E'\n  -- independent-playback guard\n  PERFORM public.require_dj_playback\\([^;]+;', '', ''));
  END LOOP;
END; $$;
CREATE OR REPLACE FUNCTION public.handle_dj_leave() RETURNS trigger AS $$
BEGIN
  UPDATE sessions SET dj_user_id = host_user_id WHERE id = OLD.session_id
    AND dj_user_id = OLD.user_id AND host_user_id IS NOT NULL AND status != 'ended';
  RETURN OLD;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP FUNCTION set_playback_mode(uuid,text,integer);
DROP FUNCTION require_dj_playback(uuid);
DELETE FROM feature_flags WHERE key = 'INDEPENDENT_PLAYBACK';
ALTER TABLE sessions DROP COLUMN playback_mode, DROP COLUMN playback_mode_version;
"""

def upgrade():
    op.execute(_UPGRADE_SQL)

def downgrade():
    op.execute(_DOWNGRADE_SQL)
