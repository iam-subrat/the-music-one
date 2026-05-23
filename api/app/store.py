from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.profile_repo import ProfileRepository
from app.repositories.session_repo import SessionRepository
from app.repositories.queue_repo import QueueRepository
from app.repositories.skip_vote_repo import SkipVoteRepository


class Store:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.profiles = ProfileRepository(db)
        self.sessions = SessionRepository(db)
        self.queue = QueueRepository(db)
        self.skip_votes = SkipVoteRepository(db)

    async def commit(self) -> None:
        await self.db.commit()

    async def rollback(self) -> None:
        await self.db.rollback()
