from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.schemas.profile import ProfileResponse


class SessionResponse(BaseModel):
    id: UUID
    invite_code: str
    host_user_id: Optional[UUID] = None
    dj_user_id: Optional[UUID] = None
    status: str
    repeat_mode: str
    max_participants: int
    created_at: datetime
    ended_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class RepeatModeUpdate(BaseModel):
    mode: str  # "none" | "song" | "queue"


class DjPassRequest(BaseModel):
    new_dj_user_id: UUID
