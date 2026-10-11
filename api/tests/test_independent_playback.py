from types import SimpleNamespace
from unittest.mock import AsyncMock
from unittest.mock import patch
from app.repositories.queue_repo import QueueRepository
from uuid import uuid4

import pytest
from contextlib import asynccontextmanager
from fastapi import HTTPException
from app.services.queue_service import QueueService
from app.services.session_service import SessionService
from app.schemas.session import SessionResponse


def test_session_contract_defaults_legacy_rooms_to_dj():
    data = dict(id=uuid4(), invite_code='ABC123', status='active', repeat_mode='none',
                auto_pilot=False, max_participants=20, created_at='2026-10-08T00:00:00Z')
    result = SessionResponse(**data)
    assert result.playback_mode == 'dj'
    assert result.playback_mode_version == 0


@pytest.mark.asyncio
async def test_mode_change_requires_host_and_membership():
    actor, host, sid = uuid4(), uuid4(), uuid4()
    store = SimpleNamespace(sessions=SimpleNamespace(
        get_by_id=AsyncMock(return_value=SimpleNamespace(host_user_id=host, status='active')),
        is_participant=AsyncMock(return_value=True), set_playback_mode=AsyncMock()))
    with pytest.raises(PermissionError, match='host'):
        await SessionService(store).set_playback_mode(sid, 'independent', 0, actor)
    store.sessions.set_playback_mode.assert_not_awaited()


@asynccontextmanager
async def unlocked(_item_id):
    yield


def resolution_service(member=True):
    sid, iid = uuid4(), uuid4()
    item = SimpleNamespace(id=iid, session_id=sid, status='played', resolve_status='resolved',
                           source_url=None, title='Song', artist='Artist',
                           platform_links={'youtube': 'https://youtu.be/abcdefghijk'})
    queue = SimpleNamespace(get_by_id=AsyncMock(return_value=item),
        independent_resolution_lock=unlocked,
        persist_independent_resolution=AsyncMock(return_value='https://www.youtube.com/watch?v=abcdefghijk'),
        mark_failed=AsyncMock(), play_next=AsyncMock())
    sessions = SimpleNamespace(is_participant=AsyncMock(return_value=member),
        embed_enabled=AsyncMock(return_value=True),
        get_by_id=AsyncMock(return_value=SimpleNamespace(id=sid, status='active', playback_mode='independent', playback_mode_version=3)))
    songs = AsyncMock()
    return QueueService(SimpleNamespace(queue=queue, sessions=sessions), songs), item, queue, songs


@pytest.mark.asyncio
async def test_independent_resolution_is_participant_only_and_never_advances():
    service, item, queue, songs = resolution_service(False)
    with pytest.raises(PermissionError):
        await service.resolve_independent(item.id, uuid4())
    queue.persist_independent_resolution.assert_not_awaited()
    songs.resolve_youtube.assert_not_awaited()
    service.store.sessions.is_participant.return_value = True
    result = await service.resolve_independent(item.id, uuid4())
    assert result['video_id'] == 'abcdefghijk'
    assert item.status == 'played'
    queue.play_next.assert_not_awaited()
    queue.mark_failed.assert_not_awaited()


@pytest.mark.asyncio
async def test_resolution_race_and_lookup_failure_do_not_skip_global_song():
    service, item, queue, songs = resolution_service()
    queue.persist_independent_resolution.side_effect = HTTPException(409, 'Room mode changed')
    with pytest.raises(HTTPException) as changed:
        await service.resolve_independent(item.id, uuid4())
    assert changed.value.status_code == 409
    item.platform_links = {}
    songs.resolve_youtube.return_value = {'id': 'invalid'}
    with pytest.raises(HTTPException) as unavailable:
        await service.resolve_independent(item.id, uuid4())
    assert unavailable.value.status_code == 502
    queue.mark_failed.assert_not_awaited()
    assert item.status == 'played'


@pytest.mark.asyncio
async def test_stale_autopilot_rechecks_before_committing_recommendation():
    queue = AsyncMock()
    queue.get_next_queued.return_value = None
    queue.get_current_playing.return_value = SimpleNamespace(title='Current')
    queue.create_dj.side_effect = HTTPException(409, 'Room mode changed')
    sessions = AsyncMock()
    sessions.is_participant.return_value = True
    sessions.get_by_id.return_value = SimpleNamespace(repeat_mode='none', auto_pilot=True, dj_user_id=uuid4())
    songs = AsyncMock()
    songs.get_related_song.return_value = {'title': 'Next', 'artist': 'Artist'}
    service = QueueService(SimpleNamespace(queue=queue, sessions=sessions), songs)
    with pytest.raises(HTTPException):
        await service.play_next(uuid4(), uuid4())
    queue.validate_dj_playback.assert_awaited_once()
    queue.create.assert_not_awaited()
    queue.play_next.assert_not_awaited()


@pytest.mark.asyncio
async def test_dj_preguard_preserves_host_access_after_dj_handoff():
    host, dj, sid = uuid4(), uuid4(), uuid4()
    db = AsyncMock()
    db.scalar.return_value = SimpleNamespace(host_user_id=host, dj_user_id=dj)
    repo = QueueRepository(db)
    with patch('app.repositories.queue_repo.set_jwt_claims', new=AsyncMock()):
        await repo.validate_dj_playback(sid, host)
        await repo.validate_dj_playback(sid, dj)
        with pytest.raises(PermissionError):
            await repo.validate_dj_playback(sid, uuid4())


@pytest.mark.asyncio
async def test_mode_http_contract_accepts_mode_and_rejects_wrong_payload(client):
    from app.main import app
    from app.dependencies import get_current_user, get_session_service
    sid, actor = uuid4(), uuid4()
    response = SessionResponse(id=sid, invite_code='SHARED', status='active', repeat_mode='none',
        auto_pilot=False, max_participants=20, created_at='2026-10-08T00:00:00Z',
        playback_mode='independent', playback_mode_version=1)
    service = SimpleNamespace(set_playback_mode=AsyncMock(return_value=response))
    app.dependency_overrides[get_current_user] = lambda: actor
    app.dependency_overrides[get_session_service] = lambda: service
    try:
        result = await client.patch(f'/api/sessions/{sid}/playback-mode', json={'mode': 'independent', 'expected_version': 0})
        assert result.status_code == 200
        service.set_playback_mode.assert_awaited_once_with(sid, 'independent', 0, actor)
        result = await client.patch(f'/api/sessions/{sid}/playback-mode', json={'playback_mode': 'independent', 'expected_version': 0})
        assert result.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_user)
        app.dependency_overrides.pop(get_session_service)
