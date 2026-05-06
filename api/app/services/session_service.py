from typing import Optional
from uuid import UUID
from sqlalchemy import text
from app.models.session import Session
from app.repositories.session_repo import SessionRepository
from app.repositories.profile_repo import ProfileRepository


class SessionService:
    def __init__(self, session_repo: SessionRepository, profile_repo: ProfileRepository) -> None:
        self.repo = session_repo
        self.profile_repo = profile_repo

    async def create(self, host_user_id: UUID) -> Session:
        session = await self.repo.create(host_user_id=host_user_id)
        await self.repo.join(session.id, host_user_id)
        return session

    async def get_by_code(self, code: str) -> Optional[Session]:
        return await self.repo.get_by_code(code)

    async def get_by_id(self, session_id: UUID) -> Optional[Session]:
        return await self.repo.get_by_id(session_id)

    async def join(self, session_id: UUID, user_id: UUID) -> None:
        await self.repo.join(session_id, user_id)

    async def leave(self, session_id: UUID, user_id: UUID) -> None:
        await self.repo.leave(session_id, user_id)

    async def end(self, session_id: UUID, user_id: UUID) -> None:
        session = await self.repo.get_by_id(session_id)
        if not session or session.host_user_id != user_id:
            raise PermissionError("Only the host can end the session")
        await self.repo.end(session_id)

    async def set_repeat_mode(self, session_id: UUID, mode: str, user_id: UUID) -> None:
        await self.repo.db.execute(
            text("SELECT set_repeat_mode(:sid, :mode)"),
            {"sid": str(session_id), "mode": mode},
        )
        await self.repo.db.commit()

    async def pass_dj(self, session_id: UUID, new_dj_id: UUID, user_id: UUID) -> None:
        await self.repo.db.execute(
            text("SELECT pass_dj_token(:sid, :new_dj)"),
            {"sid": str(session_id), "new_dj": str(new_dj_id)},
        )
        await self.repo.db.commit()

    async def get_participants(self, session_id: UUID) -> list:
        return await self.repo.get_participants(session_id)
