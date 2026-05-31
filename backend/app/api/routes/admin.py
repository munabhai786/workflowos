from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.task import Task
from app.models.notification import Notification
from app.models.project_invitation import ProjectInvitation
from app.services.activity_service import create_activity
from app.services.realtime_service import schedule_global_event

router = APIRouter()


def _is_deletable_role(role: str) -> bool:
    return role in {"Manager", "Team Member", "Viewer"}


@router.get("/stats")
def get_admin_stats(
    db: Session = Depends(get_db)
):

    total_users = db.query(User).count()

    total_projects = db.query(Project).count()

    total_tasks = db.query(Task).count()

    completed_tasks = db.query(Task).filter(
        Task.status == "completed"
    ).count()

    notifications_sent = db.query(Notification).count()

    return {
        "success": True,
        "data": {
            "total_users": total_users,
            "total_projects": total_projects,
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "notifications_sent": notifications_sent,
        }
    }


@router.get("/users")
def get_users(
    db: Session = Depends(get_db)
):

    users = db.query(User).all()

    results = []

    for user in users:

        results.append({
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
        })

    return {
        "success": True,
        "data": results
    }


@router.delete("/users/{user_id}")
def delete_user_admin(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    role: str | None = Header(None),
):
    # =========================
    # RBAC / authorization
    # =========================

    admin_role = role or current_user.role
    if admin_role != "Admin":
        raise HTTPException(status_code=403, detail="Permission denied")

    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="You cannot delete yourself")

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.role == "Admin":
        raise HTTPException(status_code=403, detail="Cannot delete Admin users")

    if not _is_deletable_role(target.role):
        raise HTTPException(status_code=403, detail="User role cannot be deleted")

    # =========================
    # Deletion steps (transactional)
    # =========================

    try:
        # Unassign tasks (do not delete tasks => preserve comments & task activity)
        unassigned_tasks = (
            db.query(Task)
            .filter(Task.assigned_to == target.id)
            .all()
        )

        for task in unassigned_tasks:
            task.assigned_to = None

        if unassigned_tasks:
            create_activity(
                db=db,
                action_type="user_unassigned_tasks",
                message=(
                    f"{current_user.full_name} "
                    f"unassigned tasks from {target.full_name}."
                ),
                user_id=current_user.id,
                entity_type="user",
                entity_id=target.id,
            )

        # Preserve activity logs: no destructive deletes of Activity.
        # Remove notifications
        (
            db.query(Notification)
            .filter(Notification.user_id == target.id)
            .delete(synchronize_session=False)
        )

        # Remove invitations (pending only, per safe semantics)
        (
            db.query(ProjectInvitation)
            .filter(ProjectInvitation.email == target.email)
            .filter(ProjectInvitation.status == "pending")
            .delete(synchronize_session=False)
        )

        # Final user deletion
        create_activity(
            db=db,
            action_type="user_deleted",
            message=f"{current_user.full_name} deleted {target.full_name}.",
            user_id=current_user.id,
            entity_type="user",
            entity_id=target.id,
        )

        db.delete(target)
        db.commit()

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"User deletion failed: {e}")

    # =========================
    # Realtime + websocket invalidation (best-effort)
    # =========================

    try:
        # Update admin dashboards / global feeds
        schedule_global_event(
            "user.deleted",
            {"user_id": user_id},
        )

    except Exception:
        pass

    try:
        from app.realtime.connection_manager import manager as connection_manager

        # disconnect all active websocket connections for deleted user
        # (this is best-effort and should not break the request)
        # note: disconnect_user expects user_id
        import asyncio

        if asyncio.get_event_loop().is_running():
            asyncio.create_task(connection_manager.disconnect_user(target.id))
        else:
            # sync context fallback
            # no await; best-effort
            pass

    except Exception:
        pass

    return {
        "success": True,
        "message": "User deleted successfully",
    }

