import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi import HTTPException
from app.services.song_service import SongService


@pytest.mark.asyncio
async def test_resolve_song_meta_parses_odesli_response():
    svc = SongService()
    mock_response = {
        "entityUniqueId": "SPOTIFY_SONG::abc",
        "entitiesByUniqueId": {
            "SPOTIFY_SONG::abc": {
                "title": "Bohemian Rhapsody",
                "artistName": "Queen",
                "thumbnailUrl": "https://img.example.com/thumb.jpg",
            }
        },
        "linksByPlatform": {
            "spotify": {"url": "https://open.spotify.com/track/abc"},
            "itunes": {"url": "https://music.apple.com/track/abc"},
        },
    }
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_response_obj = MagicMock()
        mock_response_obj.json.return_value = mock_response
        mock_response_obj.raise_for_status = lambda: None
        mock_get.return_value = mock_response_obj
        meta = await svc.resolve_song_meta("https://open.spotify.com/track/abc")

    assert meta["title"] == "Bohemian Rhapsody"
    assert meta["artist"] == "Queen"
    assert meta["platformLinks"]["spotify"] == "https://open.spotify.com/track/abc"
    assert meta["platformLinks"]["applemusic"] == "https://music.apple.com/track/abc"


@pytest.mark.asyncio
async def test_search_by_name_returns_meta_via_youtube():
    svc = SongService()
    yt_response = {"id": "dQw4w9WgXcQ", "title": "Rick Astley - Never Gonna Give You Up"}
    odesli_response = {
        "entityUniqueId": "YOUTUBE_VIDEO::dQw4w9WgXcQ",
        "entitiesByUniqueId": {
            "YOUTUBE_VIDEO::dQw4w9WgXcQ": {
                "title": "Never Gonna Give You Up",
                "artistName": "Rick Astley",
                "thumbnailUrl": "https://img.example.com/rick.jpg",
            }
        },
        "linksByPlatform": {
            "youtube": {"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
            "spotify": {"url": "https://open.spotify.com/track/rick"},
        },
    }

    svc.resolve_youtube = AsyncMock(return_value=yt_response)

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_resp = MagicMock()
        mock_resp.json.return_value = odesli_response
        mock_resp.raise_for_status = lambda: None
        mock_get.return_value = mock_resp
        meta = await svc.search_by_name("Never Gonna Give You Up", "Rick Astley")

    assert meta["title"] == "Never Gonna Give You Up"
    assert meta["artist"] == "Rick Astley"
    assert "youtube" in meta["platformLinks"] or "spotify" in meta["platformLinks"]


@pytest.mark.asyncio
async def test_search_by_name_raises_404_when_no_yt_result():
    svc = SongService()
    svc.resolve_youtube = AsyncMock(return_value={"id": None, "title": None})

    with pytest.raises(HTTPException) as exc_info:
        await svc.search_by_name("xxxxxxxxxxxxxxxxxnonexistent")

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_search_by_name_falls_back_to_youtube_only_when_odesli_fails():
    svc = SongService()
    svc.resolve_youtube = AsyncMock(return_value={"id": "abc123", "title": "Some Song"})
    svc.resolve_song_meta = AsyncMock(side_effect=HTTPException(status_code=422, detail="bad url"))

    meta = await svc.search_by_name("Some Song", "Some Artist")

    assert meta["title"] == "Some Song"
    assert meta["artist"] == "Some Artist"
    assert meta["platformLinks"]["youtube"] == "https://www.youtube.com/watch?v=abc123"
