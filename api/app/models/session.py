from datetime import datetime
from uuid import UUID
from typing import Optional
from sqlalchemy import ForeignKey, func, text
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    invite_code: Mapped[str] = mapped_column(unique=True, nullable=False)
    host_user_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("profiles.id", ondelete="SET NULL"))
    dj_user_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("profiles.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(default="active")
    repeat_mode: Mapped[str] = mapped_column(default="none")
    playback_mode: Mapped[str] = mapped_column(default="dj", server_default="dj")
    playback_mode_version: Mapped[int] = mapped_column(default=0, server_default="0")
    auto_pilot: Mapped[bool] = mapped_column(default=False)
    max_participants: Mapped[int] = mapped_column(default=20)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    ended_at: Mapped[Optional[datetime]]
    last_activity_at: Mapped[Optional[datetime]] = mapped_column(server_default=func.now())
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        server_default=text("now() + interval '15 days'")
    )


class SessionParticipant(Base):
    __tablename__ = "session_participants"

    session_id: Mapped[UUID] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True)
    joined_at: Mapped[datetime] = mapped_column(server_default=func.now())
