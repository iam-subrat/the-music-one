import logging
import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
import yt_dlp
import asyncio

router = APIRouter()
logger = logging.getLogger(__name__)

_STREAM_CACHE = {}
_CACHE_TTL = 3600  # 1 hour in seconds

async def get_stream_url(video_id: str) -> str:
    now = asyncio.get_event_loop().time()
    if video_id in _STREAM_CACHE:
        url, timestamp = _STREAM_CACHE[video_id]
        if now - timestamp < _CACHE_TTL:
            return url

    ydl_opts = {
        "format": "bestaudio[ext=m4a]/bestaudio/best",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
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
    headers = {"Range": request.headers.get("Range", "bytes=0-")}
    
    async def stream_generator():
        async with httpx.AsyncClient(follow_redirects=True, timeout=None) as client:
            async with client.stream("GET", stream_url, headers=headers) as r:
                async for chunk in r.aiter_bytes(chunk_size=65536):
                    yield chunk

    async with httpx.AsyncClient(follow_redirects=True, timeout=None) as client:
        head_r = await client.head(stream_url, headers=headers)
        
    response_headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": head_r.headers.get("Content-Type", "audio/mp4"),
    }
    
    if "Content-Range" in head_r.headers:
        response_headers["Content-Range"] = head_r.headers["Content-Range"]
    if "Content-Length" in head_r.headers:
        response_headers["Content-Length"] = head_r.headers["Content-Length"]

    return StreamingResponse(
        stream_generator(),
        status_code=head_r.status_code if head_r.status_code in [200, 206] else 206,
        headers=response_headers
    )
