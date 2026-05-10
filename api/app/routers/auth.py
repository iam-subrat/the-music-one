from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from app.config import settings
from app.dependencies import get_current_user, get_profile_service
from app.services.auth_service import AuthService
from app.schemas.auth import UserResponse

router = APIRouter()

_auth_svc = AuthService(
    supabase_url=settings.supabase_url,
    anon_key=settings.supabase_anon_key,
)


@router.get("/google")
async def login_google(request: Request):
    verifier, challenge = _auth_svc.generate_pkce_pair()
    redirect_uri = str(request.url_for("auth_callback"))
    oauth_url = _auth_svc.build_oauth_url(challenge, redirect_uri)
    response = RedirectResponse(url=oauth_url)
    response.set_cookie(
        "pkce_verifier", verifier,
        httponly=True, samesite="lax", secure=True, max_age=60,
    )
    return response


@router.get("/callback", name="auth_callback")
async def auth_callback(
    code: str,
    response: Response,
    pkce_verifier: str | None = Cookie(default=None),
    profile_svc=Depends(get_profile_service),
):
    if not pkce_verifier:
        raise HTTPException(status_code=400, detail="Missing PKCE verifier")
    try:
        tokens = await _auth_svc.exchange_code(code, pkce_verifier)
    except Exception:
        raise HTTPException(status_code=400, detail="Token exchange failed")

    user_meta = tokens.get("user", {})
    user_id = UUID(user_meta["id"])
    await profile_svc.upsert(
        user_id=user_id,
        display_name=user_meta.get("user_metadata", {}).get("full_name"),
        avatar_url=user_meta.get("user_metadata", {}).get("avatar_url"),
    )

    redirect = RedirectResponse(url=settings.frontend_url, status_code=302)
    redirect.set_cookie("access_token", tokens["access_token"], httponly=True, samesite="none", secure=True, max_age=60 * 60 * 24 * 7)
    redirect.set_cookie("refresh_token", tokens["refresh_token"], httponly=True, samesite="none", secure=True, max_age=60 * 60 * 24 * 30)
    redirect.delete_cookie("pkce_verifier")
    return redirect


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"ok": True}


@router.post("/refresh")
async def refresh(
    response: Response,
    refresh_token: str | None = Cookie(default=None),
):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        tokens = await _auth_svc.refresh_token(refresh_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Refresh failed")
    response.set_cookie("access_token", tokens["access_token"], httponly=True, samesite="none", secure=True, max_age=60 * 60 * 24 * 7)
    return {"ok": True}



@router.get("/me", response_model=UserResponse)
async def me(
    user_id: UUID = Depends(get_current_user),
    profile_svc=Depends(get_profile_service),
):
    profile = await profile_svc.get(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return UserResponse(
        id=user_id,
        display_name=profile.display_name,
        avatar_url=profile.avatar_url,
        preferred_platform=profile.preferred_platform,
    )
