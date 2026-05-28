import json
from typing import Optional
from uuid import UUID, uuid4
from sqlalchemy import select, text
from sqlalchemy.orm import selectinload
from app.models.queue_item import QueueItem
from app.repositories.base import AbstractRepository
from app.repositories.db_auth import set_jwt_claims


class QueueRepository(AbstractRepository):
    async def _get_with_profile(self, id: UUID) -> Optional[QueueItem]:
        result = await self.db.execute(
            select(QueueItem).where(QueueItem.id == id).options(selectinload(QueueItem.profiles))
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, id: UUID) -> Optional[QueueItem]:
        return await self._get_with_profile(id)

    async def create(self, **kwargs) -> QueueItem:
        item = QueueItem(id=uuid4(), **kwargs)
        self.db.add(item)
        await self.db.commit()
        return await self._get_with_profile(item.id)

    async def get_queue(self, session_id: UUID) -> list[QueueItem]:
        result = await self.db.execute(
            select(QueueItem)
            .where(QueueItem.session_id == session_id)
            .order_by(QueueItem.position)
            .options(selectinload(QueueItem.profiles))
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

    async def get_next_queued(self, session_id: UUID) -> Optional[QueueItem]:
        result = await self.db.execute(
            select(QueueItem)
            .where(QueueItem.session_id == session_id, QueueItem.status == "queued")
            .order_by(QueueItem.position)
            .limit(1)
            .options(selectinload(QueueItem.profiles))
        )
        return result.scalar_one_or_none()

    async def create_stub(
        self,
        session_id: UUID,
        added_by_user_id: UUID,
        title: str,
        artist: str,
        thumbnail_url: Optional[str],
        source_url: str,
    ) -> QueueItem:
        item = QueueItem(
            id=uuid4(),
            session_id=session_id,
            added_by_user_id=added_by_user_id,
            title=title,
            artist=artist,
            thumbnail_url=thumbnail_url,
            source_url=source_url,
            platform_links={},
            status="queued",
            resolve_status="resolving",
        )
        self.db.add(item)
        await self.db.commit()
        return await self._get_with_profile(item.id)

    async def mark_resolved(self, item_id: UUID, meta: dict, user_id: UUID) -> None:
        await self.db.rollback()
        await set_jwt_claims(self.db, user_id)
        await self.db.execute(
            text("""
                UPDATE queue_items
                SET title = :title,
                    artist = :artist,
                    thumbnail_url = :thumbnail_url,
                    platform_links = CAST(:platform_links AS jsonb),
                    resolve_status = 'resolved'
                WHERE id = :item_id
            """),
            {
                "item_id": str(item_id),
                "title": meta.get("title", ""),
                "artist": meta.get("artist", ""),
                "thumbnail_url": meta.get("thumbnailUrl"),
                "platform_links": json.dumps(meta.get("platformLinks", {})),
            },
        )
        await self.db.commit()

    async def reset_played_to_queued(self, session_id: UUID) -> None:
        await self.db.execute(
            text("""
                UPDATE queue_items
                SET status = 'queued'
                WHERE session_id = :session_id AND status = 'played'
            """),
            {"session_id": str(session_id)},
        )
        await self.db.commit()

    async def mark_failed(self, item_id: UUID, user_id: UUID) -> None:
        await self.db.rollback()
        await set_jwt_claims(self.db, user_id)
        await self.db.execute(
            text("""
                UPDATE queue_items
                SET resolve_status = 'failed', status = 'skipped'
                WHERE id = :item_id
            """),
            {"item_id": str(item_id)},
        )
        await self.db.commit()
