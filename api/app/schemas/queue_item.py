from uuid import UUID
from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel


class QueueItemCreate(BaseModel):
    url: str


class ProfileSummary(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None

    model_config = {"from_attributes": True}


class QueueItemResponse(BaseModel):
    id: UUID
    session_id: UUID
    added_by_user_id: Optional[UUID] = None
    profiles: Optional[ProfileSummary] = None
    position: int
    title: str
    artist: str
    thumbnail_url: Optional[str] = None
    platform_links: dict = {}
    status: str
    source_url: Optional[str] = None
    resolve_status: Literal["resolving", "resolved", "failed"] = "resolved"
    added_at: datetime

    model_config = {"from_attributes": True}


class YouTubeLinkUpdate(BaseModel):
    youtube_url: str


class CastVoteRequest(BaseModel):
    threshold: int = 3


class SkipVoteResponse(BaseModel):
    queue_item_id: UUID
    count: int
    user_ids: list[UUID]
