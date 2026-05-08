import asyncio
import json
from collections import defaultdict
from typing import Any
from supabase import create_client
from app.config import settings


class EventBus:
    def __init__(self) -> None:
        self._rooms: dict[str, list[asyncio.Queue]] = defaultdict(list)
        self._channels: dict[str, Any] = {}
        self._supabase = None
        self._loop: asyncio.AbstractEventLoop | None = None

    def _get_supabase(self):
        if self._supabase is None:
            self._supabase = create_client(settings.supabase_url, settings.supabase_anon_key)
        return self._supabase

    async def subscribe(self, session_id: str) -> asyncio.Queue:
        # Capture the running loop the first time we're called from async context
        if self._loop is None:
            self._loop = asyncio.get_running_loop()
        q: asyncio.Queue = asyncio.Queue()
        self._rooms[session_id].append(q)
        self._ensure_channel(session_id)
        return q

    async def unsubscribe(self, session_id: str, q: asyncio.Queue) -> None:
        try:
            self._rooms[session_id].remove(q)
        except ValueError:
            pass
        if not self._rooms[session_id]:
            del self._rooms[session_id]
            self._close_channel(session_id)

    async def publish(self, session_id: str, event_type: str, payload: Any) -> None:
        event = json.dumps({"type": event_type, "payload": payload})
        for q in list(self._rooms.get(session_id, [])):
            await q.put(event)

    def has_subscribers(self, session_id: str) -> bool:
        return bool(self._rooms.get(session_id))

    def _ensure_channel(self, session_id: str) -> None:
        if session_id in self._channels:
            return

        loop = self._loop

        def on_change(payload):
            if loop is None or loop.is_closed():
                return
            table = payload.get("table", "")
            event_map = {
                "sessions": ("session_updated", payload.get("new", {})),
                "queue_items": ("queue_changed", {}),
                "session_participants": ("participants_changed", {}),
                "skip_votes": ("votes_changed", {"queue_item_id": (payload.get("new") or payload.get("old") or {}).get("queue_item_id")}),
            }
            if table in event_map:
                event_type, data = event_map[table]
                asyncio.run_coroutine_threadsafe(
                    self.publish(session_id, event_type, data),
                    loop,
                )

        channel = self._get_supabase().realtime.channel(f"session:{session_id}")
        for table in ("sessions", "queue_items", "session_participants", "skip_votes"):
            channel.on_postgres_changes("*", schema="public", table=table, callback=on_change)
        channel.subscribe()
        self._channels[session_id] = channel

    def _close_channel(self, session_id: str) -> None:
        ch = self._channels.pop(session_id, None)
        if ch:
            ch.unsubscribe()

    def shutdown(self) -> None:
        for ch in self._channels.values():
            ch.unsubscribe()
        self._channels.clear()


bus = EventBus()
