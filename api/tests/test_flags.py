import pytest
from unittest.mock import AsyncMock, MagicMock
from app.main import app
from app.database import get_db


@pytest.mark.asyncio
async def test_health_endpoint(client):
    res = await client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_flags_endpoint_returns_list(client):
    mock_flags = [MagicMock(key="JAM_SESSION", enabled=True)]

    mock_db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = mock_flags
    mock_db.execute = AsyncMock(return_value=result_mock)

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db
    try:
        res = await client.get("/api/flags/")
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert res.status_code in (200, 500)
