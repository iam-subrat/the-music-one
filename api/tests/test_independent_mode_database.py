"""Run only against the disposable musicone_test* database configured for tests."""
import asyncio
import os
from uuid import uuid4
import asyncpg
import pytest
import pytest_asyncio
from test_skip_queued_vote_database import _load_migration


@pytest_asyncio.fixture
async def room_db():
    url = os.getenv('TEST_DATABASE_URL')
    if not url:
        pytest.skip('TEST_DATABASE_URL required')
    assert url.rsplit('/', 1)[-1].startswith('musicone_test')
    conn = await asyncpg.connect(url)
    await conn.execute('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE SCHEMA IF NOT EXISTS auth')
    await conn.execute("DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$")
    await conn.execute("DO $$ BEGIN CREATE PUBLICATION supabase_realtime; EXCEPTION WHEN duplicate_object THEN NULL; END $$")
    await conn.execute("CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}')")
    await conn.execute("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.current_user', true), '')::uuid $$")
    for name in ['001_baseline.py', '002_playlist_queue_fields.py', '003_feature_flag_song_search.py',
                 'e4e47f494bb3_add_play_specific_and_play_previous.py', '004_fix_repeat_queue_order.py',
                 '005_dj_can_pass_dj.py', '006_skip_queued_song_vote.py', '007_never_play_skipped_songs.py',
                 '008_fix_played_queue_skip_vote.py', '794d25c627f8_add_auto_pilot_to_sessions.py', '009_independent_playback.py']:
        migration = _load_migration(name)
        await conn.execute(getattr(migration, '_UPGRADE_SQL', getattr(migration, '_SKIP_VOTE_SQL', '')))
    host, guest, sid, iid = uuid4(), uuid4(), uuid4(), uuid4()
    for uid in [host, guest]:
        await conn.execute('INSERT INTO auth.users(id,email) VALUES($1,$2)', uid, str(uid)+'@test.local')
    await conn.execute("INSERT INTO sessions(id,invite_code,host_user_id,dj_user_id,status) VALUES($1,$2,$3,$3,'active')", sid, str(sid)[:6], host)
    for uid in [host, guest]:
        await conn.execute('INSERT INTO session_participants(session_id,user_id) VALUES($1,$2)', sid, uid)
    await conn.execute("INSERT INTO queue_items(id,session_id,title,artist,status) VALUES($1,$2,'Song','Artist','queued')", iid, sid)
    await conn.execute("UPDATE feature_flags SET enabled=true WHERE key='INDEPENDENT_PLAYBACK'")
    await conn.execute("SELECT set_config('app.current_user',$1,false)", str(host))
    try:
        yield conn, host, guest, sid, iid, url
    finally:
        await conn.close()


async def switch(conn, sid, mode, version):
    await conn.execute('SELECT set_playback_mode($1,$2,$3)', sid, mode, version)


@pytest.mark.asyncio
async def test_independent_rejects_all_global_rpcs_and_direct_status_writes(room_db):
    c, host, guest, sid, iid, _ = room_db
    await switch(c, sid, 'independent', 0)
    calls = [('SELECT play_next($1)', [sid]), ('SELECT play_next($1,\'played\',false)', [sid]),
             ('SELECT play_specific_song($1,$2,true)', [sid,iid]), ('SELECT play_previous_song($1,true)', [sid]),
             ('SELECT cast_skip_vote($1,$2,1)', [iid,host]), ('SELECT pass_dj_token($1,$2)', [sid,guest]),
             ("SELECT set_repeat_mode($1,'queue')", [sid]),
             ("UPDATE queue_items SET status='playing' WHERE id=$1", [iid]),
             ('UPDATE sessions SET auto_pilot=true WHERE id=$1', [sid])]
    calls.extend([
        ("INSERT INTO queue_items(session_id,title,artist,status) VALUES($1,'Bad','Bad','playing')", [sid]),
        ("INSERT INTO skip_votes(queue_item_id,user_id) VALUES($1,$2)", [iid,host]),
        ("UPDATE sessions SET playback_mode='dj' WHERE id=$1", [sid]),
    ])
    for sql, args in calls:
        with pytest.raises(asyncpg.RaiseError, match='Playback conflict:'):
            await c.execute(sql, *args)
    assert await c.fetchval('SELECT status FROM queue_items WHERE id=$1', iid) == 'queued'
    assert await c.fetchval('SELECT count(*) FROM skip_votes') == 0


@pytest.mark.asyncio
async def test_flag_disabled_blocks_new_mode_but_keeps_existing_catalog(room_db):
    c, host, guest, sid, iid, _ = room_db
    await c.execute("UPDATE feature_flags SET enabled=false WHERE key='YOUTUBE_EMBED'")
    with pytest.raises(asyncpg.RaiseError, match='Playback conflict:'):
        await switch(c, sid, 'independent', 0)
    await c.execute("UPDATE feature_flags SET enabled=true WHERE key='YOUTUBE_EMBED'")
    await switch(c, sid, 'independent', 0)
    await c.execute("UPDATE feature_flags SET enabled=false WHERE key='INDEPENDENT_PLAYBACK'")
    await c.execute("INSERT INTO queue_items(session_id,title,artist,status) VALUES($1,'New','Artist','queued')", sid)
    assert await c.fetchval('SELECT count(*) FROM queue_items WHERE session_id=$1', sid) == 2
    await switch(c, sid, 'dj', 1)


@pytest.mark.asyncio
async def test_host_permission_idempotence_and_stale_epoch(room_db):
    c, host, guest, sid, iid, _ = room_db
    await c.execute("SELECT set_config('app.current_user',$1,false)", str(guest))
    with pytest.raises(asyncpg.RaiseError, match='Only the host'):
        await switch(c,sid,'independent',0)
    await c.execute("SELECT set_config('app.current_user',$1,false)", str(host))
    await switch(c,sid,'independent',0)
    await switch(c,sid,'independent',1)
    assert await c.fetchval('SELECT playback_mode_version FROM sessions WHERE id=$1',sid) == 1
    await switch(c,sid,'dj',1)
    with pytest.raises(asyncpg.RaiseError, match='Playback conflict:'):
        await c.execute('SELECT play_next($1)', sid)
    await c.execute("SELECT set_config('app.playback_mode_version','2',false)")
    assert await c.fetchval('SELECT play_next($1)',sid) == iid


@pytest.mark.asyncio
async def test_competing_mode_updates_serialize(room_db):
    c, host, _, sid, _, url = room_db
    other = await asyncpg.connect(url)
    await other.execute("SELECT set_config('app.current_user',$1,false)", str(host))
    try:
        result = await asyncio.gather(switch(c,sid,'independent',0), switch(other,sid,'independent',0), return_exceptions=True)
        assert sum(isinstance(x, asyncpg.RaiseError) for x in result) == 1
        assert await c.fetchval('SELECT playback_mode_version FROM sessions WHERE id=$1',sid) == 1
    finally:
        await other.close()


@pytest.mark.asyncio
async def test_downgrade_refuses_active_independent_rooms_then_restores_rpc(room_db):
    c, _, _, sid, iid, _ = room_db
    migration = _load_migration('009_independent_playback.py')
    await switch(c,sid,'independent',0)
    with pytest.raises(asyncpg.RaiseError, match='End or convert'):
        await c.execute(migration._DOWNGRADE_SQL)
    await switch(c,sid,'dj',1)
    await c.execute(migration._DOWNGRADE_SQL)
    assert await c.fetchval('SELECT play_next($1)',sid) == iid
