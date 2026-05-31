"""client-scoped session participants

Revision ID: 006
Revises: 005
Create Date: 2026-05-31

Adds client_id to session_participants so the same user can connect
from multiple devices/tabs. Reworks the DJ-leave trigger to only fire
when a user's last client disconnects.
"""
from alembic import op

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE session_participants
          ADD COLUMN IF NOT EXISTS client_id text NOT NULL DEFAULT 'legacy',
          ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
        """
    )
    op.execute("ALTER TABLE session_participants DROP CONSTRAINT IF EXISTS session_participants_pkey;")
    op.execute(
        """
        ALTER TABLE session_participants
          ADD CONSTRAINT session_participants_pkey
          PRIMARY KEY (session_id, user_id, client_id);
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_sp_session_user ON session_participants(session_id, user_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_sp_last_seen ON session_participants(last_seen_at);"
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION handle_dj_leave() RETURNS trigger AS $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM session_participants
            WHERE session_id = OLD.session_id AND user_id = OLD.user_id
          ) THEN
            RETURN OLD;
          END IF;
          UPDATE sessions
          SET dj_user_id = host_user_id
          WHERE id = OLD.session_id
            AND dj_user_id = OLD.user_id
            AND host_user_id IS NOT NULL
            AND status != 'ended';
          RETURN OLD;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION evict_stale_clients() RETURNS void AS $$
        BEGIN
          DELETE FROM session_participants
          WHERE last_seen_at < now() - interval '2 minutes';
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
            PERFORM cron.unschedule('evict-stale-clients') FROM cron.job WHERE jobname = 'evict-stale-clients';
            PERFORM cron.schedule(
              'evict-stale-clients',
              '* * * * *',
              $cron$ SELECT public.evict_stale_clients(); $cron$
            );
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
            PERFORM cron.unschedule('evict-stale-clients') FROM cron.job WHERE jobname = 'evict-stale-clients';
          END IF;
        END $$;
        """
    )
    op.execute("DROP FUNCTION IF EXISTS evict_stale_clients();")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION handle_dj_leave() RETURNS trigger AS $$
        BEGIN
          UPDATE sessions
          SET dj_user_id = host_user_id
          WHERE id = OLD.session_id
            AND dj_user_id = OLD.user_id
            AND host_user_id IS NOT NULL
            AND status != 'ended';
          RETURN OLD;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
        """
    )
    op.execute("DROP INDEX IF EXISTS idx_sp_last_seen;")
    op.execute("DROP INDEX IF EXISTS idx_sp_session_user;")
    op.execute("ALTER TABLE session_participants DROP CONSTRAINT IF EXISTS session_participants_pkey;")
    # Temporarily set REPLICA IDENTITY FULL so the dedupe DELETE works while the
    # table is part of the supabase_realtime publication (default replica identity
    # of the dropped PK is no longer valid).
    op.execute("ALTER TABLE session_participants REPLICA IDENTITY FULL;")
    op.execute(
        """
        DELETE FROM session_participants a USING session_participants b
        WHERE a.ctid < b.ctid
          AND a.session_id = b.session_id
          AND a.user_id = b.user_id;
        """
    )
    op.execute(
        """
        ALTER TABLE session_participants
          ADD CONSTRAINT session_participants_pkey PRIMARY KEY (session_id, user_id);
        """
    )
    op.execute("ALTER TABLE session_participants REPLICA IDENTITY DEFAULT;")
    op.execute(
        """
        ALTER TABLE session_participants
          DROP COLUMN IF EXISTS client_id,
          DROP COLUMN IF EXISTS last_seen_at;
        """
    )
