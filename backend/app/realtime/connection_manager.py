import asyncio
import secrets
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, DefaultDict, Dict, Optional, Set

from fastapi import WebSocket


@dataclass(frozen=True)
class Room:
    name: str


class ConnectionManager:
    def __init__(self):
        # connection_id -> websocket
        self._connections: Dict[str, WebSocket] = {}

        # connection_id -> user_id
        self._conn_user: Dict[str, int] = {}

        # user_id -> connection_ids
        self._user_conns: DefaultDict[int, Set[str]] = defaultdict(set)

        # room_name -> connection_ids
        self._room_conns: DefaultDict[str, Set[str]] = defaultdict(set)

        # connection_id -> subscribed room_names
        self._conn_rooms: DefaultDict[str, Set[str]] = defaultdict(set)

        # presence
        self._online_users: Set[int] = set()
        self._online_project_members: DefaultDict[int, Set[int]] = defaultdict(set)

        # protects concurrent writes
        self._lock = asyncio.Lock()

    def _new_connection_id(self) -> str:
        return secrets.token_urlsafe(16)

    async def connect(self, websocket: WebSocket, user_id: int) -> str:
        await websocket.accept()
        connection_id = self._new_connection_id()

        async with self._lock:
            self._connections[connection_id] = websocket
            self._conn_user[connection_id] = user_id
            self._user_conns[user_id].add(connection_id)
            self._online_users.add(user_id)

        # subscribe defaults handled by router
        return connection_id

    async def disconnect(self, connection_id: str) -> None:
        async with self._lock:
            websocket = self._connections.pop(connection_id, None)
            user_id = self._conn_user.pop(connection_id, None)
            rooms = self._conn_rooms.pop(connection_id, set())

            for room in rooms:
                conns = self._room_conns.get(room)
                if conns and connection_id in conns:
                    conns.discard(connection_id)

            if user_id is not None:
                self._user_conns[user_id].discard(connection_id)
                if not self._user_conns[user_id]:
                    self._user_conns.pop(user_id, None)
                    self._online_users.discard(user_id)

                    for proj_id, members in list(self._online_project_members.items()):
                        members.discard(user_id)
                        if not members:
                            self._online_project_members.pop(proj_id, None)

        try:
            if websocket is not None:
                await websocket.close()
        except Exception:
            pass

    async def disconnect_user(self, user_id: int) -> None:
        """Best-effort disconnect of all websocket connections for a user."""
        async with self._lock:
            connection_ids = list(self._user_conns.get(user_id, set()))

        for cid in connection_ids:
            try:
                await self.disconnect(cid)
            except Exception:
                # best-effort cleanup
                pass

    async def subscribe(self, connection_id: str, room_name: str) -> None:
        async with self._lock:
            if connection_id not in self._connections:
                return
            self._room_conns[room_name].add(connection_id)
            self._conn_rooms[connection_id].add(room_name)

    async def unsubscribe(self, connection_id: str, room_name: str) -> None:
        async with self._lock:
            if connection_id not in self._connections:
                return
            self._room_conns[room_name].discard(connection_id)
            self._conn_rooms[connection_id].discard(room_name)

    async def publish(self, room_name: str, event: str, payload: Any) -> None:
        # payload is assumed small; caller should enforce
        stale: Set[str] = set()

        async with self._lock:
            connection_ids = set(self._room_conns.get(room_name, set()))

        for connection_id in connection_ids:
            websocket = self._connections.get(connection_id)
            if websocket is None:
                stale.add(connection_id)
                continue

            try:
                await websocket.send_json(
                    {
                        "event": event,
                        "payload": payload,
                    }
                )
            except Exception:
                stale.add(connection_id)

        if stale:
            for cid in stale:
                await self.disconnect(cid)

    async def publish_to_user(self, user_id: int, event: str, payload: Any) -> None:
        room_name = f"notifications:{user_id}"
        await self.publish(room_name, event, payload)

    async def publish_to_project(self, project_id: int, event: str, payload: Any) -> None:
        room_name = f"project:{project_id}"
        await self.publish(room_name, event, payload)

    async def publish_to_dashboard(self, event: str, payload: Any) -> None:
        await self.publish("dashboard:global", event, payload)

    async def update_project_presence(self, user_id: int, project_id: int) -> None:
        async with self._lock:
            self._online_project_members[project_id].add(user_id)

    def snapshot_presence(self) -> dict:
        return {
            "online_users": len(self._online_users),
            "online_projects": len(self._online_project_members),
            "online_project_members": {
                str(pid): len(members)
                for pid, members in self._online_project_members.items()
            },
        }


manager = ConnectionManager()

