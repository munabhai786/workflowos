from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from app.analytics.metrics_aggregator import clamp, serialize_user


def build_workload_intelligence(data: dict):
    now = data["now"]
    users = {user.id: user for user in data["users"] if user}
    workload = defaultdict(lambda: {
        "points": 0,
        "active_tasks": 0,
        "overdue_tasks": 0,
        "blocked_tasks": 0,
        "scheduled_tasks": 0,
        "days": defaultdict(int),
    })

    for task in data["tasks"]:
        if not task.assigned_to:
            continue
        row = workload[task.assigned_to]
        points = task.estimate_points or 1
        if task.status != "completed":
            row["points"] += points
            row["active_tasks"] += 1
        if task.status == "blocked":
            row["blocked_tasks"] += 1
        if task.due_date and task.due_date < now and task.status != "completed":
            row["overdue_tasks"] += 1
        start = task.scheduled_start or task.due_date
        end = task.scheduled_end or task.due_date or start
        if start:
            row["scheduled_tasks"] += 1
            active_day = start.date()
            last_day = end.date() if end else active_day
            while active_day <= last_day:
                row["days"][active_day.isoformat()] += points
                active_day += timedelta(days=1)

    rows = []
    risks = []
    for user_id, row in workload.items():
        daily_peak = max(row["days"].values()) if row["days"] else 0
        utilization = clamp(row["points"] / 40 * 100, maximum=200)
        burnout = clamp(utilization * 0.45 + row["overdue_tasks"] * 12 + row["blocked_tasks"] * 10 + daily_peak * 4)
        item = {
            "user": serialize_user(users.get(user_id)),
            "assigned_points": row["points"],
            "active_tasks": row["active_tasks"],
            "scheduled_tasks": row["scheduled_tasks"],
            "overdue_tasks": row["overdue_tasks"],
            "blocked_tasks": row["blocked_tasks"],
            "daily_peak": daily_peak,
            "utilization": utilization,
            "burnout_risk": burnout,
            "overloaded": utilization > 95 or burnout > 70,
            "days": dict(row["days"]),
        }
        rows.append(item)
        if item["overloaded"]:
            risks.append({
                "type": "capacity_risk",
                "severity": "high" if burnout > 80 else "medium",
                "message": f"{item['user']['full_name'] if item['user'] else 'A teammate'} is trending above sustainable capacity.",
                "user": item["user"],
            })

    return {
        "users": sorted(rows, key=lambda item: item["burnout_risk"], reverse=True),
        "risks": risks,
        "heatmap": [
            {
                "user": item["user"]["full_name"] if item["user"] else "Unassigned",
                "utilization": item["utilization"],
                "burnout_risk": item["burnout_risk"],
                "days": item["days"],
            }
            for item in rows
        ],
    }
