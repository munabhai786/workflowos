from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException

from app.core.deps import get_current_user


# NOTE:
# Central RBAC guard.
#
# - Platform-level access is based on `current_user.role` (global role).
# - Project-level access is based on the membership role via `ProjectMember.role`.
#
# This module is intentionally minimal/incremental to avoid architectural changes.
#
# Migration strategy:
# - Add guard calls to the most sensitive routes first.
# - Remove/ignore any legacy client-supplied `role` Header usage.


@dataclass(frozen=True)
class PermissionDecision:
    allowed: bool
    reason: str | None = None


class RBAC:
    # Global role → coarse permissions.
    # Project-scoped permissions are handled separately via `ProjectMember`.
    GLOBAL_ADMIN = "Admin"
    GLOBAL_MANAGER = "Manager"
    GLOBAL_MEMBER = "Member"
    GLOBAL_VIEWER = "Viewer"

    # Platform-level permissions
    PLATFORM_PERMS = {
        GLOBAL_ADMIN: {"*"},
        GLOBAL_MANAGER: {
            "admin_panel",
            "system_settings",
            "user_management",
            "audit_logs",
            "analytics",
            "approvals",
            "workflows",
            "workflow_execution",
            "projects_write",
            "tasks_write",
            "reports_read",
        },
        GLOBAL_MEMBER: {
            "comments",
            "collaboration",
            "uploads",
            "ai_copilot",
            "assigned_work",
        },
        GLOBAL_VIEWER: {
            "read_only",
        },
    }


    # Permission checks that do not require DB lookups beyond the authenticated user.
    @classmethod
    def check_global_permission(cls, *, user_role: str, permission: str) -> PermissionDecision:
        perms = cls.PLATFORM_PERMS.get(user_role)
        if not perms:
            return PermissionDecision(False, "Unknown role")

        if "*" in perms:
            return PermissionDecision(True)

        if permission in perms:
            return PermissionDecision(True)

        # Viewer is strictly read-only
        if permission == "read_only" and user_role == cls.GLOBAL_VIEWER:
            return PermissionDecision(True)

        return PermissionDecision(False, f"Role {user_role} lacks permission {permission}")


def require_permission(permission: str):
    """FastAPI dependency factory.

    Usage:
        current_user = Depends(get_current_user)
        require_permission("tasks_write")(current_user)

    This is not intended to replace route-level dependency injection entirely;
    it is a small helper to keep migrations incremental.
    """

    def _checker(current_user):
        decision = RBAC.check_global_permission(
            user_role=current_user.role,
            permission=permission,
        )
        if not decision.allowed:
            raise HTTPException(status_code=403, detail="Permission denied")
        return True

    return _checker

