from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from app.dependencies import get_current_user, get_profile_service
from app.services.profile_service import ProfileService
from app.schemas.profile import ProfileResponse, PlatformUpdate

router = APIRouter()


@router.get("/{user_id}", response_model=ProfileResponse)
async def get_profile(
    user_id: UUID,
    svc: ProfileService = Depends(get_profile_service),
):
    profile = await svc.get(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.patch("/me", response_model=ProfileResponse)
async def update_platform(
    body: PlatformUpdate,
    user_id: UUID = Depends(get_current_user),
    svc: ProfileService = Depends(get_profile_service),
):
    profile = await svc.update_preferred_platform(user_id, body.preferred_platform)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile
