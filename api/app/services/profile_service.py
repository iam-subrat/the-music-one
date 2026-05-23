from typing import Optional
from uuid import UUID
from app.models.profile import Profile

from app.store import Store


class ProfileService:
    def __init__(self, store: Store) -> None:
        self.store = store

    async def get(self, user_id: UUID) -> Optional[Profile]:
        return await self.store.profiles.get_by_id(user_id)

    async def upsert(
        self, user_id: UUID, display_name: str | None, avatar_url: str | None
    ) -> Profile:
        return await self.store.profiles.upsert(user_id, display_name, avatar_url)

    async def update_preferred_platform(
        self, user_id: UUID, platform: str
    ) -> Optional[Profile]:
        return await self.store.profiles.update_preferred_platform(user_id, platform)
