"""baseline — full idempotent schema (all supabase migrations consolidated)

Revision ID: 001
Revises:
Create Date: 2026-05-03

Safe to run on:
  - Fresh DB (UAT): creates everything
  - Existing DB (staging/prod): all ops are no-ops via IF NOT EXISTS / CREATE OR REPLACE
"""
from alembic import op

revision = "001"
down_revision = None
branch_labels = None
depends_on = None

_UPGRADE_SQL = """
-- ── profiles ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name     text,
  avatar_url       text,
  preferred_platform text,
  created_at       timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public profiles readable" ON profiles;
DROP POLICY IF EXISTS "Own profile editable"     ON profiles;
DROP POLICY IF EXISTS "Profile auto-created"     ON profiles;
CREATE POLICY "Public profiles readable" ON profiles FOR SELECT USING (true);
CREATE POLICY "Own profile editable"     ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Profile auto-created"     ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ── sessions ──────────────────────────────────────────────────────────────────
-- Created with final schema: repeat_mode instead of the intermediate repeat bool
CREATE TABLE IF NOT EXISTS sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code      text UNIQUE NOT NULL,
  host_user_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  dj_user_id       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','active','ended')),
  max_participants integer DEFAULT 20,
  created_at       timestamptz DEFAULT now(),
  ended_at         timestamptz,
  last_activity_at timestamptz DEFAULT now(),
  expires_at       timestamptz DEFAULT now() + interval '24 hours',
  repeat_mode      text NOT NULL DEFAULT 'none' CHECK (repeat_mode IN ('none','song','queue'))
);
-- Idempotent column additions for DBs created before repeat_mode was added
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at   timestamptz DEFAULT now() + interval '24 hours';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS repeat_mode  text NOT NULL DEFAULT 'none'
  CHECK (repeat_mode IN ('none','song','queue'));
-- Clean up old boolean repeat column if it still exists (from intermediate migration)
ALTER TABLE sessions DROP COLUMN IF EXISTS repeat;

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Sessions readable"               ON sessions;
DROP POLICY IF EXISTS "Sessions creatable by authed"    ON sessions;
DROP POLICY IF EXISTS "Sessions updatable by host"      ON sessions;
DROP POLICY IF EXISTS "Sessions updatable by host or dj" ON sessions;
CREATE POLICY "Sessions readable"            ON sessions FOR SELECT USING (true);
CREATE POLICY "Sessions creatable by authed" ON sessions FOR INSERT WITH CHECK (auth.uid() = host_user_id);
CREATE POLICY "Sessions updatable by host"   ON sessions FOR UPDATE USING (auth.uid() = host_user_id);

CREATE INDEX IF NOT EXISTS sessions_invite_code_idx ON sessions(invite_code);

-- ── session_participants ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_participants (
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at  timestamptz DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);
ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants readable"           ON session_participants;
DROP POLICY IF EXISTS "Participants insertable by self" ON session_participants;
DROP POLICY IF EXISTS "Participants deletable by self"  ON session_participants;
CREATE POLICY "Participants readable"           ON session_participants FOR SELECT USING (true);
CREATE POLICY "Participants insertable by self" ON session_participants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Participants deletable by self"  ON session_participants FOR DELETE USING (auth.uid() = user_id);

-- ── queue_items ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS queue_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid REFERENCES sessions(id) ON DELETE CASCADE,
  added_by_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  position         bigint GENERATED ALWAYS AS IDENTITY,
  title            text NOT NULL,
  artist           text NOT NULL,
  thumbnail_url    text,
  platform_links   jsonb NOT NULL DEFAULT '{}',
  status           text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','playing','played','skipped')),
  added_at         timestamptz DEFAULT now(),
  UNIQUE (session_id, position)
);
ALTER TABLE queue_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Queue readable"                  ON queue_items;
DROP POLICY IF EXISTS "Queue insertable by participant" ON queue_items;
DROP POLICY IF EXISTS "Queue updatable by dj or host"   ON queue_items;
CREATE POLICY "Queue readable" ON queue_items FOR SELECT USING (true);
CREATE POLICY "Queue insertable by participant" ON queue_items FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM session_participants
    WHERE session_id = queue_items.session_id AND user_id = auth.uid()
  )
);
CREATE POLICY "Queue updatable by dj or host" ON queue_items FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM sessions
    WHERE id = queue_items.session_id
      AND (host_user_id = auth.uid() OR dj_user_id = auth.uid())
  )
);

-- Trigger: update session last_activity_at on every queue insert
CREATE OR REPLACE FUNCTION touch_session_activity() RETURNS trigger AS $$
BEGIN
  UPDATE sessions SET last_activity_at = now() WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_queue_item_added ON queue_items;
CREATE TRIGGER on_queue_item_added
  AFTER INSERT ON queue_items
  FOR EACH ROW EXECUTE PROCEDURE touch_session_activity();

-- ── skip_votes ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skip_votes (
  queue_item_id uuid REFERENCES queue_items(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES profiles(id) ON DELETE CASCADE,
  voted_at      timestamptz DEFAULT now(),
  PRIMARY KEY (queue_item_id, user_id)
);
ALTER TABLE skip_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Votes readable"                          ON skip_votes;
DROP POLICY IF EXISTS "Votes insertable by session participant" ON skip_votes;
DROP POLICY IF EXISTS "Votes deletable by self"                 ON skip_votes;
CREATE POLICY "Votes readable"        ON skip_votes FOR SELECT USING (true);
CREATE POLICY "Votes deletable by self" ON skip_votes FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Votes insertable by session participant" ON skip_votes FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM queue_items qi
    JOIN session_participants sp ON sp.session_id = qi.session_id
    WHERE qi.id = skip_votes.queue_item_id AND sp.user_id = auth.uid()
  )
);

-- ── feature_flags ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_flags (
  key         text PRIMARY KEY,
  enabled     boolean NOT NULL DEFAULT false,
  description text,
  updated_at  timestamptz DEFAULT now()
);
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Flags readable by all" ON feature_flags;
CREATE POLICY "Flags readable by all" ON feature_flags FOR SELECT USING (true);

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('JAM_SESSION',         true,  'Core jam session feature'),
  ('VOTE_TO_SKIP',        true,  'Skip voting by participants'),
  ('DJ_TOKEN',            true,  'DJ token pass between participants'),
  ('YOUTUBE_EMBED',       true,  'Embedded YouTube player fallback'),
  ('AUTO_PLAY_QUEUE',     true,  'Auto-advance queue via YouTube IFrame ENDED event'),
  ('PLATFORM_AUTODETECT', true,  'Auto-detect preferred platform from first URL'),
  ('REACTIONS',           false, 'Phase 2: queue reactions'),
  ('CHAT',                false, 'Phase 2: session chat'),
  ('SESSION_HISTORY',     false, 'Phase 2: session history view'),
  ('USER_PROFILES',       false, 'Phase 2: public user profiles'),
  ('SHARED_PLAYLISTS',    false, 'Phase 3: shared persistent playlists'),
  ('DISCOVERY_FEED',      false, 'Phase 3: public song feed'),
  ('TASTE_MATCHING',      false, 'Phase 3: platform taste matching'),
  ('SCHEDULED_JAMS',      false, 'Phase 4: scheduled future sessions'),
  ('QUEUE_RULES',         false, 'Phase 4: queue rule enforcement'),
  ('EMBED_WIDGET',        false, 'Phase 4: embeddable read-only widget')
ON CONFLICT (key) DO NOTHING;

-- ── triggers on auth.users ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

CREATE OR REPLACE FUNCTION handle_dj_leave() RETURNS trigger AS $$
BEGIN
  UPDATE sessions
  SET dj_user_id = host_user_id
  WHERE id = OLD.session_id
    AND dj_user_id = OLD.user_id
    AND host_user_id IS NOT NULL
    AND status != 'ended';
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_participant_leave ON session_participants;
CREATE TRIGGER on_participant_leave
  AFTER DELETE ON session_participants
  FOR EACH ROW EXECUTE PROCEDURE handle_dj_leave();

-- ── RPCs ──────────────────────────────────────────────────────────────────────

-- Patch YouTube link on a queue item (participant-scoped, bypasses RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION patch_youtube_link(p_item_id uuid, p_youtube_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE queue_items
  SET platform_links = jsonb_set(
    COALESCE(platform_links, '{}'),
    '{youtube}',
    to_jsonb(p_youtube_url)
  )
  WHERE id = p_item_id
    AND EXISTS (
      SELECT 1 FROM session_participants sp
      WHERE sp.session_id = queue_items.session_id
        AND sp.user_id = auth.uid()
    );
END;
$$;

-- Atomic queue advance with repeat_mode support
DROP FUNCTION IF EXISTS public.play_next(uuid, text);
DROP FUNCTION IF EXISTS public.play_next(uuid, text, boolean);
CREATE OR REPLACE FUNCTION public.play_next(
  p_session_id  uuid,
  p_skip_status text    DEFAULT 'played',
  p_check_auth  boolean DEFAULT true
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_next_id uuid;
BEGIN
  IF p_check_auth AND NOT EXISTS (
    SELECT 1 FROM sessions
    WHERE id = p_session_id
      AND (host_user_id = auth.uid() OR dj_user_id = auth.uid())
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only the DJ or host can advance the queue';
  END IF;

  UPDATE queue_items SET status = p_skip_status
  WHERE session_id = p_session_id AND status = 'playing';

  SELECT id INTO v_next_id
  FROM queue_items
  WHERE session_id = p_session_id AND status = 'queued'
  ORDER BY position ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_next_id IS NULL THEN
    -- Repeat queue: reset played → queued and restart
    IF EXISTS (SELECT 1 FROM sessions WHERE id = p_session_id AND repeat_mode = 'queue') THEN
      UPDATE queue_items SET status = 'queued'
      WHERE session_id = p_session_id AND status = 'played';

      SELECT id INTO v_next_id
      FROM queue_items
      WHERE session_id = p_session_id AND status = 'queued'
      ORDER BY position ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED;

      IF v_next_id IS NULL THEN
        RETURN NULL;
      END IF;

      UPDATE queue_items SET status = 'playing' WHERE id = v_next_id;
      RETURN v_next_id;
    END IF;

    RETURN NULL;
  END IF;

  UPDATE queue_items SET status = 'playing' WHERE id = v_next_id;
  RETURN v_next_id;
END;
$$;

-- Atomic skip vote + auto-advance when threshold met
CREATE OR REPLACE FUNCTION public.cast_skip_vote(
  p_queue_item_id uuid,
  p_user_id       uuid,
  p_threshold     integer
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_vote_count integer;
  v_session_id uuid;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'User ID mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM queue_items qi
    JOIN session_participants sp ON sp.session_id = qi.session_id
    WHERE qi.id = p_queue_item_id AND sp.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'User is not a participant in this session';
  END IF;

  INSERT INTO skip_votes (queue_item_id, user_id)
  VALUES (p_queue_item_id, p_user_id)
  ON CONFLICT DO NOTHING;

  SELECT COUNT(*) INTO v_vote_count
  FROM skip_votes WHERE queue_item_id = p_queue_item_id;

  IF v_vote_count >= p_threshold THEN
    SELECT session_id INTO v_session_id
    FROM queue_items WHERE id = p_queue_item_id AND status = 'playing';

    IF v_session_id IS NOT NULL THEN
      PERFORM public.play_next(v_session_id, 'skipped', false);
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- Transfer DJ role (host only, target must be a participant)
CREATE OR REPLACE FUNCTION public.pass_dj_token(p_session_id uuid, p_new_dj_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM sessions WHERE id = p_session_id AND host_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the host can pass the DJ token';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM session_participants
    WHERE session_id = p_session_id AND user_id = p_new_dj_user_id
  ) THEN
    RAISE EXCEPTION 'Target user is not a participant in this session';
  END IF;

  UPDATE sessions SET dj_user_id = p_new_dj_user_id WHERE id = p_session_id;
END;
$$;

-- DJ-scoped repeat mode toggle
DROP FUNCTION IF EXISTS public.set_session_repeat(uuid, boolean);
CREATE OR REPLACE FUNCTION public.set_repeat_mode(p_session_id uuid, p_mode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_mode NOT IN ('none', 'song', 'queue') THEN
    RAISE EXCEPTION 'Invalid repeat mode: %', p_mode;
  END IF;
  UPDATE sessions SET repeat_mode = p_mode
  WHERE id = p_session_id AND dj_user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized or session not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_repeat_mode TO authenticated;

-- ── pg_cron: expire stale sessions hourly ─────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'expire-stale-sessions',
      '0 * * * *',
      $job$
        UPDATE sessions
        SET status = 'ended', ended_at = now()
        WHERE status != 'ended'
          AND expires_at < now();
      $job$
    );
  END IF;
END;
$$;

-- ── Realtime ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sessions','session_participants','queue_items','skip_votes'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END;
$$;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    pass  # destructive — no auto-rollback for this baseline
