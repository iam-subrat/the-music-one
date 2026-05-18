import pytest
from unittest.mock import ANY, AsyncMock, MagicMock, patch
from uuid import uuid4
from app.services.queue_service import QueueService
from app.models.queue_item import QueueItem
from fastapi import HTTPException


def _make_svc(queue_repo=None, vote_repo=None, song_svc=None):
    return QueueService(
        queue_repo or AsyncMock(),
        vote_repo or AsyncMock(),
        song_svc or AsyncMock(),
    )


def _make_item(resolve_status="resolved", status="queued", source_url=None):
    item = MagicMock(spec=QueueItem)
    item.id = uuid4()
    item.session_id = uuid4()
    item.resolve_status = resolve_status
    item.status = status
    item.source_url = source_url or "https://open.spotify.com/track/abc"
    return item


# ── add_batch ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_add_batch_creates_stubs_for_all_tracks():
    repo = AsyncMock()
    stub = _make_item(resolve_status="resolving")
    repo.create_stub = AsyncMock(return_value=stub)
    svc = _make_svc(queue_repo=repo)

    tracks = [
        {"url": "https://open.spotify.com/track/a", "title": "Song A", "artist": "Artist A", "thumbnail_url": None},
        {"url": "https://open.spotify.com/track/b", "title": "Song B", "artist": "Artist B", "thumbnail_url": "https://img.example.com/b.jpg"},
    ]
    session_id = uuid4()
    user_id = uuid4()

    result = await svc.add_batch(session_id, user_id, tracks)

    assert repo.create_stub.call_count == 2
    assert len(result) == 2


@pytest.mark.asyncio
async def test_add_batch_skips_failed_stub_creation():
    repo = AsyncMock()
    stub = _make_item(resolve_status="resolving")
    repo.create_stub = AsyncMock(side_effect=[stub, Exception("DB error"), stub])
    svc = _make_svc(queue_repo=repo)

    tracks = [
        {"url": "https://open.spotify.com/track/a", "title": "A", "artist": "AA", "thumbnail_url": None},
        {"url": "https://open.spotify.com/track/b", "title": "B", "artist": "BB", "thumbnail_url": None},
        {"url": "https://open.spotify.com/track/c", "title": "C", "artist": "CC", "thumbnail_url": None},
    ]
    result = await svc.add_batch(uuid4(), uuid4(), tracks)
    assert len(result) == 2


# ── play_next (lazy resolve) ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_play_next_resolves_resolving_item_before_playing():
    repo = AsyncMock()
    song_svc = AsyncMock()
    next_item = _make_item(resolve_status="resolving", source_url="https://open.spotify.com/track/x")
    repo.get_next_queued = AsyncMock(return_value=next_item)
    song_svc.resolve_song_meta = AsyncMock(return_value={
        "title": "Resolved", "artist": "Artist",
        "thumbnailUrl": None, "platformLinks": {"spotify": "https://open.spotify.com/track/x"},
    })
    played_id = uuid4()
    repo.play_next = AsyncMock(return_value=played_id)
    svc = _make_svc(queue_repo=repo, song_svc=song_svc)

    result = await svc.play_next(uuid4(), uuid4())

    repo.mark_resolved.assert_called_once()
    repo.play_next.assert_called_once()
    assert result == played_id


@pytest.mark.asyncio
async def test_play_next_skips_and_recurses_on_odesli_failure():
    repo = AsyncMock()
    song_svc = AsyncMock()
    failing_item = _make_item(resolve_status="resolving", source_url="https://open.spotify.com/track/fail")
    good_item = _make_item(resolve_status="resolved")

    repo.get_next_queued = AsyncMock(side_effect=[failing_item, good_item])
    song_svc.resolve_song_meta = AsyncMock(side_effect=HTTPException(status_code=422, detail="bad url"))
    played_id = uuid4()
    repo.play_next = AsyncMock(return_value=played_id)
    svc = _make_svc(queue_repo=repo, song_svc=song_svc)

    result = await svc.play_next(uuid4(), uuid4())

    repo.mark_failed.assert_called_once_with(failing_item.id, ANY)
    assert result == played_id


@pytest.mark.asyncio
async def test_play_next_returns_none_after_depth_limit():
    repo = AsyncMock()
    song_svc = AsyncMock()
    failing_item = _make_item(resolve_status="resolving")
    repo.get_next_queued = AsyncMock(return_value=failing_item)
    song_svc.resolve_song_meta = AsyncMock(side_effect=Exception("fail"))
    svc = _make_svc(queue_repo=repo, song_svc=song_svc)

    result = await svc.play_next(uuid4(), uuid4(), depth=10)

    assert result is None
    repo.play_next.assert_not_called()


@pytest.mark.asyncio
async def test_play_next_skips_resolve_for_resolved_item():
    repo = AsyncMock()
    song_svc = AsyncMock()
    resolved_item = _make_item(resolve_status="resolved")
    repo.get_next_queued = AsyncMock(return_value=resolved_item)
    played_id = uuid4()
    repo.play_next = AsyncMock(return_value=played_id)
    svc = _make_svc(queue_repo=repo, song_svc=song_svc)

    result = await svc.play_next(uuid4(), uuid4())

    song_svc.resolve_song_meta.assert_not_called()
    repo.mark_resolved.assert_not_called()
    assert result == played_id


@pytest.mark.asyncio
async def test_play_next_returns_none_when_queue_empty():
    repo = AsyncMock()
    repo.get_next_queued = AsyncMock(return_value=None)
    svc = _make_svc(queue_repo=repo)

    result = await svc.play_next(uuid4(), uuid4())

    assert result is None
    repo.play_next.assert_not_called()
