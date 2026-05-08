-- supabase/migrations/20260503000004_repeat_mode.sql

-- Add repeat_mode column
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS repeat_mode text NOT NULL DEFAULT 'none'
  CHECK (repeat_mode IN ('none', 'song', 'queue'));

-- Migrate existing repeat boolean values (true → 'song', false → 'none')
UPDATE sessions SET repeat_mode = 'song' WHERE repeat = true;

-- Drop old boolean column
ALTER TABLE sessions DROP COLUMN IF EXISTS repeat;

-- Drop old repeat RPC
DROP FUNCTION IF EXISTS set_session_repeat(uuid, boolean);

-- New DJ-scoped RPC: only updates repeat_mode, enforces dj_user_id server-side
CREATE OR REPLACE FUNCTION set_repeat_mode(p_session_id uuid, p_mode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_mode NOT IN ('none', 'song', 'queue') THEN
    RAISE EXCEPTION 'Invalid repeat mode: %', p_mode;
  END IF;
  UPDATE sessions SET repeat_mode = p_mode
  WHERE id = p_session_id AND dj_user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION set_repeat_mode TO authenticated;

-- Enhance play_next: when queue exhausted + repeat_mode='queue', reset played→queued atomically
CREATE OR REPLACE FUNCTION public.play_next(p_session_id uuid, p_skip_status text DEFAULT 'played', p_check_auth boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
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

  -- FOR UPDATE SKIP LOCKED prevents two concurrent calls from both picking same item
  SELECT id INTO v_next_id
  FROM queue_items
  WHERE session_id = p_session_id AND status = 'queued'
  ORDER BY position ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_next_id IS NULL THEN
    -- Queue repeat: reset all played songs and restart from top
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
        RETURN NULL; -- Only skipped songs remain — truly empty
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
