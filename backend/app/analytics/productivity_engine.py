from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from app.analytics.metrics_aggregator import clamp, serialize_user


def build_productivity_metrics(data: dict):
    now = data["now"]
    tasks = data["tasks"]
    activities = data["activities"]
    comments = data["comments"]
    attachments = data["attachments"]
    users = data["users"]
    recent_completed_task_ids = {
        activity.task_id
        for activity in activities
        if activity.task_id
        and (activity.action == "task_completed" or activity.action_type == "task_completed")
        and activity.created_at
        and activity.created_at >= now - timedelta(days=14)
    }

    by_user = defaultdict(lambda: {
        "assigned": 0,
        "completed": 0,
        "completed_recent": 0,
        "overdue": 0,
        "blocked": 0,
        "in_progress": 0,
        "collaboration": 0,
        "comments": 0,
        "attachments": 0,
        "points": 0,
    })

    for task in tasks:
        if not task.assigned_to:
            continue
        row = by_user[task.assigned_to]
        row["assigned"] += 1
        row["points"] += task.estimate_points or 1
        if task.status == "completed":
            row["completed"] += 1
            if task.id in recent_completed_task_ids:
                row["completed_recent"] += 1
        if task.status == "blocked":
            row["blocked"] += 1
        if task.status == "in_progress":
            row["in_progress"] += 1
        if task.due_date and task.due_date < now and task.status != "completed":
            row["overdue"] += 1

    for activity in activities:
        if activity.user_id:
            by_user[activity.user_id]["collaboration"] += 1

    for comment in comments:
        if comment.author_id:
            by_user[comment.author_id]["comments"] += 1

    for attachment in attachments:
        uploader_id = attachment.uploader_id or attachment.uploaded_by
        if uploader_id:
            by_user[uploader_id]["attachments"] += 1

    members = []
    for user in users:
        stats = by_user[user.id]
        completion_rate = stats["completed"] / max(stats["assigned"], 1) * 100
        overdue_rate = stats["overdue"] / max(stats["assigned"], 1) * 100
        blocked_rate = stats["blocked"] / max(stats["assigned"], 1) * 100
        collaboration_score = clamp((stats["collaboration"] + stats["comments"] * 2 + stats["attachments"]) * 2)
        focus_score = clamp(100 - (stats["in_progress"] * 8) - (stats["blocked"] * 12) + stats["completed_recent"] * 8)
        productivity_score = clamp(
            completion_rate * 0.45 +
            collaboration_score * 0.2 +
            focus_score * 0.2 -
            overdue_rate * 0.25 -
            blocked_rate * 0.2
        )
        burnout_risk = clamp(stats["points"] * 2 + stats["overdue"] * 12 + stats["blocked"] * 8 - stats["completed_recent"] * 4)
        members.append({
            "user_id": user.id,
            "user": user.full_name,
            "role": user.role,
            "assigned_tasks": stats["assigned"],
            "completed_tasks": stats["completed"],
            "completed_recent": stats["completed_recent"],
            "in_progress_tasks": stats["in_progress"],
            "blocked_tasks": stats["blocked"],
            "overdue_tasks": stats["overdue"],
            "estimated_points": stats["points"],
            "completion_rate": clamp(completion_rate),
            "collaboration_activity": stats["collaboration"],
            "comments": stats["comments"],
            "attachments": stats["attachments"],
            "focus_score": focus_score,
            "productivity": productivity_score,
            "burnout_risk": burnout_risk,
            "user_profile": serialize_user(user),
        })

    completed = len([task for task in tasks if task.status == "completed"])
    overdue = len([task for task in tasks if task.due_date and task.due_date < now and task.status != "completed"])
    blocked = len([task for task in tasks if task.status == "blocked"])

    return {
        "members": sorted(members, key=lambda item: item["productivity"], reverse=True),
        "team": {
            "productivity_score": clamp(sum(member["productivity"] for member in members) / max(len(members), 1)),
            "completion_rate": clamp(completed / max(len(tasks), 1) * 100),
            "overdue_rate": clamp(overdue / max(len(tasks), 1) * 100),
            "blocked_rate": clamp(blocked / max(len(tasks), 1) * 100),
            "collaboration_intensity": clamp((len(activities) + len(comments) * 2 + len(attachments)) / max(len(users), 1)),
        },
    }
