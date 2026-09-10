import logging
import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
import yt_dlp
import asyncio

router = APIRouter()
logger = logging.getLogger(__name__)

_STREAM_CACHE = {}
_CACHE_TTL = 300  # 5 minutes in seconds


async def get_stream_url(video_id: str, force_refresh: bool = False) -> str:
    now = asyncio.get_event_loop().time()
    if not force_refresh and video_id in _STREAM_CACHE:
        url, timestamp = _STREAM_CACHE[video_id]
        if now - timestamp < _CACHE_TTL:
            return url


    ydl_opts = {
        "format": "bestaudio[ext=m4a]/bestaudio/best",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "extractor_args": {"youtube": {"player_client": ["ios", "android"]}}
    }


    def extract():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            return ydl.extract_info(
                f"https://www.youtube.com/watch?v={video_id}", download=False
            )

    try:
        info = await asyncio.to_thread(extract)
        if not info or "url" not in info:
            raise ValueError("Could not extract stream URL")

        stream_url = info["url"]
        _STREAM_CACHE[video_id] = (stream_url, now)
        return stream_url
    except Exception as e:
        logger.error(f"Failed to extract stream for {video_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to resolve audio stream")


@router.get("/{video_id}/stream")
async def get_youtube_stream(video_id: str, request: Request):
    stream_url = await get_stream_url(video_id)
    
    req_headers = {
        "User-Agent": request.headers.get("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")
    }
    if "range" in request.headers:
        req_headers["Range"] = request.headers["range"]

    client = httpx.AsyncClient(follow_redirects=True, timeout=None)
    r = await client.send(client.build_request("GET", stream_url, headers=req_headers), stream=True)

    if r.status_code not in [200, 206]:
        # Upstream URL might have expired; force refresh stream URL once
        await r.aclose()
        stream_url = await get_stream_url(video_id, force_refresh=True)
        r = await client.send(client.build_request("GET", stream_url, headers=req_headers), stream=True)

    if r.status_code not in [200, 206]:
        await r.aclose()
        await client.aclose()
        raise HTTPException(status_code=502, detail="Audio stream unavailable")

    response_headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": r.headers.get("Content-Type", "audio/mp4"),
    }
    if "content-range" in r.headers:
        response_headers["Content-Range"] = r.headers["content-range"]
    if "content-length" in r.headers:
        response_headers["Content-Length"] = r.headers["content-length"]

    async def stream_generator():
        try:
            async for chunk in r.aiter_bytes(chunk_size=65536):
                yield chunk
        finally:
            await r.aclose()
            await client.aclose()

    return StreamingResponse(
        stream_generator(),
        status_code=r.status_code,
        headers=response_headers,
    )
