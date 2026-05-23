from typing import Optional
from uuid import UUID
from app.models.session import Session

from app.store import Store


class SessionService:
    def __init__(self, store: Store) -> None:
        self.store = store

    async def create(self, host_user_id: UUID) -> Session:
        session = await self.store.sessions.create(host_user_id=host_user_id)
        await self.store.sessions.join(session.id, host_user_id)
        return session

    async def get_by_code(self, code: str) -> Optional[Session]:
        return await self.store.sessions.get_by_code(code)

    async def get_by_id(self, session_id: UUID) -> Optional[Session]:
        return await self.store.sessions.get_by_id(session_id)

    async def join(self, session_id: UUID, user_id: UUID) -> None:
        await self.store.sessions.join(session_id, user_id)

    async def leave(self, session_id: UUID, user_id: UUID) -> None:
        await self.store.sessions.leave(session_id, user_id)

    async def end(self, session_id: UUID, user_id: UUID) -> None:
        session = await self.store.sessions.get_by_id(session_id)
        if not session or session.host_user_id != user_id:
            raise PermissionError("Only the host can end the session")
        await self.store.sessions.end(session_id)

    async def set_repeat_mode(self, session_id: UUID, mode: str, user_id: UUID) -> None:
        await self.store.sessions.set_repeat_mode(session_id, mode, user_id)

    async def pass_dj(self, session_id: UUID, new_dj_id: UUID, user_id: UUID) -> None:
        await self.store.sessions.pass_dj(session_id, new_dj_id, user_id)

    async def touch(self, session_id: UUID) -> None:
        await self.store.sessions.touch(session_id)

    async def get_participants(self, session_id: UUID) -> list:
        return await self.store.sessions.get_participants(session_id)
