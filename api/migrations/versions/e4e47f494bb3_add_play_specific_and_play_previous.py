"""add play_specific and play_previous

Revision ID: e4e47f494bb3
Revises: 005
Create Date: 2026-09-05 21:31:10.232182

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e4e47f494bb3"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


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

CREATE OR REPLACE FUNCTION public.play_previous_song(
  p_session_id uuid,
  p_check_auth boolean DEFAULT true
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_repeat text;
  v_curr_pos bigint;
  v_prev_id uuid;
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

  IF v_curr_pos IS NOT NULL THEN
    SELECT id INTO v_prev_id
    FROM queue_items
    WHERE session_id = p_session_id
      AND status IN ('played', 'queued')
      AND position < v_curr_pos
    ORDER BY position DESC
    LIMIT 1;
  ELSE
    SELECT id INTO v_prev_id
    FROM queue_items
    WHERE session_id = p_session_id
      AND status IN ('played', 'queued')
    ORDER BY position DESC
    LIMIT 1;
  END IF;

  IF v_prev_id IS NULL AND v_repeat = 'queue' THEN
    SELECT id INTO v_prev_id
    FROM queue_items
    WHERE session_id = p_session_id
      AND status IN ('played', 'queued')
    ORDER BY position DESC
    LIMIT 1;
  END IF;

  IF v_prev_id IS NOT NULL THEN
    UPDATE queue_items SET status = 'queued' WHERE session_id = p_session_id AND status = 'playing';
    UPDATE queue_items SET status = 'playing' WHERE id = v_prev_id;
    RETURN v_prev_id;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.play_specific_song TO authenticated;
GRANT EXECUTE ON FUNCTION public.play_previous_song TO authenticated;
"""

_DOWNGRADE_SQL = """
DROP FUNCTION IF EXISTS public.play_specific_song(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS public.play_previous_song(uuid, boolean);
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
