import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
from app.repositories.profile_repo import ProfileRepository
from app.models.profile import Profile


@pytest.mark.asyncio
async def test_get_profile_by_id_returns_profile():
    db = AsyncMock()
    repo = ProfileRepository(db)
    user_id = uuid4()
    mock_profile = Profile(id=user_id, display_name="Alice", avatar_url=None, preferred_platform="spotify")
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = mock_profile
    db.execute = AsyncMock(return_value=result_mock)

    result = await repo.get_by_id(user_id)
    assert result is mock_profile


@pytest.mark.asyncio
async def test_get_profile_by_id_returns_none_when_missing():
    db = AsyncMock()
    repo = ProfileRepository(db)
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result_mock)

    result = await repo.get_by_id(uuid4())
    assert result is None
