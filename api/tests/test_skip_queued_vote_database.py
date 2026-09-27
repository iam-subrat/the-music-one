"""Database-level contract for skipping a queued song after a majority vote.

Set TEST_DATABASE_URL to run this against an isolated PostgreSQL database.
"""

from importlib.util import module_from_spec, spec_from_file_location
import os
from pathlib import Path
from uuid import uuid4

import asyncpg
import pytest


def _load_migration(filename: str):
    path = Path(__file__).parents[1] / "migrations" / "versions" / filename
    spec = spec_from_file_location(filename.removesuffix(".py"), path)
    module = module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


@pytest.mark.asyncio
@pytest.mark.parametrize("starting_status", ["queued", "played"])
async def test_majority_vote_marks_queue_song_skipped_in_database(starting_status):
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for PostgreSQL integration tests")
    if not database_url.rsplit("/", 1)[-1].startswith("musicone_test"):
        pytest.fail("TEST_DATABASE_URL must point to a database named musicone_test*")

    conn = await asyncpg.connect(database_url)
    voters = [uuid4(), uuid4(), uuid4()]
    session_id = uuid4()
    item_id = uuid4()
    try:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
        await conn.execute("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public")
        await conn.execute("CREATE SCHEMA IF NOT EXISTS auth")
        await conn.execute(
            "CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}')"
        )
        await conn.execute(
            """
            CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
              SELECT current_setting('app.current_user', true)::uuid
            $$
            """
        )

        baseline = _load_migration("001_baseline.py")
        await conn.execute(baseline._UPGRADE_SQL)
        queued_vote = _load_migration("006_skip_queued_song_vote.py")
        await conn.execute(queued_vote._UPGRADE_SQL)

        for voter in voters:
            await conn.execute(
                "INSERT INTO auth.users (id, email) VALUES ($1, $2)", voter, f"{voter}@test.local"
            )
        await conn.execute(
            "INSERT INTO sessions (id, invite_code, host_user_id, dj_user_id, status) VALUES ($1, 'skip-test', $2, $2, 'active')",
            session_id,
            voters[0],
        )
        for voter in voters:
            await conn.execute(
                "INSERT INTO session_participants (session_id, user_id) VALUES ($1, $2)", session_id, voter
            )
        await conn.execute(
            "INSERT INTO queue_items (id, session_id, added_by_user_id, title, artist, status) VALUES ($1, $2, $3, 'Queue song', 'Artist', $4)",
            item_id,
            session_id,
            voters[0],
            starting_status,
        )

        await conn.execute("SELECT set_config('app.current_user', $1, false)", str(voters[0]))
        assert await conn.fetchval("SELECT cast_skip_vote($1, $2, 1)", item_id, voters[0]) is False

        await conn.execute("SELECT set_config('app.current_user', $1, false)", str(voters[1]))
        assert await conn.fetchval("SELECT cast_skip_vote($1, $2, 1)", item_id, voters[1]) is True
        assert await conn.fetchval("SELECT status FROM queue_items WHERE id = $1", item_id) == "skipped"
    finally:
        await conn.close()
