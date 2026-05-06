from typing import Optional
from uuid import UUID
from app.models.profile import Profile
from app.repositories.profile_repo import ProfileRepository


class ProfileService:
    def __init__(self, repo: ProfileRepository) -> None:
        self.repo = repo

    async def get(self, user_id: UUID) -> Optional[Profile]:
        return await self.repo.get_by_id(user_id)

    async def upsert(self, user_id: UUID, display_name: str | None, avatar_url: str | None) -> Profile:
        return await self.repo.upsert(user_id, display_name, avatar_url)

    async def update_preferred_platform(self, user_id: UUID, platform: str) -> Optional[Profile]:
        return await self.repo.update_preferred_platform(user_id, platform)
