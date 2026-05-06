from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Response
from app.dependencies import get_current_user, get_session_service
from app.schemas.session import SessionResponse, RepeatModeUpdate, DjPassRequest

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
    return {"ok": True}


@router.delete("/{session_id}/leave")
async def leave_session(
    session_id: UUID,
    user_id: UUID = Depends(get_current_user),
    svc=Depends(get_session_service),
):
    await svc.leave(session_id, user_id)
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
    return {"ok": True}


@router.patch("/{session_id}/repeat-mode")
async def set_repeat_mode(
    session_id: UUID,
    body: RepeatModeUpdate,
    user_id: UUID = Depends(get_current_user),
    svc=Depends(get_session_service),
):
    await svc.set_repeat_mode(session_id, body.mode, user_id)
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
):
    return {"ok": True}


@router.get("/{session_id}/participants")
async def list_participants(
    session_id: UUID,
    svc=Depends(get_session_service),
):
    return await svc.get_participants(session_id)
