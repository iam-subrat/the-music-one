from fastapi import APIRouter, Depends, HTTPException
from app.dependencies import get_song_service

router = APIRouter()


@router.get("/")
async def song_lookup(url: str, svc=Depends(get_song_service)):
    try:
        return await svc.resolve_song_meta(url)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Odesli error: {e}")
