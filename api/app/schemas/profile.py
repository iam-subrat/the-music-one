from uuid import UUID
from typing import Optional
from pydantic import BaseModel


class ProfileResponse(BaseModel):
    id: UUID
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    preferred_platform: Optional[str] = None

    model_config = {"from_attributes": True}


class PlatformUpdate(BaseModel):
    preferred_platform: str
