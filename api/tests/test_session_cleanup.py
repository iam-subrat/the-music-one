import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from app.repositories.session_repo import SessionRepository
from app.services.session_cleanup import run_session_cleanup


@pytest.mark.asyncio
async def test_cleanup_defaults_to_twelve_hours_after_startup_check():
    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value = []
    db.execute.return_value = result

    @asynccontextmanager
    async def factory():
        yield db

    with patch('app.services.session_cleanup.asyncio.sleep', new_callable=AsyncMock) as sleep:
        sleep.side_effect = asyncio.CancelledError()
        with pytest.raises(asyncio.CancelledError):
            await run_session_cleanup(factory, AsyncMock())
        db.execute.assert_awaited_once()
        db.commit.assert_awaited_once()
        sleep.assert_awaited_once_with(12 * 60 * 60)


@pytest.mark.asyncio
async def test_cleanup_commits_before_notifying_and_cancels_cleanly():
    sid = uuid4()
    result = MagicMock()
    result.scalars.return_value = [sid]
    db = AsyncMock()
    db.execute.return_value = result
    published = asyncio.Event()

    @asynccontextmanager
    async def factory():
        yield db

    async def publish(room, event, payload):
        db.commit.assert_awaited_once()
        assert (room, event, payload) == (str(sid), 'session_updated', {'status': 'ended', 'expired': True})
        published.set()

    task = asyncio.create_task(run_session_cleanup(factory, publish, 60))
    await asyncio.wait_for(published.wait(), 1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task


@pytest.mark.asyncio
async def test_cleanup_retries_after_database_failure():
    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value = []
    db.execute.side_effect = [RuntimeError('database offline'), result]
    recovered = asyncio.Event()
    db.commit.side_effect = lambda: recovered.set()

    @asynccontextmanager
    async def factory():
        yield db

    task = asyncio.create_task(run_session_cleanup(factory, AsyncMock(), 0.01))
    await asyncio.wait_for(recovered.wait(), 1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert db.execute.await_count == 2


@pytest.mark.asyncio
async def test_heartbeat_returns_renewed_deadline_and_rejects_closed_rooms():
    db = AsyncMock()
    result = MagicMock()
    expiry = datetime.now(timezone.utc)
    result.scalar_one_or_none.return_value = expiry
    db.execute.return_value = result
    repo = SessionRepository(db)
    assert await repo.touch(uuid4()) == expiry
    sql = str(db.execute.call_args.args[0])
    assert 'sessions.status =' in sql and 'sessions.expires_at > now()' in sql
    result.scalar_one_or_none.return_value = None
    with pytest.raises(HTTPException) as error:
        await repo.touch(uuid4())
    assert error.value.status_code == 409
