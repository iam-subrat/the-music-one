import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
from app.repositories.queue_repo import QueueRepository
from app.models.queue_item import QueueItem


@pytest.mark.asyncio
async def test_get_queue_returns_ordered_items():
    db = AsyncMock()
    repo = QueueRepository(db)
    item1 = QueueItem(id=uuid4(), session_id=uuid4(), position=1, title="Song A", artist="Artist A", status="queued", platform_links={})
    item2 = QueueItem(id=uuid4(), session_id=uuid4(), position=2, title="Song B", artist="Artist B", status="queued", platform_links={})
    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = [item1, item2]
    db.execute = AsyncMock(return_value=result_mock)

    items = await repo.get_queue(uuid4())
    assert len(items) == 2
    assert items[0].title == "Song A"
