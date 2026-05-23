from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends
from app.dependencies import get_current_user, get_queue_service
from app.schemas.queue_item import YouTubeLinkUpdate, CastVoteRequest
from app.services.event_bus import bus

router = APIRouter()


@router.put("/{item_id}/youtube-link")
async def patch_youtube_link(
    item_id: UUID,
    body: YouTubeLinkUpdate,
    user_id: UUID = Depends(get_current_user),
    svc=Depends(get_queue_service),
):
    await svc.patch_youtube_link(item_id, body.youtube_url, user_id)
    item = await svc.repo.get_by_id(item_id)
    if item:
        await bus.publish(str(item.session_id), "queue_changed", {})
    return {"ok": True}


@router.post("/{item_id}/votes")
async def cast_vote(
    item_id: UUID,
    body: CastVoteRequest,
    user_id: UUID = Depends(get_current_user),
    svc=Depends(get_queue_service),
):
    skipped = await svc.cast_vote(item_id, user_id, body.threshold)
    item = await svc.repo.get_by_id(item_id)
    if item:
        sid = str(item.session_id)
        await bus.publish(sid, "votes_changed", {"queue_item_id": str(item_id)})
        if skipped:
            await bus.publish(sid, "queue_changed", {})
    return {"skipped": skipped}


@router.delete("/{item_id}/votes")
async def remove_vote(
    item_id: UUID,
    user_id: UUID = Depends(get_current_user),
    svc=Depends(get_queue_service),
):
    await svc.remove_vote(item_id, user_id)
    item = await svc.repo.get_by_id(item_id)
    if item:
        await bus.publish(
            str(item.session_id), "votes_changed", {"queue_item_id": str(item_id)}
        )
    return {"ok": True}


@router.get("/{item_id}/votes")
async def get_votes(
    item_id: UUID,
    svc=Depends(get_queue_service),
):
    return await svc.get_votes(item_id)
