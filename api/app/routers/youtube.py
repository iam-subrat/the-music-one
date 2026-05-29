from uuid import UUID
from fastapi import APIRouter, Depends
from app.dependencies import get_current_user, get_song_service

router = APIRouter()


@router.get("/")
async def youtube_lookup(
    q: str,
    _user_id: UUID = Depends(get_current_user),
    svc=Depends(get_song_service),
):
    return await svc.resolve_youtube(q)
