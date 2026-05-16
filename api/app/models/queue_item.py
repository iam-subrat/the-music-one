from datetime import datetime
from uuid import UUID
from typing import Optional, TYPE_CHECKING
from sqlalchemy import ForeignKey, Identity, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base

if TYPE_CHECKING:
    from app.models.profile import Profile


class QueueItem(Base):
    __tablename__ = "queue_items"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    session_id: Mapped[UUID] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    added_by_user_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("profiles.id", ondelete="SET NULL"))
    position: Mapped[int] = mapped_column(Identity(always=True))
    profiles: Mapped[Optional["Profile"]] = relationship("Profile", foreign_keys=[added_by_user_id], lazy="raise")
    title: Mapped[str]
    artist: Mapped[str]
    thumbnail_url: Mapped[Optional[str]]
    platform_links: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(default="queued")
    added_at: Mapped[datetime] = mapped_column(server_default=func.now())
