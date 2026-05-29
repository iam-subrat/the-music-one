"""Security tests for playlist_service — Bug 9 (log injection) and Bug 11 (host match too broad)."""
from app.services.playlist_service import detect_playlist, _sanitise_log_body


# ── Bug 11: detect_playlist host-matching security ────────────────────────────

def test_detect_playlist_rejects_evil_spotify_subdomain():
    result = detect_playlist("https://evil-spotify.com.attacker.io/playlist/abc")
    assert result is None


def test_detect_playlist_rejects_youtube_look_alike():
    result = detect_playlist("https://youtube.com.evil.io/?list=PLabc")
    assert result is None


def test_detect_playlist_accepts_valid_spotify():
    result = detect_playlist("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")
    assert result == ("spotify", "37i9dQZF1DXcBWIGoYBM5M")


def test_detect_playlist_accepts_valid_youtube():
    result = detect_playlist("https://www.youtube.com/playlist?list=PLbpi6ZahtOH6Ar_3GPy3workFY")
    assert result == ("youtube", "PLbpi6ZahtOH6Ar_3GPy3workFY")


# ── Bug 9: _sanitise_log_body strips newlines ─────────────────────────────────

def test_sanitise_log_body_strips_newlines():
    result = _sanitise_log_body("line1\nline2\r\nline3", 100)
    assert "\n" not in result
    assert "\r" not in result
