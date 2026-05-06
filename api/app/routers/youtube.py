from fastapi import APIRouter, Depends
from app.dependencies import get_song_service

router = APIRouter()


@router.get("/")
async def youtube_lookup(q: str, svc=Depends(get_song_service)):
    return await svc.resolve_youtube(q)
