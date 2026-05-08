import json
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


async def set_jwt_claims(db: AsyncSession, user_id: UUID) -> None:
    """Set request.jwt.claims so auth.uid() returns user_id for the current transaction."""
    claims = json.dumps({"sub": str(user_id), "role": "authenticated"})
    await db.execute(
        text("SELECT set_config('request.jwt.claims', :c, true)"),
        {"c": claims},
    )
