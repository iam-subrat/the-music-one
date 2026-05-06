from typing import Optional
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.models.profile import Profile
from app.repositories.base import AbstractRepository


class ProfileRepository(AbstractRepository):
    async def get_by_id(self, id: UUID) -> Optional[Profile]:
        result = await self.db.execute(select(Profile).where(Profile.id == id))
        return result.scalar_one_or_none()

    async def create(self, **kwargs) -> Profile:
        profile = Profile(**kwargs)
        self.db.add(profile)
        await self.db.commit()
        await self.db.refresh(profile)
        return profile

    async def upsert(self, id: UUID, display_name: str | None, avatar_url: str | None) -> Profile:
        stmt = (
            pg_insert(Profile)
            .values(id=id, display_name=display_name, avatar_url=avatar_url)
            .on_conflict_do_nothing(index_elements=["id"])
            .returning(Profile)
        )
        result = await self.db.execute(stmt)
        await self.db.commit()
        existing = await self.get_by_id(id)
        return existing

    async def update_preferred_platform(self, id: UUID, platform: str) -> Optional[Profile]:
        profile = await self.get_by_id(id)
        if not profile:
            return None
        profile.preferred_platform = platform
        await self.db.commit()
        await self.db.refresh(profile)
        return profile
