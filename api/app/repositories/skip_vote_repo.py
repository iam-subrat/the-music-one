from typing import Optional
from uuid import UUID
from sqlalchemy import select, delete, text
from app.models.skip_vote import SkipVote
from app.repositories.base import AbstractRepository


class SkipVoteRepository(AbstractRepository):
    async def get_by_id(self, id: UUID) -> Optional[SkipVote]:
        result = await self.db.execute(
            select(SkipVote).where(SkipVote.queue_item_id == id)
        )
        return result.scalar_one_or_none()

    async def create(self, **kwargs) -> SkipVote:
        vote = SkipVote(**kwargs)
        self.db.add(vote)
        await self.db.commit()
        return vote

    async def cast_vote(self, queue_item_id: UUID, user_id: UUID, threshold: int) -> bool:
        result = await self.db.execute(
            text("SELECT cast_skip_vote(:item_id, :user_id, :threshold)"),
            {"item_id": str(queue_item_id), "user_id": str(user_id), "threshold": threshold},
        )
        await self.db.commit()
        row = result.fetchone()
        return bool(row[0]) if row else False

    async def remove_vote(self, queue_item_id: UUID, user_id: UUID) -> None:
        await self.db.execute(
            delete(SkipVote)
            .where(SkipVote.queue_item_id == queue_item_id)
            .where(SkipVote.user_id == user_id)
        )
        await self.db.commit()

    async def get_votes(self, queue_item_id: UUID) -> dict:
        result = await self.db.execute(
            select(SkipVote).where(SkipVote.queue_item_id == queue_item_id)
        )
        votes = result.scalars().all()
        return {
            "queue_item_id": queue_item_id,
            "count": len(votes),
            "user_ids": [v.user_id for v in votes],
        }
