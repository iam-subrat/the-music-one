from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from app.dependencies import get_current_user
from app.services.playlist_service import (
    detect_playlist,
    PlaylistPreview,
    SpotifyPlaylistService,
    YouTubePlaylistService,
)

router = APIRouter()

_spotify_svc = SpotifyPlaylistService()
_youtube_svc = YouTubePlaylistService()


@router.get("/preview", response_model=PlaylistPreview)
async def preview_playlist(
    url: str = Query(..., description="Playlist URL to preview"),
    _user_id=Depends(get_current_user),
):
    result = detect_playlist(url)
    if not result:
        raise HTTPException(status_code=422, detail="Unsupported playlist link.")
    platform, playlist_id = result
    if platform == "spotify":
        return await _spotify_svc.fetch(playlist_id)
    if platform == "youtube":
        return await _youtube_svc.fetch(playlist_id)
    raise HTTPException(status_code=422, detail="Unsupported platform.")
