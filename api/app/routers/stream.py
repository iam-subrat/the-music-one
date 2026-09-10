import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
import yt_dlp
import asyncio

router = APIRouter()
logger = logging.getLogger(__name__)

# Basic in-memory cache to avoid repeated yt-dlp calls for the same video.
# Stream URLs typically expire after ~6 hours, so caching for 1 hour is safe.
_STREAM_CACHE = {}
_CACHE_TTL = 3600  # 1 hour in seconds


async def get_stream_url(video_id: str) -> str:
    now = asyncio.get_event_loop().time()

    # Check cache
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
            # We use extract_info with download=False
            return ydl.extract_info(
                f"https://www.youtube.com/watch?v={video_id}", download=False
            )

    try:
        # Run in threadpool as yt-dlp is blocking
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
async def get_youtube_stream(video_id: str):
    """
    Resolves a YouTube video ID to a direct audio stream URL and redirects the client.
    This allows native iOS/Android media players to stream the audio directly
    without needing a YouTube iframe.
    """
    stream_url = await get_stream_url(video_id)
    # Redirecting directly to the stream URL so the HTML5 <audio> tag can consume it
    return RedirectResponse(url=stream_url)
