import json
from contextvars import ContextVar
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

playback_request_version = ContextVar('playback_request_version', default='')


async def set_jwt_claims(db: AsyncSession, user_id: UUID) -> None:
    """Set request.jwt.claims so auth.uid() returns user_id for the current transaction."""
    claims = json.dumps({"sub": str(user_id), "role": "authenticated"})
    await db.execute(
        text("SELECT set_config('request.jwt.claims', :c, true)"),
        {"c": claims},
    )
    await db.execute(text("SELECT set_config('app.playback_mode_version', :v, true)"),
                     {'v': playback_request_version.get()})
