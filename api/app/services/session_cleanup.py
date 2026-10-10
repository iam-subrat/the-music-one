import asyncio
import logging
from sqlalchemy import text
from app.database import AsyncSessionLocal
from app.services.event_bus import bus

logger = logging.getLogger(__name__)


async def expire_stale_sessions(db):
    result = await db.execute(text("""
        UPDATE sessions SET status = 'ended', ended_at = now()
        WHERE status != 'ended' AND expires_at <= now()
        RETURNING id
    """))
    ids = list(result.scalars())
    await db.commit()
    return ids


async def run_session_cleanup(session_factory=AsyncSessionLocal, publish=bus.publish, interval_seconds=12 * 60 * 60):
    while True:
        try:
            async with session_factory() as db:
                ids = await expire_stale_sessions(db)
            for session_id in ids:
                await publish(str(session_id), 'session_updated', {'status': 'ended', 'expired': True})
            if ids:
                logger.info('Expired %d inactive sessions', len(ids))
        except Exception:
            logger.exception('Session expiry cleanup failed; retrying on the next interval')
        await asyncio.sleep(interval_seconds)
