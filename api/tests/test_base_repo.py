import pytest
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.base import AbstractRepository


class ConcreteRepo(AbstractRepository):
    async def get_by_id(self, id):
        return id

    async def create(self, **kwargs):
        return kwargs


def test_concrete_repo_instantiates(mocker):
    db = mocker.MagicMock(spec=AsyncSession)
    repo = ConcreteRepo(db)
    assert repo.db is db
