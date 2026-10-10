"""Schedule session expiry cleanup every twelve hours when pg_cron is enabled."""
from alembic import op

revision = '012'
down_revision = '011'
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'expire-stale-sessions',
      '0 */12 * * *',
      $job$
        UPDATE public.sessions
        SET status = 'ended', ended_at = now()
        WHERE status != 'ended' AND expires_at <= now();
      $job$
    );
  ELSE
    RAISE NOTICE 'pg_cron is not enabled; API session expiry cleanup remains the fallback';
  END IF;
END;
$$;
"""

_DOWNGRADE_SQL = _UPGRADE_SQL.replace('0 */12 * * *', '0 * * * *')


def upgrade():
    op.execute(_UPGRADE_SQL)


def downgrade():
    op.execute(_DOWNGRADE_SQL)
