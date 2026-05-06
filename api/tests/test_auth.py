import pytest
from app.services.auth_service import AuthService


def test_generate_pkce_pair_lengths():
    svc = AuthService(supabase_url="https://x.supabase.co", anon_key="key")
    verifier, challenge = svc.generate_pkce_pair()
    assert len(verifier) >= 43
    assert len(challenge) >= 43


def test_generate_pkce_pair_unique():
    svc = AuthService(supabase_url="https://x.supabase.co", anon_key="key")
    v1, c1 = svc.generate_pkce_pair()
    v2, c2 = svc.generate_pkce_pair()
    assert v1 != v2
