from __future__ import annotations
import logging
from typing import Optional
from uuid import UUID
from app.models.queue_item import QueueItem

from app.store import Store
from app.services.song_service import SongService

SKIP_THRESHOLD = 3


class QueueService:
    def __init__(self, store: Store, song_svc: SongService) -> None:
        self.store = store
        self.song_svc = song_svc

    async def get_queue(self, session_id: UUID) -> list[QueueItem]:
        return await self.store.queue.get_queue(session_id)

    async def add(self, session_id: UUID, user_id: UUID, url: str) -> QueueItem:
        meta = await self.song_svc.resolve_song_meta(url)
        return await self.store.queue.create(
            session_id=session_id,
            added_by_user_id=user_id,
            title=meta["title"],
            artist=meta["artist"],
            thumbnail_url=meta.get("thumbnailUrl"),
            platform_links=meta.get("platformLinks", {}),
            status="queued",
            resolve_status="resolved",
        )

    async def add_batch(
        self, session_id: UUID, user_id: UUID, tracks: list[dict]
    ) -> list[QueueItem]:
        added: list[QueueItem] = []
        for track in tracks:
            try:
                item = await self.store.queue.create_stub(
                    session_id=session_id,
                    added_by_user_id=user_id,
                    title=track.get("title", ""),
                    artist=track.get("artist", ""),
                    thumbnail_url=track.get("thumbnail_url"),
                    source_url=track["url"],
                )
                added.append(item)
            except Exception as exc:
                logging.getLogger(__name__).warning(
                    "add_batch: failed to create stub for %s: %s", track.get("url"), exc
                )
        return added

    async def play_next(
        self, session_id: UUID, user_id: UUID, depth: int = 0
    ) -> Optional[UUID]:
        if depth >= 10:
            return None

        next_item = await self.store.queue.get_next_queued(session_id)
        if not next_item:
            return None

        if next_item.resolve_status == "resolving":
            item_id = next_item.id
            source_url = next_item.source_url
            try:
                meta = await self.song_svc.resolve_song_meta(source_url)
                await self.store.queue.mark_resolved(item_id, meta, user_id)
            except Exception:
                await self.store.queue.mark_failed(item_id, user_id)
                return await self.play_next(session_id, user_id, depth + 1)

        return await self.store.queue.play_next(session_id, user_id, "played")

    async def force_skip(self, session_id: UUID, user_id: UUID) -> Optional[UUID]:
        return await self.store.queue.force_skip(session_id, user_id)

    async def patch_youtube_link(
        self, item_id: UUID, youtube_url: str, user_id: UUID
    ) -> None:
        await self.store.queue.patch_youtube_link(item_id, youtube_url, user_id)

    async def cast_vote(
        self, queue_item_id: UUID, user_id: UUID, threshold: int = SKIP_THRESHOLD
    ) -> bool:
        return await self.store.skip_votes.cast_vote(queue_item_id, user_id, threshold)

    async def remove_vote(self, queue_item_id: UUID, user_id: UUID) -> None:
        await self.store.skip_votes.remove_vote(queue_item_id, user_id)

    async def get_votes(self, queue_item_id: UUID) -> dict:
        return await self.store.skip_votes.get_votes(queue_item_id)
