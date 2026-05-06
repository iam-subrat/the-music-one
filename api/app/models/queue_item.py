from datetime import datetime
from uuid import UUID
from typing import Optional
from sqlalchemy import ForeignKey, Identity, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class QueueItem(Base):
    __tablename__ = "queue_items"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    session_id: Mapped[UUID] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    added_by_user_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("profiles.id", ondelete="SET NULL"))
    position: Mapped[int] = mapped_column(Identity(always=True))
    title: Mapped[str]
    artist: Mapped[str]
    thumbnail_url: Mapped[Optional[str]]
    platform_links: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(default="queued")
    added_at: Mapped[datetime] = mapped_column(server_default=func.now())
