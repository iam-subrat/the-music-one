from uuid import UUID
from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field
from app.schemas.profile import ProfileResponse


class SessionResponse(BaseModel):
    id: UUID
    invite_code: str
    host_user_id: Optional[UUID] = None
    dj_user_id: Optional[UUID] = None
    status: str
    repeat_mode: str
    playback_mode: Literal['dj', 'independent'] = 'dj'
    playback_mode_version: int = 0
    auto_pilot: bool
    max_participants: int
    created_at: datetime
    ended_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class RepeatModeUpdate(BaseModel):
    mode: str  # "none" | "song" | "queue"


class SessionCreate(BaseModel):
    playback_mode: Literal['dj', 'independent'] = 'dj'


class PlaybackModeUpdate(BaseModel):
    mode: Literal['dj', 'independent']
    expected_version: int = Field(ge=0)


class AutoPilotUpdate(BaseModel):
    enabled: bool


class DjPassRequest(BaseModel):
    new_dj_user_id: UUID
