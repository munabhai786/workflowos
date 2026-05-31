from __future__ import annotations

import asyncio
from typing import Any, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.core.security import decode_token
from app.core.database import SessionLocal
from app.models.project_member import ProjectMember
from app.models.project import Project

from app.realtime.connection_manager import manager as connection_manager
from app.realtime.event_dispatcher import dispatcher


router = APIRouter()


async def authorize_project_membership(db, user_id: int, project_id: int) -> bool:
    if not project_id:
        return False

    project = db.query(Project).filter(Project.id == project_id).first()
    if project and project.owner_id == user_id:
        return True

    member = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id)
        .filter(ProjectMember.user_id == user_id)
        .first()
    )
    return member is not None


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
    project_id: int | None = None,
):
    payload = decode_token(token)
    if not payload:
        await websocket.close(code=1008)
        return

    user_id = int(payload.get("user_id") or payload.get("sub"))

    db = SessionLocal()
    connection_id: Optional[str] = None

    try:
        connection_id = await connection_manager.connect(websocket, user_id)

        # Defaults: targeted rooms
        await connection_manager.subscribe(connection_id, f"notifications:{user_id}")
        await connection_manager.subscribe(connection_id, "dashboard:global")

        # Optional: join a project room (still authorize)
        if project_id is not None:
            if await authorize_project_membership(db, user_id, project_id):
                await connection_manager.subscribe(connection_id, f"project:{project_id}")
                await connection_manager.update_project_presence(user_id, project_id)
                await connection_manager.publish(
                    f"project:{project_id}",
                    "presence.online",
                    {"project_id": project_id, "user_id": user_id},
                )

        # presence ping loop (optional)
        while True:
            message = await websocket.receive_json()
            event = message.get("event")

            if event == "ping":
                await websocket.send_json({"event": "pong"})
                continue

            if event == "subscribe":
                rooms = message.get("rooms") or []
                if not isinstance(rooms, list):
                    continue

                for room in rooms:
                    if not isinstance(room, str):
                        continue

                    # room auth
                    if room.startswith("project:"):
                        try:
                            pid = int(room.split(":", 1)[1])
                        except Exception:
                            continue

                        if not await authorize_project_membership(db, user_id, pid):
                            continue

                        await connection_manager.subscribe(connection_id, room)
                        await connection_manager.update_project_presence(user_id, pid)

                        await connection_manager.publish(
                            room,
                            "presence.online",
                            {"project_id": pid, "user_id": user_id},
                        )
                    else:
                        # notifications:{user_id} and dashboard:global
                        if room == f"notifications:{user_id}" or room == "dashboard:global":
                            await connection_manager.subscribe(connection_id, room)

                continue

            if event == "unsubscribe":
                rooms = message.get("rooms") or []
                if not isinstance(rooms, list):
                    continue
                for room in rooms:
                    if isinstance(room, str):
                        await connection_manager.unsubscribe(connection_id, room)
                continue

    except WebSocketDisconnect:
        pass
    finally:
        try:
            if connection_id:
                await connection_manager.disconnect(connection_id)
        finally:
            db.close()

