from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from app.dependencies import get_current_user, get_song_service

router = APIRouter()


@router.get("/")
async def song_lookup(
    url: str,
    _user_id: UUID = Depends(get_current_user),
    svc=Depends(get_song_service),
):
    try:
        return await svc.resolve_song_meta(url)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
