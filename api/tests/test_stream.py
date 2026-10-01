from uuid import uuid4
from unittest.mock import AsyncMock
from fastapi.testclient import TestClient
from app.main import app
from app.dependencies import get_current_user, get_song_service

client = TestClient(app)

def test_youtube_lookup_returns_service_result():
    service = AsyncMock()
    service.resolve_youtube = AsyncMock(return_value={"title": "Song"})
    app.dependency_overrides[get_current_user] = lambda: uuid4()
    app.dependency_overrides[get_song_service] = lambda: service

    try:
        response = client.get("/api/youtube/", params={"q": "Song"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"title": "Song"}
    service.resolve_youtube.assert_awaited_once_with("Song")


def test_youtube_lookup_requires_query():
    app.dependency_overrides[get_current_user] = lambda: uuid4()

    try:
        response = client.get("/api/youtube/")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
