from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.config import settings
from app.dependencies import get_profile_service
from app.services.auth_service import AuthService
from app.schemas.auth import UserResponse

router = APIRouter()

_auth_svc = AuthService(
    supabase_url=settings.supabase_url,
    anon_key=settings.supabase_anon_key,
)


class MobileExchangeRequest(BaseModel):
    code: str
    code_verifier: str
    redirect_uri: str


class MobileTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: UserResponse


class MobileRefreshRequest(BaseModel):
    refresh_token: str


class MobileRefreshResponse(BaseModel):
    access_token: str
    refresh_token: str


@router.post("/exchange", response_model=MobileTokenResponse)
async def mobile_exchange(
    body: MobileExchangeRequest,
    profile_svc=Depends(get_profile_service),
):
    """Exchange PKCE auth code for tokens (mobile — returns JSON, no cookies)."""
    try:
        tokens = await _auth_svc.exchange_code(body.code, body.code_verifier)
    except Exception:
        raise HTTPException(status_code=400, detail="Token exchange failed")

    user_meta = tokens.get("user", {})
    user_id = UUID(user_meta["id"])
    user_metadata = user_meta.get("user_metadata", {})

    await profile_svc.upsert(
        user_id=user_id,
        display_name=user_metadata.get("full_name"),
        avatar_url=user_metadata.get("avatar_url"),
    )

    profile = await profile_svc.get(user_id)
    return MobileTokenResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user=UserResponse(
            id=user_id,
            display_name=profile.display_name if profile else user_metadata.get("full_name"),
            avatar_url=profile.avatar_url if profile else user_metadata.get("avatar_url"),
            preferred_platform=profile.preferred_platform if profile else None,
        ),
    )


@router.post("/refresh", response_model=MobileRefreshResponse)
async def mobile_refresh(body: MobileRefreshRequest):
    """Refresh access token using refresh token (mobile — returns JSON, no cookies)."""
    try:
        tokens = await _auth_svc.refresh_token(body.refresh_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Refresh failed")
    return MobileRefreshResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens.get("refresh_token", body.refresh_token),
    )
