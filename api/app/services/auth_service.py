import base64
import hashlib
import os
from typing import Tuple
from urllib.parse import quote
import httpx


class AuthService:
    def __init__(self, supabase_url: str, anon_key: str) -> None:
        self._supabase_url = supabase_url
        self._anon_key = anon_key

    def generate_pkce_pair(self) -> Tuple[str, str]:
        verifier = base64.urlsafe_b64encode(os.urandom(32)).rstrip(b"=").decode()
        digest = hashlib.sha256(verifier.encode()).digest()
        challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
        return verifier, challenge

    def build_oauth_url(self, challenge: str, redirect_uri: str) -> str:
        return (
            f"{self._supabase_url}/auth/v1/authorize"
            f"?provider=google"
            f"&code_challenge={challenge}"
            f"&code_challenge_method=S256"
            f"&redirect_to={quote(redirect_uri, safe='')}"
        )

    async def exchange_code(self, code: str, verifier: str) -> dict:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"{self._supabase_url}/auth/v1/token?grant_type=pkce",
                json={"auth_code": code, "code_verifier": verifier},
                headers={"apikey": self._anon_key, "Content-Type": "application/json"},
            )
            res.raise_for_status()
            return res.json()

    async def refresh_token(self, refresh_token: str) -> dict:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"{self._supabase_url}/auth/v1/token?grant_type=refresh_token",
                json={"refresh_token": refresh_token},
                headers={"apikey": self._anon_key, "Content-Type": "application/json"},
            )
            res.raise_for_status()
            return res.json()
