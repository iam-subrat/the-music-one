import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from app.repositories.queue_repo import QueueRepository
from app.models.queue_item import QueueItem


@pytest.mark.asyncio
async def test_get_next_queued_returns_first_queued():
    db = AsyncMock()
    repo = QueueRepository(db)
    item = QueueItem(
        id=uuid4(), session_id=uuid4(), position=1,
        title="Song", artist="Artist", status="queued",
        platform_links={}, resolve_status="resolving", source_url="https://example.com"
    )
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = item
    db.execute = AsyncMock(return_value=result_mock)

    result = await repo.get_next_queued(uuid4())
    assert result.title == "Song"
    assert result.resolve_status == "resolving"


@pytest.mark.asyncio
async def test_get_next_queued_returns_none_when_empty():
    db = AsyncMock()
    repo = QueueRepository(db)
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result_mock)

    result = await repo.get_next_queued(uuid4())
    assert result is None


@pytest.mark.asyncio
async def test_mark_resolved_executes_update():
    db = AsyncMock()
    repo = QueueRepository(db)
    item_id = uuid4()
    user_id = uuid4()
    meta = {
        "title": "Resolved Song",
        "artist": "Resolved Artist",
        "thumbnailUrl": "https://img.example.com/thumb.jpg",
        "platformLinks": {"spotify": "https://open.spotify.com/track/abc"},
    }

    with patch("app.repositories.queue_repo.set_jwt_claims", new=AsyncMock()) as mock_jwt:
        await repo.mark_resolved(item_id, meta, user_id)
        mock_jwt.assert_called_once_with(db, user_id)

    db.execute.assert_called_once()
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_mark_failed_executes_update():
    db = AsyncMock()
    repo = QueueRepository(db)
    item_id = uuid4()
    user_id = uuid4()

    with patch("app.repositories.queue_repo.set_jwt_claims", new=AsyncMock()) as mock_jwt:
        await repo.mark_failed(item_id, user_id)
        mock_jwt.assert_called_once_with(db, user_id)

    db.execute.assert_called_once()
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_create_stub_creates_resolving_item():
    db = AsyncMock()
    repo = QueueRepository(db)
    session_id = uuid4()
    user_id = uuid4()

    # Mock _get_with_profile to return a stub item
    stub_item = QueueItem(
        id=uuid4(), session_id=session_id, position=1,
        title="Stub Song", artist="Stub Artist", status="queued",
        platform_links={}, resolve_status="resolving",
        source_url="https://open.spotify.com/track/abc"
    )
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = stub_item
    db.execute = AsyncMock(return_value=result_mock)

    result = await repo.create_stub(
        session_id=session_id,
        added_by_user_id=user_id,
        title="Stub Song",
        artist="Stub Artist",
        thumbnail_url=None,
        source_url="https://open.spotify.com/track/abc",
    )

    db.add.assert_called_once()
    added = db.add.call_args[0][0]
    assert added.resolve_status == "resolving"
    assert added.platform_links == {}
    assert added.source_url == "https://open.spotify.com/track/abc"
    assert added.status == "queued"
