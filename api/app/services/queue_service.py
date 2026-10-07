from __future__ import annotations
import logging
import re
from urllib.parse import urlparse, parse_qs
from typing import Optional
from uuid import UUID
from fastapi import HTTPException
from sqlalchemy.exc import DBAPIError
from app.models.queue_item import QueueItem

from app.store import Store
from app.services.song_service import SongService

SKIP_THRESHOLD = 3


def _majority(n: int) -> int:
    return max(1, n // 2 + 1)


class QueueService:
    def __init__(self, store: Store, song_svc: SongService) -> None:
        self.store = store
        self.song_svc = song_svc

    async def resolve_independent(self, item_id: UUID, user_id: UUID):
        item = await self.store.queue.get_by_id(item_id)
        if not item:
            raise HTTPException(404, 'Song not found')
        if not await self.store.sessions.is_participant(item.session_id, user_id):
            raise PermissionError('Not a session participant')
        async with self.store.queue.independent_resolution_lock(item_id):
            return await self._resolve_independent(item_id, user_id)

    async def _resolve_independent(self, item_id: UUID, user_id: UUID):
        item = await self.store.queue.get_by_id(item_id)
        if not item:
            raise HTTPException(404, 'Song not found')
        if not await self.store.sessions.is_participant(item.session_id, user_id):
            raise PermissionError('Not a session participant')
        session = await self.store.sessions.get_by_id(item.session_id)
        if not session or session.status != 'active' or session.playback_mode != 'independent':
            raise HTTPException(409, 'Shared Queue is not active')
        if not await self.store.sessions.embed_enabled():
            raise HTTPException(503, 'Embedded playback is disabled')
        if item.status == 'skipped' or item.resolve_status == 'failed':
            raise HTTPException(409, 'This song is unavailable')
        version, session_id = session.playback_mode_version, session.id
        meta = None
        if item.resolve_status == 'resolving' and item.source_url:
            meta = await self.song_svc.resolve_song_meta(item.source_url)
        links = meta.get('platformLinks', {}) if meta else (item.platform_links or {})
        url = links.get('youtube') or links.get('youtubemusic') or ''
        parsed = urlparse(url)
        video_id = None
        if parsed.hostname in ('youtube.com', 'www.youtube.com', 'music.youtube.com'):
            video_id = parse_qs(parsed.query).get('v', [None])[0]
        elif parsed.hostname == 'youtu.be':
            video_id = parsed.path.lstrip('/')
        if not video_id or not re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id):
            title, artist = (meta['title'], meta['artist']) if meta else (item.title, item.artist)
            result = await self.song_svc.resolve_youtube(f'{title} {artist}'.strip())
            video_id = result.get('id')
        if not video_id or not re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id):
            raise HTTPException(502, 'Could not find a playable video. Retry or choose another song.')
        canonical = await self.store.queue.persist_independent_resolution(item_id, session_id, version, meta,
                           f'https://www.youtube.com/watch?v={video_id}')
        return {'item_id': str(item_id), 'video_id': parse_qs(urlparse(canonical).query)['v'][0], 'youtube_url': canonical}

    async def get_queue(self, session_id: UUID) -> list[QueueItem]:
        return await self.store.queue.get_queue(session_id)

    async def add(self, session_id: UUID, user_id: UUID, url: str) -> QueueItem:
        if not await self.store.sessions.is_participant(session_id, user_id):
            raise PermissionError("Not a session participant")
        meta = await self.song_svc.resolve_song_meta(url)
        return await self.store.queue.create(
            session_id=session_id,
            added_by_user_id=user_id,
            title=meta["title"],
            artist=meta["artist"],
            thumbnail_url=meta.get("thumbnailUrl"),
            platform_links=meta.get("platformLinks", {}),
            status="queued",
            resolve_status="resolved",
        )

    async def add_by_search(
        self, session_id: UUID, user_id: UUID, name: str, artist: str = ""
    ) -> QueueItem:
        if not await self.store.sessions.is_participant(session_id, user_id):
            raise PermissionError('Not a session participant')
        meta = await self.song_svc.search_by_name(name, artist)
        return await self.store.queue.create(
            session_id=session_id,
            added_by_user_id=user_id,
            title=meta["title"],
            artist=meta["artist"],
            thumbnail_url=meta.get("thumbnailUrl"),
            platform_links=meta.get("platformLinks", {}),
            status="queued",
            resolve_status="resolved",
        )

    async def add_batch(
        self, session_id: UUID, user_id: UUID, tracks: list[dict]
    ) -> list[QueueItem]:
        if not await self.store.sessions.is_participant(session_id, user_id):
            raise PermissionError("Not a session participant")
        added: list[QueueItem] = []
        for track in tracks:
            try:
                item = await self.store.queue.create_stub(
                    session_id=session_id,
                    added_by_user_id=user_id,
                    title=track.get("title", ""),
                    artist=track.get("artist", ""),
                    thumbnail_url=track.get("thumbnail_url"),
                    source_url=track["url"],
                )
                added.append(item)
            except Exception as exc:
                logging.getLogger(__name__).warning(
                    "add_batch: failed to create stub for %s: %s", track.get("url"), exc
                )
        return added

    async def play_next(self, session_id: UUID, user_id: UUID) -> Optional[UUID]:
        if not await self.store.sessions.is_participant(session_id, user_id):
            raise PermissionError("Not a session participant")
        await self.store.queue.validate_dj_playback(session_id, user_id)
        next_item = await self.store.queue.get_next_queued(session_id)

        if not next_item:
            session = await self.store.sessions.get_by_id(session_id)
            if session and session.repeat_mode == "queue":
                return await self.store.queue.play_next(session_id, user_id, "played")
            
            if session and session.auto_pilot:
                current = await self.store.queue.get_current_playing(session_id)
                if not current:
                    current = await self.store.queue.get_last_played(session_id)
                if current:
                    try:
                        related_meta = await self.song_svc.get_related_song(current)
                        if related_meta:
                            await self.store.queue.create_dj(
                                session_id=session_id,
                                user_id=user_id,
                                added_by_user_id=session.dj_user_id or user_id,
                                title=related_meta["title"],
                                artist=related_meta["artist"],
                                thumbnail_url=related_meta.get("thumbnailUrl"),
                                platform_links=related_meta.get("platformLinks", {}),
                                status="queued",
                                resolve_status="resolved",
                            )
                            # Fall through to play the newly queued song
                            return await self.store.queue.play_next(session_id, user_id, "played")
                    except (DBAPIError, PermissionError, HTTPException):
                        raise
                    except Exception as exc:
                        logging.getLogger(__name__).warning("Auto-pilot failed: %s", exc)

            return None

        while next_item:
            if next_item.resolve_status != "resolving":
                return await self.store.queue.play_next(session_id, user_id, "played")
            try:
                meta = await self.song_svc.resolve_song_meta(next_item.source_url)
                await self.store.queue.mark_resolved(next_item.id, meta, user_id)
                return await self.store.queue.play_next(session_id, user_id, "played")
            except Exception:
                await self.store.queue.mark_failed(next_item.id, user_id)
                next_item = await self.store.queue.get_next_queued(session_id)

        return None

    async def play_specific(
        self, session_id: UUID, user_id: UUID, item_id: UUID
    ) -> Optional[UUID]:
        if not await self.store.sessions.is_participant(session_id, user_id):
            raise PermissionError("Not a session participant")
        await self.store.queue.validate_dj_playback(session_id, user_id)

        item = await self.store.queue.get_by_id(item_id)
        if not item:
            return None
        if item.resolve_status == "resolving":
            try:
                meta = await self.song_svc.resolve_song_meta(item.source_url)
                await self.store.queue.mark_resolved(item.id, meta, user_id)
            except Exception:
                await self.store.queue.mark_failed(item.id, user_id)
                return None

        return await self.store.queue.play_specific(session_id, user_id, item_id)

    async def play_previous(self, session_id: UUID, user_id: UUID) -> Optional[UUID]:
        if not await self.store.sessions.is_participant(session_id, user_id):
            raise PermissionError("Not a session participant")

        return await self.store.queue.play_previous(session_id, user_id)

    async def force_skip(self, session_id: UUID, user_id: UUID) -> Optional[UUID]:
        if not await self.store.sessions.is_participant(session_id, user_id):
            raise PermissionError("Not a session participant")
        return await self.store.queue.force_skip(session_id, user_id)

    async def patch_youtube_link(
        self, item_id: UUID, youtube_url: str, user_id: UUID
    ) -> None:
        await self.store.queue.patch_youtube_link(item_id, youtube_url, user_id)

    async def cast_vote(self, queue_item_id: UUID, user_id: UUID) -> bool:
        item = await self.store.queue.get_by_id(queue_item_id)
        if not item:
            raise PermissionError("Queue item not found")
        n = await self.store.sessions.count_participants(item.session_id)
        threshold = _majority(n)
        return await self.store.skip_votes.cast_vote(queue_item_id, user_id, threshold)

    async def remove_vote(self, queue_item_id: UUID, user_id: UUID) -> None:
        await self.store.skip_votes.remove_vote(queue_item_id, user_id)

    async def get_votes(self, queue_item_id: UUID) -> dict:
        return await self.store.skip_votes.get_votes(queue_item_id)
