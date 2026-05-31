from __future__ import annotations

from app.analytics.executive_insights import build_executive_insights
from app.analytics.forecasting_engine import build_forecasts
from app.analytics.metrics_aggregator import clamp, collect_operational_data, daily_series
from app.analytics.productivity_engine import build_productivity_metrics
from app.analytics.reporting_engine import build_reports
from app.analytics.sprint_analytics import build_sprint_analytics
from app.analytics.workload_engine import build_workload_intelligence


def build_automation_metrics(data: dict):
    executions = data["automation_executions"]
    rules = data["automation_rules"]
    successes = len([execution for execution in executions if execution.status == "success"])
    failures = len([execution for execution in executions if execution.status == "failed"])
    total = len(executions)
    return {
        "summary": {
            "rules": len(rules),
            "enabled_rules": len([rule for rule in rules if rule.enabled]),
            "executions": total,
            "successes": successes,
            "failures": failures,
            "success_rate": clamp(successes / max(total, 1) * 100),
        },
        "trend": daily_series(executions, lambda execution: execution.created_at, 14),
        "recent": [
            {
                "id": execution.id,
                "rule_id": execution.rule_id,
                "trigger_type": execution.trigger_type,
                "status": execution.status,
                "created_at": execution.created_at,
                "error": execution.error,
            }
            for execution in sorted(executions, key=lambda item: item.created_at, reverse=True)[:12]
        ],
    }


def build_task_distribution(tasks):
    statuses = ["todo", "in_progress", "review", "blocked", "completed"]
    return [
        {"status": status, "count": len([task for task in tasks if task.status == status])}
        for status in statuses
    ]


def build_enterprise_analytics(db, current_user=None, role=None):
    data = collect_operational_data(db, current_user, role)
    productivity = build_productivity_metrics(data)
    workload = build_workload_intelligence(data)
    sprint = build_sprint_analytics(data)
    automation = build_automation_metrics(data)
    forecasts = build_forecasts(data, productivity, workload, sprint)
    executive = build_executive_insights(data, productivity, workload, sprint, forecasts, automation)

    overdue_tasks = len([
        task for task in data["tasks"]
        if task.due_date and task.due_date < data["now"] and task.status != "completed"
    ])
    completed_tasks = len([task for task in data["tasks"] if task.status == "completed"])
    organization_health = clamp(
        forecasts["organization"]["delivery_confidence"] * 0.34 +
        productivity["team"]["productivity_score"] * 0.28 +
        sprint["summary"]["predictability"] * 0.2 +
        automation["summary"]["success_rate"] * 0.1 -
        overdue_tasks * 2
    )

    kpis = {
        "organization_health": organization_health,
        "delivery_confidence": forecasts["organization"]["delivery_confidence"],
        "productivity": productivity["team"]["productivity_score"],
        "task_completion_rate": productivity["team"]["completion_rate"],
        "overdue_rate": productivity["team"]["overdue_rate"],
        "sprint_velocity": sprint["summary"]["average_velocity"],
        "sprint_predictability": sprint["summary"]["predictability"],
        "automation_success_rate": automation["summary"]["success_rate"],
        "automation_successful_executions": automation["summary"]["successes"],
        "active_users": len([member for member in productivity["members"] if member["collaboration_activity"] > 0]),
        "collaboration_activity": len(data["activities"]) + len(data["comments"]),
        "completed_tasks": completed_tasks,
        "total_tasks": len(data["tasks"]),
        "overdue_tasks": overdue_tasks,
    }

    payload = {
        "scope": data["scope"],
        "generated_at": data["now"],
        "kpis": kpis,
        "productivity": productivity,
        "members": productivity["members"],
        "workload": workload,
        "sprint": sprint,
        "automation": automation,
        "forecasts": forecasts,
        "executive": executive,
        "task_distribution": build_task_distribution(data["tasks"]),
        "trends": {
            "activity": daily_series(data["activities"], lambda activity: activity.created_at, 14),
            "comments": daily_series(data["comments"], lambda comment: comment.created_at, 14),
            "automation": automation["trend"],
            "task_completion": daily_series(
                [activity for activity in data["activities"] if activity.action == "task_completed" or activity.action_type == "task_completed"],
                lambda activity: activity.created_at,
                14,
            ),
        },
        "heatmap": [
            {
                "day": item["date"][-5:],
                "activity": item["value"],
            }
            for item in daily_series(data["activities"], lambda activity: activity.created_at, 7)
        ],
    }
    payload["reports"] = build_reports(payload)
    return payload
