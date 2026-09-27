"""prevent explicitly selecting skipped queue items

Revision ID: 007
Revises: 006
"""

from alembic import op


revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


_UPGRADE_SQL = """
CREATE OR REPLACE FUNCTION public.play_specific_song(
  p_session_id uuid,
  p_item_id uuid,
  p_check_auth boolean DEFAULT true
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_repeat text;
  v_curr_pos bigint;
  v_target_pos bigint;
  v_target_status text;
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

  SELECT position INTO v_curr_pos
  FROM queue_items
  WHERE session_id = p_session_id AND status = 'playing'
  LIMIT 1;

  SELECT position, status INTO v_target_pos, v_target_status
  FROM queue_items
  WHERE session_id = p_session_id AND id = p_item_id;

  IF v_target_pos IS NULL THEN
    RAISE EXCEPTION 'Target item not found in session';
  END IF;

  IF v_target_status = 'skipped' THEN
    RAISE EXCEPTION 'Skipped songs cannot be played';
  END IF;

  IF v_curr_pos IS NOT NULL AND v_curr_pos = v_target_pos THEN
    RETURN p_item_id;
  END IF;

  UPDATE queue_items SET status = 'played'
  WHERE session_id = p_session_id AND status = 'playing';

  IF v_repeat != 'queue' THEN
    UPDATE queue_items SET status = 'skipped'
    WHERE session_id = p_session_id AND status = 'queued' AND position < v_target_pos;
  END IF;

  UPDATE queue_items SET status = 'playing' WHERE id = p_item_id;
  RETURN p_item_id;
END;
$$;
"""


_DOWNGRADE_SQL = """
CREATE OR REPLACE FUNCTION public.play_specific_song(
  p_session_id uuid,
  p_item_id uuid,
  p_check_auth boolean DEFAULT true
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_repeat text;
  v_curr_pos bigint;
  v_target_pos bigint;
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

  SELECT position INTO v_curr_pos
  FROM queue_items
  WHERE session_id = p_session_id AND status = 'playing'
  LIMIT 1;

  SELECT position INTO v_target_pos
  FROM queue_items
  WHERE session_id = p_session_id AND id = p_item_id;

  IF v_target_pos IS NULL THEN
    RAISE EXCEPTION 'Target item not found in session';
  END IF;

  IF v_curr_pos IS NOT NULL AND v_curr_pos = v_target_pos THEN
    RETURN p_item_id;
  END IF;

  UPDATE queue_items SET status = 'played'
  WHERE session_id = p_session_id AND status = 'playing';

  IF v_repeat != 'queue' THEN
    UPDATE queue_items SET status = 'skipped'
    WHERE session_id = p_session_id AND status = 'queued' AND position < v_target_pos;
  END IF;

  UPDATE queue_items SET status = 'playing' WHERE id = p_item_id;
  RETURN p_item_id;
END;
$$;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
