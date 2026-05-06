import pytest
from unittest.mock import patch, AsyncMock, MagicMock
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
