import asyncio
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from app.dependencies import get_current_user, get_session_service
from app.services.event_bus import bus

router = APIRouter()


@router.get("/{session_id}/stream")
async def session_stream(
    session_id: UUID,
    request: Request,
    user_id: UUID = Depends(get_current_user),
    svc=Depends(get_session_service),
):
    session = await svc.get_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    sid = str(session_id)
    q = await bus.subscribe(sid)

    if not await svc.store.sessions.is_participant(session_id, user_id):
        await svc.join(session_id, user_id)
        await bus.publish(sid, "participants_changed", {})

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(q.get(), timeout=30)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            await bus.unsubscribe(sid, q)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
