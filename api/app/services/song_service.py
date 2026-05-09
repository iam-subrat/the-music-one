import httpx
from fastapi import HTTPException
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
            try:
                res = await client.get(_ODESLI_URL, params=params, timeout=10)
                res.raise_for_status()
            except httpx.TimeoutException:
                raise HTTPException(status_code=503, detail="Song lookup timed out. Try again.")
            except httpx.HTTPStatusError as e:
                status = e.response.status_code
                if status == 400:
                    raise HTTPException(status_code=422, detail="Unrecognized or unsupported URL.")
                if status == 429:
                    raise HTTPException(status_code=429, detail="Too many requests. Try again shortly.")
                raise HTTPException(status_code=502, detail="Song lookup service unavailable.")
            except httpx.RequestError:
                raise HTTPException(status_code=502, detail="Song lookup service unavailable.")
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
        if not settings.youtube_api_key:
            return {"id": None, "title": None}
        async with httpx.AsyncClient() as client:
            try:
                res = await client.get(
                    "https://www.googleapis.com/youtube/v3/search",
                    params={
                        "part": "snippet",
                        "type": "video",
                        "maxResults": 1,
                        "q": query,
                        "key": settings.youtube_api_key,
                    },
                    timeout=5.5,
                )
                if not res.is_success:
                    return {"id": None, "title": None}
                items = res.json().get("items", [])
                if not items:
                    return {"id": None, "title": None}
                item = items[0]
                return {
                    "id": item["id"]["videoId"],
                    "title": item["snippet"]["title"],
                }
            except Exception:
                return {"id": None, "title": None}
