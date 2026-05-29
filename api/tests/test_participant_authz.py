"""Participant authorization tests — TDD red→green cycle.

Steps covered:
  1. SessionRepository.is_participant
  2. SessionService.require_participant
  3. QueueService guards (add, add_batch, force_skip, play_next)
  4. Heartbeat router guard
  5. SSE stream router guard
"""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from app.repositories.session_repo import SessionRepository
from app.services.session_service import SessionService
from app.services.queue_service import QueueService
from app.models.session import SessionParticipant


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_queue_svc(is_participant: bool = True):
    """QueueService with store.sessions.is_participant pre-configured."""
    store = MagicMock()
    store.queue = AsyncMock()
    store.skip_votes = AsyncMock()
    store.sessions = AsyncMock()
    store.sessions.is_participant = AsyncMock(return_value=is_participant)
    return QueueService(store, AsyncMock())


# ═══════════════════════════════════════════════════════════════════════════
# Step 1 — SessionRepository.is_participant
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_is_participant_returns_true_when_user_in_session():
    db = AsyncMock()
    repo = SessionRepository(db)
    session_id = uuid4()
    user_id = uuid4()

    # Simulate a row being found
    participant = SessionParticipant(session_id=session_id, user_id=user_id)
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = participant
    db.execute = AsyncMock(return_value=result_mock)

    result = await repo.is_participant(session_id, user_id)

    assert result is True


@pytest.mark.asyncio
async def test_is_participant_returns_false_when_user_not_in_session():
    db = AsyncMock()
    repo = SessionRepository(db)
    session_id = uuid4()
    user_id = uuid4()

    # Simulate no row found
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result_mock)

    result = await repo.is_participant(session_id, user_id)

    assert result is False


# ═══════════════════════════════════════════════════════════════════════════
# Step 2 — SessionService.require_participant
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_require_participant_passes_when_user_is_participant():
    store = MagicMock()
    store.sessions = AsyncMock()
    store.sessions.is_participant = AsyncMock(return_value=True)
    svc = SessionService(store)

    # Should not raise
    await svc.require_participant(uuid4(), uuid4())


@pytest.mark.asyncio
async def test_require_participant_raises_403_when_user_not_participant():
    store = MagicMock()
    store.sessions = AsyncMock()
    store.sessions.is_participant = AsyncMock(return_value=False)
    svc = SessionService(store)

    with pytest.raises(PermissionError):
        await svc.require_participant(uuid4(), uuid4())


# ═══════════════════════════════════════════════════════════════════════════
# Step 3 — QueueService guards
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_add_raises_when_user_not_participant():
    svc = _make_queue_svc(is_participant=False)
    svc.song_svc.resolve_song_meta = AsyncMock(return_value={
        "title": "T", "artist": "A", "thumbnailUrl": None, "platformLinks": {}
    })

    with pytest.raises(PermissionError):
        await svc.add(uuid4(), uuid4(), "https://open.spotify.com/track/xyz")


@pytest.mark.asyncio
async def test_add_batch_raises_when_user_not_participant():
    svc = _make_queue_svc(is_participant=False)

    tracks = [{"url": "https://open.spotify.com/track/a", "title": "A", "artist": "B"}]
    with pytest.raises(PermissionError):
        await svc.add_batch(uuid4(), uuid4(), tracks)


@pytest.mark.asyncio
async def test_force_skip_raises_when_user_not_participant():
    svc = _make_queue_svc(is_participant=False)

    with pytest.raises(PermissionError):
        await svc.force_skip(uuid4(), uuid4())


@pytest.mark.asyncio
async def test_play_next_raises_when_user_not_participant():
    svc = _make_queue_svc(is_participant=False)

    with pytest.raises(PermissionError):
        await svc.play_next(uuid4(), uuid4())


# ═══════════════════════════════════════════════════════════════════════════
# Step 4 — heartbeat router guard
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_heartbeat_raises_403_when_not_participant():
    from fastapi.testclient import TestClient
    from fastapi import FastAPI
    from app.routers.sessions import router as sessions_router
    from app.dependencies import get_current_user, get_session_service

    app = FastAPI()
    app.include_router(sessions_router, prefix="/sessions")

    session_id = uuid4()
    user_id = uuid4()

    mock_svc = AsyncMock()
    mock_svc.require_participant = AsyncMock(
        side_effect=PermissionError("Not a session participant")
    )

    app.dependency_overrides[get_current_user] = lambda: user_id
    app.dependency_overrides[get_session_service] = lambda: mock_svc

    client = TestClient(app, raise_server_exceptions=False)
    response = client.post(f"/sessions/{session_id}/heartbeat")

    assert response.status_code == 403


# ═══════════════════════════════════════════════════════════════════════════
# Step 5 — SSE stream router guard
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_sse_stream_raises_404_or_403_when_not_participant():
    from fastapi.testclient import TestClient
    from fastapi import FastAPI
    from app.routers.events import router as events_router
    from app.dependencies import get_current_user, get_session_service

    app = FastAPI()
    app.include_router(events_router, prefix="/sessions")

    session_id = uuid4()
    user_id = uuid4()

    # Session exists but user is NOT a participant
    mock_session = MagicMock()
    mock_svc = AsyncMock()
    mock_svc.get_by_id = AsyncMock(return_value=mock_session)
    mock_svc.store = MagicMock()
    mock_svc.store.sessions = AsyncMock()
    mock_svc.store.sessions.is_participant = AsyncMock(return_value=False)

    app.dependency_overrides[get_current_user] = lambda: user_id
    app.dependency_overrides[get_session_service] = lambda: mock_svc

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get(f"/sessions/{session_id}/stream")

    assert response.status_code in {403, 404}
