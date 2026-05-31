from __future__ import annotations

from typing import Any, Optional


class EventDispatcher:
    # Event mapping by spec: targeted rooms, no naive global broadcasts

    def room_for_event(
        self,
        event: str,
        *,
        project_id: int | None = None,
        user_id: int | None = None,
    ) -> list[str]:
        # Always return room names. Router/manager publishes.
        rooms: list[str] = []

        if event.startswith("task."):
            if project_id is not None:
                rooms.append(f"project:{project_id}")
            return rooms

        if event.startswith("comment."):
            if project_id is not None:
                rooms.append(f"project:{project_id}")
            return rooms

        if event.startswith("notification."):
            if user_id is not None:
                rooms.append(f"notifications:{user_id}")
            return rooms

        if event.startswith("automation.") or event.startswith("workflow."):
            rooms.append("dashboard:global")
            if project_id is not None:
                rooms.append(f"project:{project_id}")
            return rooms

        if event.startswith("analytics."):
            rooms.append("dashboard:global")
            if project_id is not None:
                rooms.append(f"project:{project_id}")
            return rooms

        if event.startswith("ai."):
            rooms.append("dashboard:global")
            if project_id is not None:
                rooms.append(f"project:{project_id}")
            if user_id is not None:
                rooms.append(f"notifications:{user_id}")
            return rooms

        if event == "activity.created":
            # dashboard activity feed + project context
            rooms.append("dashboard:global")
            if project_id is not None:
                rooms.append(f"project:{project_id}")
            return rooms

        if event.startswith("project."):
            if project_id is not None:
                rooms.append(f"project:{project_id}")
            rooms.append("dashboard:global")
            return rooms

        if event.startswith("invitation."):
            if project_id is not None:
                rooms.append(f"project:{project_id}")
            rooms.append("dashboard:global")
            return rooms

        if event.startswith("attachment."):
            if project_id is not None:
                rooms.append(f"project:{project_id}")
            return rooms

        if event.startswith("sprint.") or event.startswith("roadmap.") or event.startswith("milestone."):
            if project_id is not None:
                rooms.append(f"project:{project_id}")
            rooms.append("dashboard:global")
            return rooms

        # default: no rooms
        return rooms


dispatcher = EventDispatcher()

