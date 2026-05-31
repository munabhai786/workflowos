from app.services.task_service import create_task


def execute_create_task(payload: dict, db, current_user):
    task = create_task(db, payload, current_user)
    return {
        "task": task,
        "task_id": task.id,
        "message": f"✓ Task created: {task.title}",
        "action_result": {
            "intent": "create_task",
            "task_id": task.id,
            "title": task.title,
            "priority": task.priority,
            "due_date": task.due_date.isoformat() if task.due_date else None,
            "status": task.status,
            "project_id": task.project_id,
            "assigned_to": task.assigned_to,
        },
    }
