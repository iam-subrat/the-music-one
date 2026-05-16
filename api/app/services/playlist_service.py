from __future__ import annotations
import asyncio
import time
from urllib.parse import urlparse, parse_qs
from typing import Literal, Optional
import httpx
from pydantic import BaseModel
from fastapi import HTTPException
from app.config import settings

_spotify_token_lock = asyncio.Lock()


class PlaylistTrack(BaseModel):
    title: str
    artist: str
    url: str
    thumbnail_url: Optional[str] = None


class PlaylistPreview(BaseModel):
    name: str
    platform: Literal["spotify", "youtube"]
    tracks: list[PlaylistTrack]


def detect_playlist(url: str) -> Optional[tuple[str, str]]:
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return None
    except Exception:
        return None

    host = parsed.hostname or ""

    if "spotify.com" in host:
        parts = parsed.path.split("/")
        try:
            idx = parts.index("playlist")
            playlist_id = parts[idx + 1].split("?")[0]
            if playlist_id:
                return ("spotify", playlist_id)
        except (ValueError, IndexError):
            pass
        return None

    if "youtube.com" in host or "youtu.be" in host:
        params = parse_qs(parsed.query)
        list_id = params.get("list", [None])[0]
        if list_id:
            return ("youtube", list_id)
        return None

    return None


class SpotifyPlaylistService:
    _token: Optional[str] = None
    _token_expiry: float = 0.0

    async def _get_token(self) -> str:
        async with _spotify_token_lock:
            if self._token and time.time() < self._token_expiry - 60:
                return self._token
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    "https://accounts.spotify.com/api/token",
                    data={"grant_type": "client_credentials"},
                    auth=(settings.spotify_client_id, settings.spotify_client_secret.get_secret_value()),
                    timeout=10,
                )
                if not res.is_success:
                    raise HTTPException(status_code=502, detail="Spotify auth failed.")
                data = res.json()
            SpotifyPlaylistService._token = data["access_token"]
            SpotifyPlaylistService._token_expiry = time.time() + data.get("expires_in", 3600)
            return SpotifyPlaylistService._token

    async def _fetch_with_token(self, playlist_id: str, token: str) -> Optional[PlaylistPreview]:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"https://api.spotify.com/v1/playlists/{playlist_id}",
                params={"additional_types": "track"},
                headers={"Authorization": f"Bearer {token}"},
                timeout=10,
            )
            if res.status_code == 404:
                raise HTTPException(status_code=404, detail="Playlist not found or private.")
            if res.status_code == 401:
                return None  # sentinel: caller retries with fresh token
            if not res.is_success:
                raise HTTPException(status_code=502, detail="Spotify unavailable.")
            data = res.json()

        tracks: list[PlaylistTrack] = []
        for item in data.get("tracks", {}).get("items", [])[:50]:
            track = item.get("track")
            if not track:
                continue
            images = track.get("album", {}).get("images", [])
            thumbnail = images[0]["url"] if images else None
            artists = track.get("artists", [])
            artist_name = artists[0]["name"] if artists else ""
            url = track.get("external_urls", {}).get("spotify", "")
            if not url:
                continue
            tracks.append(PlaylistTrack(
                title=track.get("name", ""),
                artist=artist_name,
                url=url,
                thumbnail_url=thumbnail,
            ))

        return PlaylistPreview(name=data.get("name", "Playlist"), platform="spotify", tracks=tracks)

    async def fetch(self, playlist_id: str) -> PlaylistPreview:
        if not settings.spotify_client_id or not settings.spotify_client_secret.get_secret_value():
            raise HTTPException(status_code=503, detail="Spotify not configured on this server.")

        token = await self._get_token()
        result = await self._fetch_with_token(playlist_id, token)
        if result is None:
            # 401: token expired mid-session, clear and retry once
            async with _spotify_token_lock:
                SpotifyPlaylistService._token = None
            token = await self._get_token()
            result = await self._fetch_with_token(playlist_id, token)
            if result is None:
                raise HTTPException(status_code=502, detail="Spotify auth failed after retry.")
        return result


class YouTubePlaylistService:
    async def fetch(self, playlist_id: str) -> PlaylistPreview:
        if not settings.youtube_api_key:
            raise HTTPException(status_code=503, detail="YouTube API not configured on this server.")

        async with httpx.AsyncClient() as client:
            # Preflight: get actual playlist title
            pl_res = await client.get(
                "https://www.googleapis.com/youtube/v3/playlists",
                params={"part": "snippet", "maxResults": 1, "id": playlist_id, "key": settings.youtube_api_key},
                timeout=10,
            )
            if pl_res.status_code == 404 or not pl_res.is_success:
                playlist_name = "YouTube Playlist"
            else:
                pl_data = pl_res.json()
                pl_items = pl_data.get("items", [])
                playlist_name = pl_items[0]["snippet"]["title"] if pl_items else "YouTube Playlist"

            # Get tracks
            res = await client.get(
                "https://www.googleapis.com/youtube/v3/playlistItems",
                params={
                    "part": "snippet",
                    "maxResults": 50,
                    "playlistId": playlist_id,
                    "key": settings.youtube_api_key,
                },
                timeout=10,
            )
            if res.status_code == 404:
                raise HTTPException(status_code=404, detail="Playlist not found or private.")
            if not res.is_success:
                raise HTTPException(status_code=502, detail="YouTube unavailable.")
            data = res.json()

        tracks: list[PlaylistTrack] = []
        for item in data.get("items", []):
            snippet = item.get("snippet", {})
            video_id = snippet.get("resourceId", {}).get("videoId")
            if not video_id:
                continue
            thumbnails = snippet.get("thumbnails", {})
            thumbnail = (
                thumbnails.get("high", {}).get("url")
                or thumbnails.get("default", {}).get("url")
            )
            tracks.append(PlaylistTrack(
                title=snippet.get("title", ""),
                artist=snippet.get("videoOwnerChannelTitle", ""),
                url=f"https://www.youtube.com/watch?v={video_id}",
                thumbnail_url=thumbnail,
            ))

        return PlaylistPreview(
            name=playlist_name,
            platform="youtube",
            tracks=tracks,
        )
