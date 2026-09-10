import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

@pytest.mark.asyncio
async def test_get_youtube_stream_non_range_returns_200():
    with patch("app.routers.stream.get_stream_url", new_callable=AsyncMock) as mock_get_url:
        mock_get_url.return_value = "https://mock.googlevideo.com/videoplayback"
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "audio/mp4", "content-length": "12345"}
        
        async def mock_aiter_bytes(chunk_size=65536):
            yield b"audio_data_chunk"
            
        mock_response.aiter_bytes = mock_aiter_bytes
        mock_response.aclose = AsyncMock()
        
        with patch("httpx.AsyncClient.send", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = mock_response
            response = client.get("/api/youtube/dQw4w9WgXcQ/stream")
            
            assert response.status_code == 200
            assert response.headers["content-type"] == "audio/mp4"
            assert response.headers["accept-ranges"] == "bytes"
            assert "content-range" not in response.headers
            assert response.content == b"audio_data_chunk"

@pytest.mark.asyncio
async def test_get_youtube_stream_with_range_returns_206():
    with patch("app.routers.stream.get_stream_url", new_callable=AsyncMock) as mock_get_url:
        mock_get_url.return_value = "https://mock.googlevideo.com/videoplayback"
        
        mock_response = MagicMock()
        mock_response.status_code = 206
        mock_response.headers = {
            "content-type": "audio/mp4",
            "content-length": "100",
            "content-range": "bytes 0-99/12345"
        }
        
        async def mock_aiter_bytes(chunk_size=65536):
            yield b"partial_data"
            
        mock_response.aiter_bytes = mock_aiter_bytes
        mock_response.aclose = AsyncMock()
        
        with patch("httpx.AsyncClient.send", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = mock_response
            response = client.get("/api/youtube/dQw4w9WgXcQ/stream", headers={"Range": "bytes=0-99"})
            
            assert response.status_code == 206
            assert response.headers["content-type"] == "audio/mp4"
            assert response.headers["content-range"] == "bytes 0-99/12345"
            assert response.content == b"partial_data"
