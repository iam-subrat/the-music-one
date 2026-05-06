from datetime import datetime
from uuid import UUID
from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    display_name: Mapped[Optional[str]]
    avatar_url: Mapped[Optional[str]]
    preferred_platform: Mapped[Optional[str]]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
