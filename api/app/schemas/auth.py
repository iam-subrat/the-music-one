from uuid import UUID
from pydantic import BaseModel


class UserResponse(BaseModel):
    id: UUID
    email: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    preferred_platform: str | None = None

    model_config = {"from_attributes": True}
