import httpx
from app.config import settings

_KEY_REMAP = {
    "itunes": "applemusic",
    "applemusic": "applemusic",
    "youtubemusic": "youtubemusic",
    "amazon": "amazonmusic",
    "amazonmusic": "amazonmusic",
    "jiosaavn": "jiosaavn",
    "gaana": "gaana",
}

_ODESLI_URL = "https://api.song.link/v1-alpha.1/links"


class SongService:
    async def resolve_song_meta(self, url: str) -> dict:
        params = {"url": url}
        if settings.odesli_api_key:
            params["key"] = settings.odesli_api_key

        async with httpx.AsyncClient() as client:
            res = await client.get(_ODESLI_URL, params=params, timeout=10)
            res.raise_for_status()
            data = res.json()

        key = data.get("entityUniqueId") or next(iter(data.get("entitiesByUniqueId", {})), None)
        entity = data.get("entitiesByUniqueId", {}).get(key, {})

        platform_links = {}
        for platform, info in data.get("linksByPlatform", {}).items():
            normalized = platform.lower()
            mapped = _KEY_REMAP.get(normalized, normalized)
            if info.get("url"):
                platform_links[mapped] = info["url"]

        return {
            "title": entity.get("title", ""),
            "artist": entity.get("artistName", ""),
            "thumbnailUrl": entity.get("thumbnailUrl"),
            "platformLinks": platform_links,
        }

    async def resolve_youtube(self, query: str) -> dict:
        if not settings.searxng_url:
            return {"id": None, "title": None}
        async with httpx.AsyncClient() as client:
            try:
                res = await client.get(
                    settings.searxng_url,
                    params={"q": query},
                    timeout=5.5,
                )
                if not res.is_success:
                    return {"id": None, "title": None}
                data = res.json()
                url = data.get("url")
                if not url:
                    return {"id": None, "title": None}
                video_id = _extract_video_id(url)
                return {"id": video_id, "title": data.get("title")}
            except Exception:
                return {"id": None, "title": None}


def _extract_video_id(url: str) -> str | None:
    try:
        from urllib.parse import urlparse, parse_qs
        u = urlparse(url)
        if "youtu.be" in u.hostname:
            return u.path.lstrip("/")
        v = parse_qs(u.query).get("v", [None])[0]
        if v:
            return v
        import re
        match = re.search(r"/(v|embed)/([^/?]+)", u.path)
        return match.group(2) if match else None
    except Exception:
        return None
