from __future__ import annotations
from typing import Optional
from uuid import UUID
from app.models.queue_item import QueueItem
from app.repositories.queue_repo import QueueRepository
from app.repositories.skip_vote_repo import SkipVoteRepository

SKIP_THRESHOLD = 3


class QueueService:
    def __init__(self, queue_repo, skip_vote_repo, song_service) -> None:
        self.repo = queue_repo
        self.vote_repo = skip_vote_repo
        self.song_svc = song_service

    async def get_queue(self, session_id: UUID) -> list[QueueItem]:
        return await self.repo.get_queue(session_id)

    async def add(self, session_id: UUID, user_id: UUID, url: str) -> QueueItem:
        meta = await self.song_svc.resolve_song_meta(url)
        return await self.repo.create(
            session_id=session_id,
            added_by_user_id=user_id,
            title=meta["title"],
            artist=meta["artist"],
            thumbnail_url=meta.get("thumbnailUrl"),
            platform_links=meta.get("platformLinks", {}),
            status="queued",
        )

    async def play_next(self, session_id: UUID, user_id: UUID) -> Optional[UUID]:
        return await self.repo.play_next(session_id, user_id, "played")

    async def force_skip(self, session_id: UUID, user_id: UUID) -> Optional[UUID]:
        return await self.repo.force_skip(session_id, user_id)

    async def patch_youtube_link(self, item_id: UUID, youtube_url: str, user_id: UUID) -> None:
        await self.repo.patch_youtube_link(item_id, youtube_url, user_id)

    async def cast_vote(self, queue_item_id: UUID, user_id: UUID, threshold: int = SKIP_THRESHOLD) -> bool:
        return await self.vote_repo.cast_vote(queue_item_id, user_id, threshold)

    async def remove_vote(self, queue_item_id: UUID, user_id: UUID) -> None:
        await self.vote_repo.remove_vote(queue_item_id, user_id)

    async def get_votes(self, queue_item_id: UUID) -> dict:
        return await self.vote_repo.get_votes(queue_item_id)
