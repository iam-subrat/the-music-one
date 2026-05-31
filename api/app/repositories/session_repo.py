import random
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4
from sqlalchemy import select, update, delete, text, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.models.session import Session, SessionParticipant
from app.models.profile import Profile
from app.repositories.base import AbstractRepository
from app.repositories.db_auth import set_jwt_claims

_INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _gen_code() -> str:
    return "".join(random.choices(_INVITE_CHARS, k=6))


class SessionRepository(AbstractRepository):
    async def get_by_id(self, id: UUID) -> Optional[Session]:
        result = await self.db.execute(select(Session).where(Session.id == id))
        return result.scalar_one_or_none()

    async def get_by_code(self, code: str) -> Optional[Session]:
        result = await self.db.execute(
            select(Session).where(Session.invite_code == code.upper())
        )
        return result.scalar_one_or_none()

    async def create(self, host_user_id: UUID, **kwargs) -> Session:
        for _ in range(5):
            code = _gen_code()
            existing = await self.get_by_code(code)
            if not existing:
                break
        session = Session(
            id=uuid4(),
            invite_code=code,
            host_user_id=host_user_id,
            dj_user_id=host_user_id,
            status="active",
        )
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)
        return session

    async def end(self, session_id: UUID) -> None:
        await self.db.execute(
            update(Session)
            .where(Session.id == session_id)
            .values(status="ended", ended_at=datetime.utcnow())
        )
        await self.db.commit()

    async def join(self, session_id: UUID, user_id: UUID, client_id: str = "legacy") -> None:
        stmt = (
            pg_insert(SessionParticipant)
            .values(session_id=session_id, user_id=user_id, client_id=client_id)
            .on_conflict_do_update(
                index_elements=["session_id", "user_id", "client_id"],
                set_={"last_seen_at": datetime.utcnow()},
            )
        )
        await self.db.execute(stmt)
        await self.db.commit()

    async def leave(self, session_id: UUID, user_id: UUID, client_id: str = "legacy") -> None:
        await self.db.execute(
            delete(SessionParticipant)
            .where(SessionParticipant.session_id == session_id)
            .where(SessionParticipant.user_id == user_id)
            .where(SessionParticipant.client_id == client_id)
        )
        await self.db.commit()

    async def touch_client(self, session_id: UUID, user_id: UUID, client_id: str = "legacy") -> None:
        await self.db.execute(
            update(SessionParticipant)
            .where(SessionParticipant.session_id == session_id)
            .where(SessionParticipant.user_id == user_id)
            .where(SessionParticipant.client_id == client_id)
            .values(last_seen_at=datetime.utcnow())
        )
        await self.db.commit()

    async def touch(self, session_id: UUID) -> None:
        await self.db.execute(
            update(Session)
            .where(Session.id == session_id)
            .values(last_activity_at=datetime.utcnow())
        )
        await self.db.commit()

    async def get_participants(self, session_id: UUID) -> list:
        result = await self.db.execute(
            select(SessionParticipant, Profile)
            .join(Profile, Profile.id == SessionParticipant.user_id)
            .where(SessionParticipant.session_id == session_id)
        )
        return [
            {
                "id": p.id,
                "display_name": p.display_name,
                "avatar_url": p.avatar_url,
                "preferred_platform": p.preferred_platform,
                "joined_at": sp.joined_at,
            }
            for sp, p in result.all()
        ]

    async def count_participants(self, session_id: UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(SessionParticipant)
            .where(SessionParticipant.session_id == session_id)
        )
        return int(result.scalar() or 0)

    async def is_participant(self, session_id: UUID, user_id: UUID) -> bool:
        result = await self.db.execute(
            select(SessionParticipant).where(
                SessionParticipant.session_id == session_id,
                SessionParticipant.user_id == user_id,
            )
        )
        return result.scalar_one_or_none() is not None

    async def set_repeat_mode(self, session_id: UUID, mode: str, user_id: UUID) -> None:
        await set_jwt_claims(self.db, user_id)
        await self.db.execute(
            text("SELECT set_repeat_mode(:sid, :mode)"),
            {"sid": str(session_id), "mode": mode},
        )
        await self.db.commit()

    async def pass_dj(self, session_id: UUID, new_dj_id: UUID, user_id: UUID) -> None:
        await set_jwt_claims(self.db, user_id)
        await self.db.execute(
            text("SELECT pass_dj_token(:sid, :new_dj)"),
            {"sid": str(session_id), "new_dj": str(new_dj_id)},
        )
        await self.db.commit()
