from abc import ABC, abstractmethod
from typing import Any, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession


class AbstractRepository(ABC):
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    @abstractmethod
    async def get_by_id(self, id: UUID) -> Optional[Any]:
        ...

    @abstractmethod
    async def create(self, **kwargs: Any) -> Any:
        ...
