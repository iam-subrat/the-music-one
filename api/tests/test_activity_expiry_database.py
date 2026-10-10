from datetime import timedelta
from uuid import uuid4

import asyncpg
import pytest
from test_independent_mode_database import room_db
from test_skip_queued_vote_database import _load_migration
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.services.session_cleanup import expire_stale_sessions
from app.repositories.session_repo import SessionRepository
from fastapi import HTTPException


@pytest.mark.asyncio
async def test_heartbeat_renews_deadline(room_db):
    c, host, guest, sid, iid, _ = room_db
    await c.execute("UPDATE sessions SET last_activity_at = now() + interval '1 minute' WHERE id=$1", sid)
    room = await c.fetchrow('SELECT last_activity_at, expires_at FROM sessions WHERE id=$1', sid)
    assert room['expires_at'] == room['last_activity_at'] + timedelta(days=15)


@pytest.mark.asyncio
async def test_expired_heartbeat_cannot_revive_room(room_db):
    c, host, guest, sid, iid, _ = room_db
    await c.execute("UPDATE sessions SET expires_at = now() - interval '1 second' WHERE id=$1", sid)
    with pytest.raises(asyncpg.RaiseError, match='Playback conflict: room is inactive'):
        await c.execute('UPDATE sessions SET last_activity_at = now() WHERE id=$1', sid)


@pytest.mark.asyncio
async def test_ended_room_keeps_deadline_when_activity_changes(room_db):
    c, host, guest, sid, iid, _ = room_db
    original = await c.fetchval('SELECT expires_at FROM sessions WHERE id=$1', sid)
    await c.execute("UPDATE sessions SET status='ended', ended_at=now() WHERE id=$1", sid)
    await c.execute("UPDATE sessions SET last_activity_at=now() + interval '1 minute' WHERE id=$1", sid)
    assert await c.fetchval('SELECT expires_at FROM sessions WHERE id=$1', sid) == original


@pytest.mark.asyncio
async def test_migration_repairs_recent_activity_without_reopening_ended_rooms(room_db):
    c, host, guest, sid, iid, _ = room_db
    migration = _load_migration('011_activity_based_expiry.py')
    await c.execute(migration._DOWNGRADE_SQL)
    await c.execute("UPDATE sessions SET created_at=now()-interval '2 days', last_activity_at=now()-interval '1 hour', expires_at=now()-interval '1 day' WHERE id=$1", sid)
    stale, ended = uuid4(), uuid4()
    await c.execute("""INSERT INTO sessions(id,invite_code,status,created_at,last_activity_at,expires_at,ended_at)
        VALUES ($1,'STALE1','active',now()-interval '17 days',now()-interval '16 days',now()-interval '2 days',NULL),
               ($2,'ENDED1','ended',now()-interval '3 days',now(),now()-interval '2 days',now()-interval '1 day')""", stale, ended)
    ended_at = await c.fetchval('SELECT ended_at FROM sessions WHERE id=$1', ended)
    await c.execute(migration._UPGRADE_SQL)
    assert await c.fetchval('SELECT status FROM sessions WHERE id=$1', sid) == 'active'
    assert await c.fetchval("SELECT expires_at = last_activity_at + interval '15 days' FROM sessions WHERE id=$1", sid)
    assert await c.fetchval('SELECT status FROM sessions WHERE id=$1', stale) == 'ended'
    assert await c.fetchval('SELECT ended_at FROM sessions WHERE id=$1', ended) == ended_at
    await c.execute(migration._DOWNGRADE_SQL)
    assert await c.fetchval("SELECT expires_at = created_at + interval '24 hours' FROM sessions WHERE id=$1", sid)
    assert await c.fetchval('SELECT ended_at FROM sessions WHERE id=$1', ended) == ended_at


@pytest.mark.asyncio
@pytest.mark.parametrize('cleanup', ['worker', 'pg_cron'])
async def test_cleanup_respects_fifteen_day_inactivity_window(room_db, cleanup):
    c, host, guest, sid, iid, url = room_db
    await c.execute("UPDATE sessions SET last_activity_at=now()-interval '14 days' WHERE id=$1", sid)
    stale = uuid4()
    await c.execute("""INSERT INTO sessions(id,invite_code,status,created_at,last_activity_at)
        VALUES ($1,'OLD15D','active',now()-interval '17 days',now()-interval '16 days')""", stale)

    if cleanup == 'pg_cron':
        cron_sql = _load_migration('001_baseline.py')._UPGRADE_SQL.split('$job$')[1]
        await c.execute(cron_sql)
    else:
        engine = create_async_engine(url.replace('postgresql://', 'postgresql+asyncpg://'))
        try:
            async with async_sessionmaker(engine)() as db:
                assert await expire_stale_sessions(db) == [stale]
        finally:
            await engine.dispose()

    assert await c.fetchval('SELECT status FROM sessions WHERE id=$1', sid) == 'active'
    assert await c.fetchval('SELECT status FROM sessions WHERE id=$1', stale) == 'ended'


@pytest.mark.asyncio
async def test_cleanup_works_without_cron_and_is_idempotent(room_db):
    c, host, guest, sid, iid, url = room_db
    assert not await c.fetchval("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron')")
    await c.execute("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE id=$1", sid)
    engine = create_async_engine(url.replace('postgresql://', 'postgresql+asyncpg://'))
    try:
        async with async_sessionmaker(engine)() as db:
            assert await expire_stale_sessions(db) == [sid]
            assert await expire_stale_sessions(db) == []
        assert await c.fetchval('SELECT status FROM sessions WHERE id=$1', sid) == 'ended'
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_adding_song_renews_deadline(room_db):
    c, host, guest, sid, iid, _ = room_db
    await c.execute("UPDATE sessions SET expires_at=now()+interval '1 hour' WHERE id=$1", sid)
    await c.execute("INSERT INTO queue_items(session_id,title,artist,status) VALUES($1,'Another','Artist','queued')", sid)
    assert await c.fetchval("SELECT expires_at = last_activity_at + interval '15 days' FROM sessions WHERE id=$1", sid)


@pytest.mark.asyncio
async def test_join_near_deadline_renews_atomically_but_stale_join_is_rejected(room_db):
    c, host, guest, sid, iid, url = room_db
    await c.execute('DELETE FROM session_participants WHERE session_id=$1 AND user_id=$2', sid, guest)
    await c.execute("UPDATE sessions SET expires_at=now()+interval '10 seconds' WHERE id=$1", sid)
    engine = create_async_engine(url.replace('postgresql://', 'postgresql+asyncpg://'))
    try:
        async with async_sessionmaker(engine)() as db:
            expiry = await SessionRepository(db).join(sid, guest)
        assert expiry == await c.fetchval('SELECT expires_at FROM sessions WHERE id=$1', sid)
        assert await c.fetchval("SELECT expires_at > now()+interval '14 days' FROM sessions WHERE id=$1", sid)
        await c.execute('DELETE FROM session_participants WHERE session_id=$1 AND user_id=$2', sid, guest)
        await c.execute("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE id=$1", sid)
        async with async_sessionmaker(engine)() as db:
            with pytest.raises(HTTPException) as error:
                await SessionRepository(db).join(sid, guest)
            assert error.value.status_code == 409
        assert not await c.fetchval('SELECT EXISTS(SELECT 1 FROM session_participants WHERE session_id=$1 AND user_id=$2)', sid, guest)
    finally:
        await engine.dispose()
