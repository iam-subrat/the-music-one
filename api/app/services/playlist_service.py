from __future__ import annotations
import asyncio
import logging
import time
from urllib.parse import urlparse, parse_qs
from typing import Literal, Optional
import httpx
from pydantic import BaseModel
from fastapi import HTTPException
from app.config import settings

_log = logging.getLogger(__name__)

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
                _log.debug("spotify token cache hit, expires_in=%.0fs", self._token_expiry - time.time())
                return self._token
            _log.info("spotify fetching new client_credentials token, client_id=%s", settings.spotify_client_id[:6] + "…")
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    "https://accounts.spotify.com/api/token",
                    data={"grant_type": "client_credentials"},
                    auth=(settings.spotify_client_id, settings.spotify_client_secret.get_secret_value()),
                    timeout=10,
                )
                _log.info("spotify token response status=%s", res.status_code)
                if not res.is_success:
                    _log.error("spotify token error status=%s body=%s", res.status_code, res.text[:300])
                    raise HTTPException(status_code=502, detail="Spotify auth failed.")
                data = res.json()
            SpotifyPlaylistService._token = data["access_token"]
            SpotifyPlaylistService._token_expiry = time.time() + data.get("expires_in", 3600)
            _log.info("spotify token acquired, expires_in=%ss", data.get("expires_in", 3600))
            return SpotifyPlaylistService._token

    async def _fetch_with_token(self, playlist_id: str, token: str) -> Optional[PlaylistPreview]:
        url = f"https://api.spotify.com/v1/playlists/{playlist_id}/tracks"
        params = {"limit": 50, "additional_types": "track"}
        _log.info("spotify GET %s params=%s", url, params)
        async with httpx.AsyncClient() as client:
            tr_res = await client.get(
                url,
                params=params,
                headers={"Authorization": f"Bearer {token}"},
                timeout=10,
            )
        _log.info("spotify tracks response status=%s", tr_res.status_code)
        if tr_res.status_code == 404:
            _log.warning("spotify playlist not found or private playlist_id=%s", playlist_id)
            raise HTTPException(status_code=404, detail="Playlist not found or private.")
        if tr_res.status_code == 401:
            _log.warning("spotify 401 on tracks fetch — token will be refreshed")
            return None
        if not tr_res.is_success:
            _log.error("spotify tracks error status=%s body=%s", tr_res.status_code, tr_res.text[:500])
            raise HTTPException(status_code=502, detail="Spotify unavailable.")

        tr_data = tr_res.json()
        raw_items = tr_data.get("items", [])
        _log.info("spotify tracks raw items=%d total=%s", len(raw_items), tr_data.get("total"))

        tracks: list[PlaylistTrack] = []
        for item in raw_items:
            track = item.get("track")
            if not track:
                _log.debug("spotify skipping null track item")
                continue
            images = track.get("album", {}).get("images", [])
            thumbnail = images[0]["url"] if images else None
            artists = track.get("artists", [])
            artist_name = artists[0]["name"] if artists else ""
            spotify_url = track.get("external_urls", {}).get("spotify", "")
            if not spotify_url:
                _log.debug("spotify skipping track with no spotify url name=%s", track.get("name"))
                continue
            tracks.append(PlaylistTrack(
                title=track.get("name", ""),
                artist=artist_name,
                url=spotify_url,
                thumbnail_url=thumbnail,
            ))

        _log.info("spotify parsed tracks=%d (skipped=%d)", len(tracks), len(raw_items) - len(tracks))
        return PlaylistPreview(name="Spotify Playlist", platform="spotify", tracks=tracks)

    async def fetch(self, playlist_id: str) -> PlaylistPreview:
        # Spotify playlist access requires user OAuth (Authorization Code flow).
        # Client Credentials cannot access user-created playlists per Spotify API policy.
        # Re-enable when user OAuth is implemented.
        _log.info("spotify fetch blocked — user OAuth not implemented yet playlist_id=%s", playlist_id)
        raise HTTPException(
            status_code=503,
            detail="Spotify playlists aren't supported yet — try a YouTube playlist instead.",
        )


class YouTubePlaylistService:
    async def fetch(self, playlist_id: str) -> PlaylistPreview:
        _log.info("youtube fetch playlist_id=%s api_key_set=%s", playlist_id, bool(settings.youtube_api_key))
        if not settings.youtube_api_key:
            _log.error("youtube api key not configured")
            raise HTTPException(status_code=503, detail="YouTube API not configured on this server.")

        async with httpx.AsyncClient() as client:
            pl_res = await client.get(
                "https://www.googleapis.com/youtube/v3/playlists",
                params={"part": "snippet", "maxResults": 1, "id": playlist_id, "key": settings.youtube_api_key},
                timeout=10,
            )
            _log.info("youtube playlist info status=%s", pl_res.status_code)
            if pl_res.status_code == 404 or not pl_res.is_success:
                _log.warning("youtube playlist info failed status=%s body=%s", pl_res.status_code, pl_res.text[:300])
                playlist_name = "YouTube Playlist"
            else:
                pl_data = pl_res.json()
                pl_items = pl_data.get("items", [])
                playlist_name = pl_items[0]["snippet"]["title"] if pl_items else "YouTube Playlist"
                _log.info("youtube playlist name=%r", playlist_name)

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
            _log.info("youtube playlistItems status=%s", res.status_code)
            if res.status_code == 404:
                _log.warning("youtube playlist not found playlist_id=%s", playlist_id)
                raise HTTPException(status_code=404, detail="Playlist not found or private.")
            if not res.is_success:
                _log.error("youtube playlistItems error status=%s body=%s", res.status_code, res.text[:500])
                raise HTTPException(status_code=502, detail="YouTube unavailable.")
            data = res.json()

        raw_items = data.get("items", [])
        _log.info("youtube raw items=%d", len(raw_items))

        tracks: list[PlaylistTrack] = []
        for item in raw_items:
            snippet = item.get("snippet", {})
            video_id = snippet.get("resourceId", {}).get("videoId")
            if not video_id:
                _log.debug("youtube skipping item with no videoId")
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

        _log.info("youtube parsed tracks=%d", len(tracks))
        return PlaylistPreview(name=playlist_name, platform="youtube", tracks=tracks)
