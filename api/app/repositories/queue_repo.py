from typing import Optional
from uuid import UUID, uuid4
from sqlalchemy import select, text
from app.models.queue_item import QueueItem
from app.repositories.base import AbstractRepository
from app.repositories.db_auth import set_jwt_claims


class QueueRepository(AbstractRepository):
    async def get_by_id(self, id: UUID) -> Optional[QueueItem]:
        result = await self.db.execute(select(QueueItem).where(QueueItem.id == id))
        return result.scalar_one_or_none()

    async def create(self, **kwargs) -> QueueItem:
        item = QueueItem(id=uuid4(), **kwargs)
        self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def get_queue(self, session_id: UUID) -> list[QueueItem]:
        result = await self.db.execute(
            select(QueueItem)
            .where(QueueItem.session_id == session_id)
            .order_by(QueueItem.position)
        )
        return result.scalars().all()

    async def play_next(self, session_id: UUID, user_id: UUID, skip_status: str = "played") -> Optional[UUID]:
        await set_jwt_claims(self.db, user_id)
        result = await self.db.execute(
            text("SELECT play_next(:sid, :status, true)"),
            {"sid": str(session_id), "status": skip_status},
        )
        await self.db.commit()
        row = result.fetchone()
        return UUID(str(row[0])) if row and row[0] else None

    async def force_skip(self, session_id: UUID, user_id: UUID) -> Optional[UUID]:
        return await self.play_next(session_id, user_id, skip_status="skipped")

    async def patch_youtube_link(self, item_id: UUID, youtube_url: str, user_id: UUID) -> None:
        await set_jwt_claims(self.db, user_id)
        await self.db.execute(
            text("SELECT patch_youtube_link(:item_id, :url)"),
            {"item_id": str(item_id), "url": youtube_url},
        )
        await self.db.commit()
