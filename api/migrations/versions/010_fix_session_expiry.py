"""Restore room expiry defaults and tolerate legacy null expiries."""
from alembic import op

revision = '010'
down_revision = '009'
branch_labels = None
depends_on = None

_OLD_GUARD = "AND expires_at > now() FOR UPDATE;"
_NEW_GUARD = "AND (expires_at IS NULL OR expires_at > now()) FOR UPDATE;"


def _replace_guard(old, new):
    return f"""
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.guard_playback_writes()'::regprocedure)
    INTO definition;
  IF position('{old}' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected queue playback guard definition';
  END IF;
  EXECUTE replace(definition, '{old}', '{new}');
END; $$;
"""


_UPGRADE_SQL = _replace_guard(_OLD_GUARD, _NEW_GUARD) + """
UPDATE sessions SET expires_at = created_at + interval '24 hours'
  WHERE expires_at IS NULL;
"""
_DOWNGRADE_SQL = _replace_guard(_NEW_GUARD, _OLD_GUARD)


def upgrade():
    op.execute(_UPGRADE_SQL)


def downgrade():
    # Retain repaired timestamps and the baseline default; never restore bad data.
    op.execute(_DOWNGRADE_SQL)
