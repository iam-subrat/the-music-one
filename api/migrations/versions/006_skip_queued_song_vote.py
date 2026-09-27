"""skip queued songs when a majority vote is reached

Revision ID: 006
Revises: e4e47f494bb3
"""

from alembic import op


revision = "006"
down_revision = "e4e47f494bb3"
branch_labels = None
depends_on = None


_UPGRADE_SQL = """
CREATE OR REPLACE FUNCTION public.cast_skip_vote(
  p_queue_item_id uuid,
  p_user_id       uuid,
  p_threshold     integer
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_vote_count integer;
  v_threshold integer;
  v_session_id uuid;
  v_status text;
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

  SELECT GREATEST(1, COUNT(*) / 2 + 1) INTO v_threshold
  FROM session_participants
  WHERE session_id = (
    SELECT session_id FROM queue_items WHERE id = p_queue_item_id
  );

  IF v_vote_count < v_threshold THEN
    RETURN false;
  END IF;

  SELECT session_id, status INTO v_session_id, v_status
  FROM queue_items WHERE id = p_queue_item_id;

  IF v_status = 'playing' THEN
    PERFORM public.play_next(v_session_id, 'skipped', false);
    RETURN true;
  END IF;

  IF v_status = 'queued' THEN
    UPDATE queue_items SET status = 'skipped'
    WHERE id = p_queue_item_id AND status = 'queued';
    RETURN FOUND;
  END IF;

  RETURN false;
END;
$$;
"""


_DOWNGRADE_SQL = """
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
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
