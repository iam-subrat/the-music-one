import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from pydantic import SecretStr
from app.services.playlist_service import detect_playlist, SpotifyPlaylistService, YouTubePlaylistService
from app.config import settings
from fastapi import HTTPException


# ── detect_playlist ──────────────────────────────────────────────────────────

def test_detect_spotify_playlist():
    result = detect_playlist("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")
    assert result == ("spotify", "37i9dQZF1DXcBWIGoYBM5M")


def test_detect_spotify_playlist_with_query():
    result = detect_playlist("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc")
    assert result == ("spotify", "37i9dQZF1DXcBWIGoYBM5M")


def test_detect_youtube_playlist():
    result = detect_playlist("https://www.youtube.com/playlist?list=PLrEnWoR732-BHrPp_Pm8_VleD68f9s14-")
    assert result == ("youtube", "PLrEnWoR732-BHrPp_Pm8_VleD68f9s14-")


def test_detect_youtube_watch_with_list():
    result = detect_playlist("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrEnWoR732-BHrPp_Pm8_VleD68f9s14-")
    assert result == ("youtube", "PLrEnWoR732-BHrPp_Pm8_VleD68f9s14-")


def test_detect_spotify_track_returns_none():
    result = detect_playlist("https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh")
    assert result is None


def test_detect_youtube_video_returns_none():
    result = detect_playlist("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    assert result is None


def test_detect_unknown_url_returns_none():
    result = detect_playlist("https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb")
    assert result is None


def test_detect_invalid_url_returns_none():
    result = detect_playlist("not a url at all")
    assert result is None


# ── SpotifyPlaylistService ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_spotify_raises_503_when_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "spotify_client_id", "")
    monkeypatch.setattr(settings, "spotify_client_secret", SecretStr(""))
    svc = SpotifyPlaylistService()
    with pytest.raises(HTTPException) as exc:
        await svc.fetch("someplaylistid")
    assert exc.value.status_code == 503


@pytest.mark.asyncio
async def test_spotify_fetch_returns_preview(monkeypatch):
    monkeypatch.setattr(settings, "spotify_client_id", "test_id")
    monkeypatch.setattr(settings, "spotify_client_secret", SecretStr("test_secret"))

    token_response = MagicMock()
    token_response.is_success = True
    token_response.json.return_value = {"access_token": "fake_token", "expires_in": 3600}

    tracks_response = MagicMock()
    tracks_response.is_success = True
    tracks_response.status_code = 200
    tracks_response.json.return_value = {
        "items": [
            {
                "track": {
                    "name": "Song One",
                    "artists": [{"name": "Artist A"}],
                    "external_urls": {"spotify": "https://open.spotify.com/track/abc123"},
                    "album": {"images": [{"url": "https://example.com/img.jpg"}]},
                }
            },
            {"track": None},  # null track (removed from Spotify) — should be skipped
        ]
    }

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=token_response)
    mock_client.get = AsyncMock(return_value=tracks_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("app.services.playlist_service.httpx.AsyncClient", return_value=mock_client):
        svc = SpotifyPlaylistService()
        preview = await svc.fetch("testplaylistid")

    assert preview.name == "Spotify Playlist"
    assert preview.platform == "spotify"
    assert len(preview.tracks) == 1
    assert preview.tracks[0].title == "Song One"
    assert preview.tracks[0].artist == "Artist A"
    assert preview.tracks[0].url == "https://open.spotify.com/track/abc123"
    assert preview.tracks[0].thumbnail_url == "https://example.com/img.jpg"


# ── YouTubePlaylistService ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_youtube_raises_503_when_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "youtube_api_key", "")
    svc = YouTubePlaylistService()
    with pytest.raises(HTTPException) as exc:
        await svc.fetch("someplaylistid")
    assert exc.value.status_code == 503


@pytest.mark.asyncio
async def test_youtube_fetch_returns_preview(monkeypatch):
    monkeypatch.setattr(settings, "youtube_api_key", "fake_yt_key")

    pl_response = MagicMock()
    pl_response.is_success = True
    pl_response.status_code = 200
    pl_response.json.return_value = {
        "items": [{"snippet": {"title": "YT Playlist"}}]
    }

    yt_response = MagicMock()
    yt_response.is_success = True
    yt_response.status_code = 200
    yt_response.json.return_value = {
        "items": [
            {
                "snippet": {
                    "title": "YT Song",
                    "videoOwnerChannelTitle": "YT Artist",
                    "resourceId": {"videoId": "abc123"},
                    "thumbnails": {"default": {"url": "https://img.youtube.com/vi/abc123/default.jpg"}},
                }
            }
        ]
    }

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(side_effect=[pl_response, yt_response])
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("app.services.playlist_service.httpx.AsyncClient", return_value=mock_client):
        svc = YouTubePlaylistService()
        preview = await svc.fetch("testplaylistid")

    assert preview.platform == "youtube"
    assert preview.name == "YT Playlist"
    assert len(preview.tracks) == 1
    assert preview.tracks[0].title == "YT Song"
    assert preview.tracks[0].url == "https://www.youtube.com/watch?v=abc123"


@pytest.mark.asyncio
async def test_spotify_fetch_raises_404_for_private_playlist(monkeypatch):
    monkeypatch.setattr(settings, "spotify_client_id", "test_id")
    from pydantic import SecretStr
    monkeypatch.setattr(settings, "spotify_client_secret", SecretStr("test_secret"))

    token_response = MagicMock()
    token_response.is_success = True
    token_response.json.return_value = {"access_token": "fake_token", "expires_in": 3600}

    not_found_response = MagicMock()
    not_found_response.status_code = 404
    not_found_response.is_success = False

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=token_response)
    mock_client.get = AsyncMock(return_value=not_found_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("app.services.playlist_service.httpx.AsyncClient", return_value=mock_client):
        svc = SpotifyPlaylistService()
        with pytest.raises(HTTPException) as exc:
            await svc.fetch("privateid")
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_youtube_fetch_raises_404_for_private_playlist(monkeypatch):
    monkeypatch.setattr(settings, "youtube_api_key", "fake_key")

    not_found_response = MagicMock()
    not_found_response.status_code = 404
    not_found_response.is_success = False

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=not_found_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("app.services.playlist_service.httpx.AsyncClient", return_value=mock_client):
        svc = YouTubePlaylistService()
        with pytest.raises(HTTPException) as exc:
            await svc.fetch("privateid")
    assert exc.value.status_code == 404
