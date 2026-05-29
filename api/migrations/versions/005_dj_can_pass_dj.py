"""allow host OR current DJ to pass DJ token

Revision ID: 005
Revises: 004
Create Date: 2026-05-30
"""
from alembic import op

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None

_UPGRADE_SQL = """
CREATE OR REPLACE FUNCTION public.pass_dj_token(p_session_id uuid, p_new_dj_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM sessions
    WHERE id = p_session_id
      AND (host_user_id = auth.uid() OR dj_user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Only the host or current DJ can pass the DJ token';
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
"""

_DOWNGRADE_SQL = """
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
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
