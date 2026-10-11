"""Expire sessions after 15 days of inactivity."""
from alembic import op

revision = '011'
down_revision = '010'
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""
ALTER TABLE sessions ALTER COLUMN expires_at SET DEFAULT now() + interval '15 days';
UPDATE sessions SET expires_at = coalesce(last_activity_at, created_at) + interval '15 days'
  WHERE status != 'ended';
UPDATE sessions SET status = 'ended', ended_at = now()
  WHERE status != 'ended' AND expires_at <= now();

CREATE FUNCTION public.renew_session_expiry() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status != 'ended' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.last_activity_at := coalesce(NEW.last_activity_at, NEW.created_at, now());
      NEW.expires_at := NEW.last_activity_at + interval '15 days';
    ELSIF NEW.last_activity_at IS DISTINCT FROM OLD.last_activity_at THEN
      IF OLD.status = 'ended' OR OLD.expires_at <= now() THEN
        RAISE EXCEPTION 'Playback conflict: room is inactive';
      END IF;
      NEW.last_activity_at := greatest(OLD.last_activity_at, coalesce(NEW.last_activity_at, now()));
      NEW.expires_at := NEW.last_activity_at + interval '15 days';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER renew_session_expiry BEFORE INSERT OR UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION renew_session_expiry();
CREATE INDEX sessions_pending_expiry_idx ON sessions(expires_at) WHERE status != 'ended';
"""

_DOWNGRADE_SQL = r"""
DROP TRIGGER renew_session_expiry ON sessions;
DROP FUNCTION public.renew_session_expiry();
DROP INDEX sessions_pending_expiry_idx;
ALTER TABLE sessions ALTER COLUMN expires_at SET DEFAULT now() + interval '24 hours';
UPDATE sessions SET expires_at = created_at + interval '24 hours' WHERE status != 'ended';
"""


def upgrade():
    op.execute(_UPGRADE_SQL)


def downgrade():
    op.execute(_DOWNGRADE_SQL)
