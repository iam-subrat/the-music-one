from __future__ import annotations
import time
from urllib.parse import urlparse, parse_qs
from typing import Optional
import httpx
from pydantic import BaseModel
from fastapi import HTTPException
from app.config import settings


class PlaylistTrack(BaseModel):
    title: str
    artist: str
    url: str
    thumbnail_url: Optional[str] = None


class PlaylistPreview(BaseModel):
    name: str
    platform: str
    tracks: list[PlaylistTrack]


def detect_playlist(url: str) -> Optional[tuple[str, str]]:
    try:
        parsed = urlparse(url)
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
            self._token = data["access_token"]
            self._token_expiry = time.time() + data.get("expires_in", 3600)
            return self._token

    async def fetch(self, playlist_id: str) -> PlaylistPreview:
        if not settings.spotify_client_id or not settings.spotify_client_secret.get_secret_value():
            raise HTTPException(status_code=503, detail="Spotify not configured on this server.")

        token = await self._get_token()
        fields = "name,items(track(name,artists(name),external_urls(spotify),album(images)))"
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"https://api.spotify.com/v1/playlists/{playlist_id}/tracks",
                params={"limit": 50, "fields": fields},
                headers={"Authorization": f"Bearer {token}"},
                timeout=10,
            )

        if res.status_code == 404:
            raise HTTPException(status_code=404, detail="Playlist not found or private.")
        if res.status_code == 401:
            self._token = None
            raise HTTPException(status_code=502, detail="Spotify auth expired. Try again.")
        if not res.is_success:
            raise HTTPException(status_code=502, detail="Spotify unavailable.")

        data = res.json()
        tracks: list[PlaylistTrack] = []
        for item in data.get("items", []):
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


class YouTubePlaylistService:
    async def fetch(self, playlist_id: str) -> PlaylistPreview:
        if not settings.youtube_api_key:
            raise HTTPException(status_code=503, detail="YouTube API not configured on this server.")

        async with httpx.AsyncClient() as client:
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
        playlist_name = "YouTube Playlist"
        tracks: list[PlaylistTrack] = []
        for item in data.get("items", []):
            snippet = item.get("snippet", {})
            video_id = snippet.get("resourceId", {}).get("videoId")
            if not video_id:
                continue
            if not playlist_name and snippet.get("playlistTitle"):
                playlist_name = snippet["playlistTitle"]
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

        return PlaylistPreview(name=playlist_name, platform="youtube", tracks=tracks)
