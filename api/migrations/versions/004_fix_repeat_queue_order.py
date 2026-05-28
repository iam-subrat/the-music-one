"""fix repeat=queue ordering by cycling through positions

Revision ID: 004
Revises: 003
Create Date: 2026-05-28
"""
from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None

_UPGRADE_SQL = """
DROP FUNCTION IF EXISTS public.play_next(uuid, text, boolean);
CREATE OR REPLACE FUNCTION public.play_next(
  p_session_id  uuid,
  p_skip_status text    DEFAULT 'played',
  p_check_auth  boolean DEFAULT true
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_next_id  uuid;
  v_curr_pos bigint;
  v_repeat   text;
BEGIN
  IF p_check_auth AND NOT EXISTS (
    SELECT 1 FROM sessions
    WHERE id = p_session_id
      AND (host_user_id = auth.uid() OR dj_user_id = auth.uid())
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only the DJ or host can advance the queue';
  END IF;

  SELECT repeat_mode INTO v_repeat FROM sessions WHERE id = p_session_id;

  IF v_repeat = 'queue' THEN
    SELECT position INTO v_curr_pos
    FROM queue_items
    WHERE session_id = p_session_id AND status = 'playing'
    LIMIT 1;

    UPDATE queue_items SET status = p_skip_status
    WHERE session_id = p_session_id AND status = 'playing';

    -- Next item after current position, skipping permanently-skipped items
    SELECT id INTO v_next_id
    FROM queue_items
    WHERE session_id = p_session_id
      AND status IN ('queued', 'played')
      AND (v_curr_pos IS NULL OR position > v_curr_pos)
    ORDER BY position ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    -- Wrap to lowest position
    IF v_next_id IS NULL THEN
      SELECT id INTO v_next_id
      FROM queue_items
      WHERE session_id = p_session_id
        AND status IN ('queued', 'played')
      ORDER BY position ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED;
    END IF;

    IF v_next_id IS NULL THEN
      RETURN NULL;
    END IF;

    UPDATE queue_items SET status = 'playing' WHERE id = v_next_id;
    RETURN v_next_id;
  END IF;

  -- Non-repeat: original behavior
  UPDATE queue_items SET status = p_skip_status
  WHERE session_id = p_session_id AND status = 'playing';

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
END;
$$;
"""

_DOWNGRADE_SQL = """
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
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
