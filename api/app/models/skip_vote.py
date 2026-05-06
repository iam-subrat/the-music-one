from datetime import datetime
from uuid import UUID
from sqlalchemy import ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class SkipVote(Base):
    __tablename__ = "skip_votes"

    queue_item_id: Mapped[UUID] = mapped_column(ForeignKey("queue_items.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True)
    voted_at: Mapped[datetime] = mapped_column(server_default=func.now())
