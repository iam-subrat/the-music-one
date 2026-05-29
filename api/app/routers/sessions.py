from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from app.dependencies import get_current_user, get_session_service, get_queue_service
from app.schemas.session import SessionResponse, RepeatModeUpdate, DjPassRequest
from app.schemas.queue_item import QueueItemCreate, QueueItemResponse, BatchQueueRequest
from app.services.event_bus import bus

router = APIRouter()


@router.post("/", response_model=SessionResponse)
async def create_session(
    user_id: UUID = Depends(get_current_user),
    svc=Depends(get_session_service),
):
    return await svc.create(user_id)


@router.get("/{code}", response_model=SessionResponse)
async def get_session(code: str, svc=Depends(get_session_service)):
    session = await svc.get_by_code(code)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/{session_id}/join")
async def join_session(
    session_id: UUID,
    user_id: UUID = Depends(get_current_user),
    svc=Depends(get_session_service),
):
    await svc.join(session_id, user_id)
    await bus.publish(str(session_id), "participants_changed", {})
    return {"ok": True}


@router.delete("/{session_id}/leave")
@router.post("/{session_id}/leave")
async def leave_session(
    session_id: UUID,
    user_id: UUID = Depends(get_current_user),
    svc=Depends(get_session_service),
):
    await svc.leave(session_id, user_id)
    await bus.publish(str(session_id), "participants_changed", {})
    return {"ok": True}


@router.patch("/{session_id}/end")
async def end_session(
    session_id: UUID,
    user_id: UUID = Depends(get_current_user),
    svc=Depends(get_session_service),
):
    try:
        await svc.end(session_id, user_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    await bus.publish(str(session_id), "session_updated", {"status": "ended"})
    return {"ok": True}


@router.patch("/{session_id}/repeat-mode")
async def set_repeat_mode(
    session_id: UUID,
    body: RepeatModeUpdate,
    user_id: UUID = Depends(get_current_user),
    svc=Depends(get_session_service),
):
    await svc.set_repeat_mode(session_id, body.mode, user_id)
    await bus.publish(str(session_id), "session_updated", {"repeat_mode": body.mode})
    return {"ok": True}


@router.post("/{session_id}/dj")
async def pass_dj(
    session_id: UUID,
    body: DjPassRequest,
    user_id: UUID = Depends(get_current_user),
    svc=Depends(get_session_service),
):
    await svc.pass_dj(session_id, body.new_dj_user_id, user_id)
    return {"ok": True}


@router.post("/{session_id}/heartbeat")
async def heartbeat(
    session_id: UUID,
    user_id: UUID = Depends(get_current_user),
    svc=Depends(get_session_service),
):
    try:
        await svc.require_participant(session_id, user_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    await svc.touch(session_id)
    return {"ok": True}


@router.get("/{session_id}/participants")
async def list_participants(
    session_id: UUID,
    svc=Depends(get_session_service),
):
    return await svc.get_participants(session_id)


@router.get("/{session_id}/queue", response_model=list[QueueItemResponse])
async def get_queue(
    session_id: UUID,
    svc=Depends(get_queue_service),
):
    return await svc.get_queue(session_id)


@router.post("/{session_id}/queue", response_model=QueueItemResponse)
async def add_to_queue(
    session_id: UUID,
    body: QueueItemCreate,
    user_id: UUID = Depends(get_current_user),
    svc=Depends(get_queue_service),
):
    if body.url:
        item = await svc.add(session_id, user_id, body.url)
    elif body.name:
        item = await svc.add_by_search(session_id, user_id, body.name, body.artist or "")
    else:
        raise HTTPException(status_code=422, detail="Provide either a URL or a song name.")
    await bus.publish(str(session_id), "queue_changed", {})
    return item


@router.post("/{session_id}/queue/batch")
async def add_batch_to_queue(
    session_id: UUID,
    body: BatchQueueRequest,
    user_id: UUID = Depends(get_current_user),
    svc=Depends(get_queue_service),
):
    tracks = [t.model_dump() for t in body.capped]
    added = await svc.add_batch(session_id, user_id, tracks)
    await bus.publish(str(session_id), "queue_changed", {})
    return {"added": [QueueItemResponse.model_validate(item) for item in added]}


@router.post("/{session_id}/queue/next")
async def play_next(
    session_id: UUID,
    user_id: UUID = Depends(get_current_user),
    svc=Depends(get_queue_service),
):
    next_id = await svc.play_next(session_id, user_id)
    await bus.publish(str(session_id), "queue_changed", {})
    return {"next_item_id": str(next_id) if next_id else None}


@router.post("/{session_id}/queue/skip")
async def force_skip(
    session_id: UUID,
    user_id: UUID = Depends(get_current_user),
    svc=Depends(get_queue_service),
):
    next_id = await svc.force_skip(session_id, user_id)
    await bus.publish(str(session_id), "queue_changed", {})
    return {"next_item_id": str(next_id) if next_id else None}
