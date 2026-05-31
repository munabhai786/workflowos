from __future__ import annotations


def build_executive_insights(data: dict, productivity: dict, workload: dict, sprint: dict, forecasts: dict, automation: dict):
    insights = []
    recommendations = []

    if forecasts["organization"]["delivery_confidence"] < 70:
        insights.append({
            "type": "delivery_risk",
            "severity": "high",
            "title": "Delivery confidence needs attention",
            "message": f"Organization delivery confidence is {forecasts['organization']['delivery_confidence']}% based on overdue work, sprint predictability, and workload pressure.",
        })

    if productivity["team"]["blocked_rate"] > 15:
        insights.append({
            "type": "bottleneck",
            "severity": "high",
            "title": "Blocked work is creating execution drag",
            "message": f"{productivity['team']['blocked_rate']}% of tasks are blocked.",
        })
        recommendations.append("Review ownership and escalation rules for blocked work.")

    overloaded = [user for user in workload["users"] if user["overloaded"]]
    if overloaded:
        insights.append({
            "type": "burnout_risk",
            "severity": "high",
            "title": "Capacity pressure detected",
            "message": f"{len(overloaded)} teammate(s) are above sustainable workload thresholds.",
        })
        recommendations.append("Rebalance sprint scope or shift work away from overloaded owners.")

    if automation["summary"]["success_rate"] < 85 and automation["summary"]["executions"] > 0:
        insights.append({
            "type": "automation_reliability",
            "severity": "medium",
            "title": "Automation reliability is below target",
            "message": f"Automation success rate is {automation['summary']['success_rate']}%.",
        })
        recommendations.append("Audit failing automation rules and reduce noisy triggers.")

    risky_projects = [project for project in forecasts["projects"] if project["delivery_confidence"] < 70]
    for project in risky_projects[:3]:
        insights.append({
            "type": "project_forecast",
            "severity": "medium",
            "title": f"{project['project']['name']} delivery risk",
            "message": f"{project['project']['name']} has {project['delivery_confidence']}% delivery confidence.",
        })

    if not insights:
        insights.append({
            "type": "operational_health",
            "severity": "low",
            "title": "Operating system is healthy",
            "message": "Productivity, workload, sprint predictability, and automation reliability are within healthy ranges.",
        })
        recommendations.append("Maintain current execution cadence and continue monitoring workload distribution.")

    summary = " ".join([
        f"Organization health is {forecasts['organization']['delivery_confidence']}% delivery confidence.",
        f"Team productivity is {productivity['team']['productivity_score']}%.",
        f"Sprint predictability is {sprint['summary']['predictability']}%.",
        f"Automation completed {automation['summary']['successes']} successful execution(s).",
    ])

    return {
        "summary": summary,
        "insights": insights,
        "recommendations": recommendations[:6],
    }
