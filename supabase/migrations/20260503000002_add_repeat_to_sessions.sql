ALTER TABLE sessions ADD COLUMN IF NOT EXISTS repeat boolean DEFAULT false NOT NULL;

-- Expand UPDATE policy so DJ (who may differ from host) can toggle repeat
DROP POLICY IF EXISTS "Sessions updatable by host" ON sessions;
CREATE POLICY "Sessions updatable by host or dj" ON sessions
  FOR UPDATE USING (
    auth.uid() = host_user_id OR auth.uid() = dj_user_id
  );
