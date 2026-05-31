import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
from app.repositories.session_repo import SessionRepository
from app.models.session import Session


@pytest.mark.asyncio
async def test_get_session_by_code_returns_session():
    db = AsyncMock()
    repo = SessionRepository(db)
    session_id = uuid4()
    mock_session = Session(id=session_id, invite_code="ABC123", status="active", repeat_mode="none", max_participants=20)
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = mock_session
    db.execute = AsyncMock(return_value=result_mock)

    result = await repo.get_by_code("ABC123")
    assert result is mock_session


@pytest.mark.asyncio
async def test_get_session_by_code_returns_none_for_unknown():
    db = AsyncMock()
    repo = SessionRepository(db)
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result_mock)

    result = await repo.get_by_code("XXXXXX")
    assert result is None


@pytest.mark.asyncio
async def test_join_passes_client_id_to_insert():
    db = AsyncMock()
    repo = SessionRepository(db)
    session_id = uuid4()
    user_id = uuid4()

    await repo.join(session_id, user_id, client_id="client-abc")

    db.execute.assert_awaited()
    db.commit.assert_awaited()
    stmt = db.execute.await_args.args[0]
    compiled = stmt.compile(compile_kwargs={"literal_binds": True})
    assert "'client-abc'" in str(compiled)


@pytest.mark.asyncio
async def test_leave_deletes_only_specified_client():
    db = AsyncMock()
    repo = SessionRepository(db)
    session_id = uuid4()
    user_id = uuid4()

    await repo.leave(session_id, user_id, client_id="client-xyz")

    db.execute.assert_awaited()
    stmt = db.execute.await_args.args[0]
    compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
    assert "'client-xyz'" in compiled
    assert "client_id" in compiled


@pytest.mark.asyncio
async def test_touch_client_updates_last_seen():
    db = AsyncMock()
    repo = SessionRepository(db)
    session_id = uuid4()
    user_id = uuid4()

    await repo.touch_client(session_id, user_id, client_id="client-1")

    db.execute.assert_awaited()
    db.commit.assert_awaited()
