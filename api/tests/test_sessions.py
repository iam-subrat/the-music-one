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
