import asyncio
import json
from collections import defaultdict
from typing import Any
from supabase.client import AsyncClient, acreate_client
from realtime.types import ChannelStates
from app.config import settings


def _patch_realtime_reconnect(realtime_client) -> None:
    """Guard asyncio.wait() against empty channel list — upstream bug in realtime<2.30."""
    active_states = {ChannelStates.JOINED, ChannelStates.JOINING}

    async def _reconnect() -> None:
        realtime_client._ws_connection = None
        to_rejoin = list(filter(lambda c: c.state in active_states, realtime_client.channels.values()))
        for channel in to_rejoin:
            channel.state = ChannelStates.ERRORED
        await realtime_client.connect()
        if realtime_client.is_connected and to_rejoin:
            await asyncio.wait([asyncio.Task(c._rejoin()) for c in to_rejoin])

    realtime_client._reconnect = _reconnect


class EventBus:
    def __init__(self) -> None:
        self._rooms: dict[str, list[asyncio.Queue]] = defaultdict(list)
        self._channels: dict[str, Any] = {}
        self._supabase: AsyncClient | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    async def _get_supabase(self) -> AsyncClient:
        if self._supabase is None:
            self._supabase = await acreate_client(settings.supabase_url, settings.supabase_anon_key)
            _patch_realtime_reconnect(self._supabase.realtime)
        return self._supabase

    async def subscribe(self, session_id: str) -> asyncio.Queue:
        if self._loop is None:
            self._loop = asyncio.get_running_loop()
        q: asyncio.Queue = asyncio.Queue()
        self._rooms[session_id].append(q)
        await self._ensure_channel(session_id)
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

    async def _ensure_channel(self, session_id: str) -> None:
        if session_id in self._channels:
            return

        loop = self._loop

        def on_change(payload):
            if loop is None or loop.is_closed():
                return
            inner = payload.get("data", {})
            table = inner.get("table", "")
            record = inner.get("record") or {}
            old_record = inner.get("old_record") or {}
            event_map = {
                "sessions": ("session_updated", record),
                "queue_items": ("queue_changed", {}),
                "session_participants": ("participants_changed", {}),
                "skip_votes": ("votes_changed", {"queue_item_id": (record or old_record).get("queue_item_id")}),
            }
            if table in event_map:
                event_type, data = event_map[table]
                asyncio.run_coroutine_threadsafe(
                    self.publish(session_id, event_type, data),
                    loop,
                )

        supabase = await self._get_supabase()
        channel = supabase.realtime.channel(f"session:{session_id}")
        for table in ("sessions", "queue_items", "session_participants", "skip_votes"):
            channel.on_postgres_changes("*", schema="public", table=table, callback=on_change)
        await channel.subscribe()
        self._channels[session_id] = channel

    def _close_channel(self, session_id: str) -> None:
        ch = self._channels.pop(session_id, None)
        if ch and self._loop and not self._loop.is_closed():
            asyncio.run_coroutine_threadsafe(ch.unsubscribe(), self._loop)

    def shutdown(self) -> None:
        if self._loop and not self._loop.is_closed():
            for ch in self._channels.values():
                asyncio.run_coroutine_threadsafe(ch.unsubscribe(), self._loop)
        self._channels.clear()


bus = EventBus()
