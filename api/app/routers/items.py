from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends
from app.dependencies import get_current_user, get_queue_service
from app.schemas.queue_item import YouTubeLinkUpdate, SkipVoteResponse

router = APIRouter()


@router.put("/{item_id}/youtube-link")
async def patch_youtube_link(
    item_id: UUID,
    body: YouTubeLinkUpdate,
    user_id: UUID = Depends(get_current_user),
    svc=Depends(get_queue_service),
):
    await svc.patch_youtube_link(item_id, body.youtube_url)
    return {"ok": True}


@router.post("/{item_id}/votes")
async def cast_vote(
    item_id: UUID,
    user_id: UUID = Depends(get_current_user),
    svc=Depends(get_queue_service),
):
    skipped = await svc.cast_vote(item_id, user_id)
    return {"skipped": skipped}


@router.delete("/{item_id}/votes")
async def remove_vote(
    item_id: UUID,
    user_id: UUID = Depends(get_current_user),
    svc=Depends(get_queue_service),
):
    await svc.remove_vote(item_id, user_id)
    return {"ok": True}
