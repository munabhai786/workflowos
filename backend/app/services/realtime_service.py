import asyncio
import threading
from typing import Any

from app.realtime.connection_manager import manager as connection_manager
from app.realtime.event_dispatcher import dispatcher


def _run_publish_in_thread(coro_factory):
    def _runner():
        try:
            asyncio.run(coro_factory())
        except Exception:
            pass

    threading.Thread(target=_runner, daemon=True).start()


# Compatibility layer: keep old function signatures so existing routes
# can keep calling schedule_project_event()/schedule_global_event().


def schedule_project_event(project_id: int | None, event: str, payload: Any):
    if project_id is None:
        return

    # Use dispatcher mapping (project events should target project room)
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        async def _publish_threaded():
            rooms = dispatcher.room_for_event(event, project_id=project_id)
            for room in rooms:
                await connection_manager.publish(room, event, payload)

        _run_publish_in_thread(_publish_threaded)
        return

    async def _publish():
        rooms = dispatcher.room_for_event(event, project_id=project_id)
        for room in rooms:
            await connection_manager.publish(room, event, payload)

    loop.create_task(_publish())


def schedule_global_event(event: str, payload: Any):
    # Map legacy "global" to dashboard room only (no naive broadcasts).
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        async def _publish_threaded():
            await connection_manager.publish("dashboard:global", event, payload)

        _run_publish_in_thread(_publish_threaded)
        return

    async def _publish():
        await connection_manager.publish("dashboard:global", event, payload)

    loop.create_task(_publish())


def schedule_user_event(user_id: int | None, event: str, payload: Any):
    if user_id is None:
        return

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        async def _publish_threaded():
            await connection_manager.publish(f"notifications:{user_id}", event, payload)

        _run_publish_in_thread(_publish_threaded)
        return

    async def _publish():
        await connection_manager.publish(f"notifications:{user_id}", event, payload)

    loop.create_task(_publish())
