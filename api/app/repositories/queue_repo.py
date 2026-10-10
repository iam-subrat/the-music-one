import json
import re
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from typing import Optional
from uuid import UUID, uuid4
from sqlalchemy import select, text
from sqlalchemy.orm import selectinload
from app.models.queue_item import QueueItem
from app.models.session import Session
from fastapi import HTTPException
from app.repositories.base import AbstractRepository
from app.repositories.db_auth import set_jwt_claims


class QueueRepository(AbstractRepository):
    @asynccontextmanager
    async def independent_resolution_lock(self, item_id):
        await self.db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
                              {"key": "independent-resolution:" + str(item_id)})
        try:
            yield
        finally:
            await self.db.rollback()

    async def validate_dj_playback(self, session_id, user_id, release=True):
        await set_jwt_claims(self.db, user_id)
        await self.db.execute(text("SELECT require_dj_playback(:sid)"), {"sid": str(session_id)})
        session = await self.db.scalar(select(Session).where(Session.id == session_id))
        if user_id not in (session.dj_user_id, session.host_user_id):
            raise PermissionError("Only the host or DJ can control playback")
        if release:
            await self.db.rollback()

    async def create_dj(self, session_id, user_id, **kwargs):
        await self.validate_dj_playback(session_id, user_id, release=False)
        return await self.create(session_id=session_id, **kwargs)

    async def persist_independent_resolution(self, item_id, session_id, version, meta, youtube_url):
        session = await self.db.scalar(select(Session).where(Session.id == session_id)
            .with_for_update().execution_options(populate_existing=True))
        if not session or session.status != 'active' or session.playback_mode != 'independent' or session.playback_mode_version != version or (session.expires_at and session.expires_at <= datetime.now(timezone.utc)):
            raise HTTPException(409, 'Room mode changed. Refresh the room.')
        item = await self.db.scalar(select(QueueItem).where(QueueItem.id == item_id)
            .with_for_update().execution_options(populate_existing=True))
        if not item or item.status == 'skipped':
            raise HTTPException(409, 'This song is no longer available')
        if meta and item.resolve_status == 'resolving':
            item.title, item.artist = meta['title'], meta['artist']
            item.thumbnail_url = meta.get('thumbnailUrl')
            item.platform_links = meta.get('platformLinks', {})
            item.resolve_status = 'resolved'
        links = dict(item.platform_links or {})
        existing = links.get('youtube', '')
        if not re.fullmatch(r'https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}', existing):
            links['youtube'] = youtube_url
        item.platform_links = links
        await self.db.commit()
        return links['youtube']

    async def _get_with_profile(self, id: UUID) -> Optional[QueueItem]:
        result = await self.db.execute(
            select(QueueItem)
            .where(QueueItem.id == id)
            .options(selectinload(QueueItem.profiles))
            .execution_options(populate_existing=True)
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

    async def play_next(
        self, session_id: UUID, user_id: UUID, skip_status: str = "played"
    ) -> Optional[UUID]:
        await set_jwt_claims(self.db, user_id)
        result = await self.db.execute(
            text("SELECT play_next(:sid, :status, true)"),
            {"sid": str(session_id), "status": skip_status},
        )
        await self.db.commit()
        row = result.fetchone()
        return UUID(str(row[0])) if row and row[0] else None

    async def play_specific(
        self, session_id: UUID, user_id: UUID, item_id: UUID
    ) -> Optional[UUID]:
        await set_jwt_claims(self.db, user_id)
        result = await self.db.execute(
            text("SELECT play_specific_song(:sid, :iid, true)"),
            {"sid": str(session_id), "iid": str(item_id)},
        )
        await self.db.commit()
        row = result.fetchone()
        return UUID(str(row[0])) if row and row[0] else None

    async def play_previous(self, session_id: UUID, user_id: UUID) -> Optional[UUID]:
        await set_jwt_claims(self.db, user_id)
        result = await self.db.execute(
            text("SELECT play_previous_song(:sid, true)"),
            {"sid": str(session_id)},
        )
        await self.db.commit()
        row = result.fetchone()
        return UUID(str(row[0])) if row and row[0] else None

    async def force_skip(self, session_id: UUID, user_id: UUID) -> Optional[UUID]:
        return await self.play_next(session_id, user_id, skip_status="skipped")

    async def patch_youtube_link(
        self, item_id: UUID, youtube_url: str, user_id: UUID
    ) -> None:
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

    async def get_current_playing(self, session_id: UUID) -> Optional[QueueItem]:
        result = await self.db.execute(
            select(QueueItem)
            .where(QueueItem.session_id == session_id, QueueItem.status == "playing")
            .options(selectinload(QueueItem.profiles))
        )
        return result.scalar_one_or_none()

    async def get_last_played(self, session_id: UUID) -> Optional[QueueItem]:
        result = await self.db.execute(
            select(QueueItem)
            .where(QueueItem.session_id == session_id, QueueItem.status == "played")
            .order_by(QueueItem.position.desc())
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
        await self.db.execute(text("SELECT require_dj_playback((SELECT session_id FROM queue_items WHERE id=:id))"),
                              {"id": str(item_id)})
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
