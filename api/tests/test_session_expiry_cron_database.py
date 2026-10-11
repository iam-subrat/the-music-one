import pytest
from test_independent_mode_database import room_db
from test_skip_queued_vote_database import _load_migration


@pytest.mark.asyncio
async def test_cron_migration_without_extension_keeps_worker_fallback(room_db):
    conn, _, _, sid, _, _ = room_db
    if await conn.fetchval("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron')"):
        pytest.skip('Requires a database without pg_cron')
    migration = _load_migration('012_session_expiry_cron.py')
    await conn.execute(migration._UPGRADE_SQL)
    await conn.execute(migration._DOWNGRADE_SQL)
    assert await conn.fetchval('SELECT status FROM sessions WHERE id=$1', sid) == 'active'


@pytest.mark.asyncio
async def test_cron_migration_creates_updates_and_restores_job(room_db):
    conn, _, _, sid, _, _ = room_db
    if not await conn.fetchval("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron')"):
        pytest.skip('Requires pg_cron for scheduler integration tests')
    migration = _load_migration('012_session_expiry_cron.py')
    job_id = await conn.fetchval("SELECT jobid FROM cron.job WHERE jobname='expire-stale-sessions'")
    await conn.execute('SELECT cron.unschedule($1::bigint)', job_id)
    try:
        await conn.execute(migration._UPGRADE_SQL)
        job = await conn.fetchrow("SELECT * FROM cron.job WHERE jobname='expire-stale-sessions'")
        assert job['schedule'] == '0 */12 * * *'
        assert job['active']
        await conn.execute(migration._UPGRADE_SQL)
        assert await conn.fetchval("SELECT count(*) FROM cron.job WHERE jobname='expire-stale-sessions'") == 1
        assert await conn.fetchval("SELECT jobid FROM cron.job WHERE jobname='expire-stale-sessions'") == job['jobid']
        await conn.execute(migration._DOWNGRADE_SQL)
        assert await conn.fetchval("SELECT schedule FROM cron.job WHERE jobid=$1", job['jobid']) == '0 * * * *'
        await conn.execute(migration._UPGRADE_SQL)
        await conn.execute("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE id=$1", sid)
        await conn.execute(job['command'])
        assert await conn.fetchval('SELECT status FROM sessions WHERE id=$1', sid) == 'ended'
        assert await conn.fetchval('SELECT ended_at IS NOT NULL FROM sessions WHERE id=$1', sid)
    finally:
        await conn.execute("SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='expire-stale-sessions'")
