-- User profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  preferred_platform text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public profiles readable" ON profiles;
DROP POLICY IF EXISTS "Own profile editable"     ON profiles;
DROP POLICY IF EXISTS "Profile auto-created"     ON profiles;
CREATE POLICY "Public profiles readable" ON profiles FOR SELECT USING (true);
CREATE POLICY "Own profile editable"     ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Profile auto-created"     ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Jam sessions
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code text UNIQUE NOT NULL,
  host_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  dj_user_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','active','ended')),
  max_participants integer DEFAULT 20,
  created_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  last_activity_at timestamptz DEFAULT now()
);
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Sessions readable"            ON sessions;
DROP POLICY IF EXISTS "Sessions creatable by authed" ON sessions;
DROP POLICY IF EXISTS "Sessions updatable by host"   ON sessions;
CREATE POLICY "Sessions readable"           ON sessions FOR SELECT USING (true);
CREATE POLICY "Sessions creatable by authed" ON sessions FOR INSERT WITH CHECK (auth.uid() = host_user_id);
CREATE POLICY "Sessions updatable by host"  ON sessions FOR UPDATE USING (auth.uid() = host_user_id OR auth.uid() = dj_user_id);

-- Session expiry column (idempotent)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT now() + interval '24 hours';

-- Participants
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

-- Queue items
-- position uses GENERATED ALWAYS AS IDENTITY + UNIQUE per session → prevents race condition
CREATE TABLE IF NOT EXISTS queue_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid REFERENCES sessions(id) ON DELETE CASCADE,
  added_by_user_id  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  position          bigint GENERATED ALWAYS AS IDENTITY,
  title             text NOT NULL,
  artist            text NOT NULL,
  thumbnail_url     text,
  platform_links    jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','playing','played','skipped')),
  added_at timestamptz DEFAULT now(),
  UNIQUE (session_id, position)
);
ALTER TABLE queue_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Queue readable"                  ON queue_items;
DROP POLICY IF EXISTS "Queue insertable by participant" ON queue_items;
DROP POLICY IF EXISTS "Queue updatable by dj or host"   ON queue_items;
CREATE POLICY "Queue readable"                ON queue_items FOR SELECT USING (true);
CREATE POLICY "Queue insertable by participant" ON queue_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM session_participants WHERE session_id = queue_items.session_id AND user_id = auth.uid())
);
CREATE POLICY "Queue updatable by dj or host" ON queue_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM sessions WHERE id = queue_items.session_id AND (host_user_id = auth.uid() OR dj_user_id = auth.uid()))
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

-- Skip votes
CREATE TABLE IF NOT EXISTS skip_votes (
  queue_item_id uuid REFERENCES queue_items(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES profiles(id) ON DELETE CASCADE,
  voted_at      timestamptz DEFAULT now(),
  PRIMARY KEY (queue_item_id, user_id)
);
ALTER TABLE skip_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Votes readable"                          ON skip_votes;
DROP POLICY IF EXISTS "Votes insertable by session participant" ON skip_votes;
CREATE POLICY "Votes readable" ON skip_votes FOR SELECT USING (true);
CREATE POLICY "Votes insertable by session participant" ON skip_votes FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM queue_items qi
    JOIN session_participants sp ON sp.session_id = qi.session_id
    WHERE qi.id = skip_votes.queue_item_id AND sp.user_id = auth.uid()
  )
);

-- Feature flags
CREATE TABLE IF NOT EXISTS feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Flags readable by all" ON feature_flags;
CREATE POLICY "Flags readable by all" ON feature_flags FOR SELECT USING (true);

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('JAM_SESSION',          true,  'Core jam session feature'),
  ('VOTE_TO_SKIP',         true,  'Skip voting by participants'),
  ('DJ_TOKEN',             true,  'DJ token pass between participants'),
  ('YOUTUBE_EMBED',        true,  'Embedded YouTube player fallback'),
  ('PLATFORM_AUTODETECT',  true,  'Auto-detect preferred platform from first URL'),
  ('REACTIONS',            false, 'Phase 2: queue reactions'),
  ('CHAT',                 false, 'Phase 2: session chat'),
  ('SESSION_HISTORY',      false, 'Phase 2: session history view'),
  ('USER_PROFILES',        false, 'Phase 2: public user profiles'),
  ('SHARED_PLAYLISTS',     false, 'Phase 3: shared persistent playlists'),
  ('DISCOVERY_FEED',       false, 'Phase 3: public song feed'),
  ('TASTE_MATCHING',       false, 'Phase 3: platform taste matching'),
  ('SCHEDULED_JAMS',       false, 'Phase 4: scheduled future sessions'),
  ('QUEUE_RULES',          false, 'Phase 4: queue rule enforcement'),
  ('EMBED_WIDGET',         false, 'Phase 4: embeddable read-only widget')
ON CONFLICT (key) DO NOTHING;

-- Trigger: when DJ leaves, auto-promote host as DJ
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

-- Cron job: mark expired sessions as ended (requires pg_cron extension)
-- Enable in Supabase: Dashboard → Database → Extensions → pg_cron
SELECT cron.schedule(
  'expire-stale-sessions',
  '0 * * * *',
  $$
    UPDATE sessions
    SET status = 'ended', ended_at = now()
    WHERE status != 'ended'
      AND expires_at < now();
  $$
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
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

-- Enable Realtime for all tables that use postgres_changes subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE
  sessions,
  session_participants,
  queue_items,
  skip_votes;
