from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.feature_flag import FeatureFlag

router = APIRouter()


@router.get("/")
async def get_flags(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FeatureFlag))
    flags = result.scalars().all()
    return [{"key": f.key, "enabled": f.enabled} for f in flags]
