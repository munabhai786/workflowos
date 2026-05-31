from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from io import BytesIO
from textwrap import wrap

from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.models.activity import Activity
from app.models.ai_agent import AIApprovalHistory, AIRecommendation, AISummary
from app.models.analytics import (
    AnalyticsSnapshot,
    ProductivityMetric,
    SprintMetric,
    WorkloadMetric,
)
from app.models.project import Project
from app.models.sprint import Sprint
from app.models.task import Task
from app.models.user import User


REPORT_TYPES = {
    "weekly": "Weekly Report",
    "sprint": "Sprint Report",
    "project": "Project Report",
    "executive": "Executive Summary",
    "productivity": "Productivity Report",
    "deadline_risk": "Deadline Risk Report",
}

REPORT_SECTIONS = [
    "Executive Summary",
    "Project Health",
    "Blocked Tasks",
    "Deadline Risks",
    "Team Productivity",
    "Recommendations",
    "Action Items",
]


def normalize_report_type(report_type: str | None) -> str:
    key = (report_type or "weekly").strip().lower().replace("-", "_")
    if key == "weekly_report":
        key = "weekly"
    if key == "sprint_report":
        key = "sprint"
    if key == "project_report":
        key = "project"
    if key == "executive_summary":
        key = "executive"
    if key == "productivity_report":
        key = "productivity"
    if key == "deadline_risk_report":
        key = "deadline_risk"
    return key if key in REPORT_TYPES else "weekly"


def _date_to_iso(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _task_payload(task: Task):
    return {
        "id": task.id,
        "title": task.title,
        "status": task.status,
        "priority": task.priority,
        "due_date": _date_to_iso(task.due_date),
        "project": task.project.name if task.project else None,
        "assignee": task.assignee.full_name if task.assignee else None,
        "estimate_points": task.estimate_points or 0,
    }


def _project_payload(project: Project):
    tasks = project.tasks or []
    completed = len([task for task in tasks if task.status == "completed"])
    progress = round((completed / len(tasks)) * 100) if tasks else (project.progress or 0)
    blocked = len([task for task in tasks if task.status == "blocked"])
    overdue = len([
        task
        for task in tasks
        if task.due_date and task.due_date < datetime.utcnow() and task.status != "completed"
    ])
    return {
        "id": project.id,
        "name": project.name,
        "status": project.status,
        "priority": project.priority,
        "start_date": _date_to_iso(project.start_date),
        "end_date": _date_to_iso(project.end_date),
        "progress": progress,
        "owner": project.owner.full_name if project.owner else None,
        "task_count": len(tasks),
        "completed_tasks": completed,
        "blocked_tasks": blocked,
        "overdue_tasks": overdue,
    }


def collect_report_context(db: Session, current_user: User | None, role: str | None):
    now = datetime.utcnow()
    since = now - timedelta(days=7)

    projects = (
        db.query(Project)
        .options(
            joinedload(Project.owner),
            joinedload(Project.tasks).joinedload(Task.assignee),
        )
        .order_by(Project.created_at.desc())
        .limit(40)
        .all()
    )
    tasks = (
        db.query(Task)
        .options(joinedload(Task.project), joinedload(Task.assignee))
        .order_by(Task.created_at.desc())
        .limit(120)
        .all()
    )
    activities = (
        db.query(Activity)
        .order_by(Activity.created_at.desc())
        .limit(80)
        .all()
    )
    approvals = (
        db.query(AIRecommendation)
        .order_by(AIRecommendation.created_at.desc())
        .limit(40)
        .all()
    )
    approval_history = (
        db.query(AIApprovalHistory)
        .order_by(AIApprovalHistory.created_at.desc())
        .limit(40)
        .all()
    )
    snapshots = (
        db.query(AnalyticsSnapshot)
        .order_by(AnalyticsSnapshot.created_at.desc())
        .limit(8)
        .all()
    )
    productivity = (
        db.query(ProductivityMetric)
        .order_by(ProductivityMetric.created_at.desc())
        .limit(25)
        .all()
    )
    workload = (
        db.query(WorkloadMetric)
        .order_by(WorkloadMetric.created_at.desc())
        .limit(25)
        .all()
    )
    sprint_metrics = (
        db.query(SprintMetric)
        .order_by(SprintMetric.created_at.desc())
        .limit(25)
        .all()
    )
    sprints = (
        db.query(Sprint)
        .order_by(Sprint.created_at.desc())
        .limit(20)
        .all()
    )

    open_tasks = [task for task in tasks if task.status != "completed"]
    completed_week = [
        task for task in tasks
        if task.status == "completed" and task.created_at and task.created_at >= since
    ]
    blocked_tasks = [task for task in tasks if task.status == "blocked"]
    overdue_tasks = [
        task
        for task in tasks
        if task.due_date and task.due_date < now and task.status != "completed"
    ]
    due_soon = [
        task
        for task in open_tasks
        if task.due_date and now <= task.due_date <= now + timedelta(days=7)
    ]

    context = {
        "generated_at": now.isoformat(),
        "scope": "organization" if role in ["Admin", "Manager"] else "user",
        "requester": current_user.full_name if current_user else None,
        "workspace_counts": {
            "projects": len(projects),
            "tasks": len(tasks),
            "open_tasks": len(open_tasks),
            "completed_tasks_seen": len([task for task in tasks if task.status == "completed"]),
            "completed_this_week_from_loaded_tasks": len(completed_week),
            "blocked_tasks": len(blocked_tasks),
            "overdue_tasks": len(overdue_tasks),
            "due_next_7_days": len(due_soon),
            "approval_recommendations": len(approvals),
            "approval_history_events": len(approval_history),
            "activity_events_loaded": len(activities),
            "analytics_snapshots": len(snapshots),
            "productivity_metrics": len(productivity),
            "workload_metrics": len(workload),
            "sprint_metrics": len(sprint_metrics),
        },
        "projects": [_project_payload(project) for project in projects],
        "blocked_tasks": [_task_payload(task) for task in blocked_tasks[:30]],
        "deadline_risks": [_task_payload(task) for task in (overdue_tasks + due_soon)[:40]],
        "recent_tasks": [_task_payload(task) for task in tasks[:50]],
        "recent_activity": [
            {
                "id": activity.id,
                "action": activity.action or activity.action_type,
                "message": activity.message or activity.description,
                "created_at": _date_to_iso(activity.created_at),
                "project_id": activity.project_id,
                "task_id": activity.task_id,
            }
            for activity in activities
        ],
        "approvals": [
            {
                "id": item.id,
                "title": item.title,
                "status": item.status,
                "severity": item.severity,
                "confidence": item.confidence,
                "created_at": _date_to_iso(item.created_at),
            }
            for item in approvals
        ],
        "analytics": {
            "snapshots": [
                {
                    "health_score": item.health_score,
                    "delivery_confidence": item.delivery_confidence,
                    "productivity_score": item.productivity_score,
                    "created_at": _date_to_iso(item.created_at),
                }
                for item in snapshots
            ],
            "productivity_metrics": [
                {
                    "user_id": item.user_id,
                    "project_id": item.project_id,
                    "score": item.score,
                    "completed_tasks": item.completed_tasks,
                    "overdue_tasks": item.overdue_tasks,
                    "collaboration_events": item.collaboration_events,
                    "period": item.period,
                    "created_at": _date_to_iso(item.created_at),
                }
                for item in productivity
            ],
            "workload_metrics": [
                {
                    "user_id": item.user_id,
                    "utilization": item.utilization,
                    "capacity_points": item.capacity_points,
                    "assigned_points": item.assigned_points,
                    "burnout_risk": item.burnout_risk,
                    "created_at": _date_to_iso(item.created_at),
                }
                for item in workload
            ],
            "sprint_metrics": [
                {
                    "sprint_id": item.sprint_id,
                    "project_id": item.project_id,
                    "velocity": item.velocity,
                    "committed_points": item.committed_points,
                    "completed_points": item.completed_points,
                    "predictability": item.predictability,
                    "blocked_work": item.blocked_work,
                    "created_at": _date_to_iso(item.created_at),
                }
                for item in sprint_metrics
            ],
            "sprints": [
                {
                    "id": sprint.id,
                    "name": sprint.name,
                    "status": sprint.status,
                    "start_date": _date_to_iso(sprint.start_date),
                    "end_date": _date_to_iso(sprint.end_date),
                    "project_id": sprint.project_id,
                }
                for sprint in sprints
            ],
        },
    }
    return context


def context_has_reportable_data(context: dict) -> bool:
    counts = context.get("workspace_counts", {})
    return any(
        counts.get(key, 0) > 0
        for key in ["projects", "tasks", "activity_events_loaded", "analytics_snapshots"]
    )


def insufficient_data_report(report_type: str, context: dict) -> str:
    title = REPORT_TYPES[report_type]
    generated_at = context.get("generated_at", datetime.utcnow().isoformat())
    return "\n\n".join(
        [
            f"# {title}",
            f"Generated: {generated_at}",
            "## Executive Summary\nInsufficient workspace data is available to generate a reliable executive report. No projects, tasks, activity logs, or analytics snapshots were found in the current workspace scope.",
            "## Project Health\nInsufficient data.",
            "## Blocked Tasks\nInsufficient data.",
            "## Deadline Risks\nInsufficient data.",
            "## Team Productivity\nInsufficient data.",
            "## Recommendations\n- Add real projects, tasks, deadlines, assignments, and activity before generating this report.",
            "## Action Items\n- Create or import workspace work items.\n- Re-run the report after operational activity exists.",
        ]
    )


def _build_prompt(report_type: str, context: dict):
    title = REPORT_TYPES[report_type]
    return f"""Generate a professional WorkflowOS {title}.

Use only the structured workspace data below. Do not invent metrics, owners, dates, productivity values, blockers, or risks. If a metric is missing or the data is too thin for a section, explicitly say "Insufficient data" for that section.

Required markdown sections:
{chr(10).join(f"- {section}" for section in REPORT_SECTIONS)}

Style:
- Executive, concise, board-ready.
- Mention concrete counts, dates, project names, and task names only when present in the data.
- Recommendations and action items must follow from the evidence.
- Do not mention that you are an AI model.

Workspace data:
{json.dumps(context, default=str, indent=2)}
"""


def generate_report_markdown(
    db: Session,
    report_type: str,
    current_user: User | None,
    role: str | None,
):
    report_type = normalize_report_type(report_type)
    context = collect_report_context(db, current_user, role)

    if not context_has_reportable_data(context):
        markdown = insufficient_data_report(report_type, context)
    else:
        import anthropic

        client = anthropic.Anthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            base_url=settings.ANTHROPIC_BASE_URL,
        )
        response = client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=2600,
            system=(
                "You are WorkflowOS Executive Reporting. You write reports only "
                "from supplied workspace data and clearly mark insufficient data."
            ),
            messages=[
                {
                    "role": "user",
                    "content": _build_prompt(report_type, context),
                }
            ],
        )
        markdown = response.content[0].text.strip()

    report = AISummary(
        agent_key="executive_reports",
        summary_type=report_type,
        title=REPORT_TYPES[report_type],
        body=markdown,
        payload_json=json.dumps(
            {
                "report_type": report_type,
                "report_label": REPORT_TYPES[report_type],
                "source_counts": context.get("workspace_counts", {}),
                "generated_at": context.get("generated_at"),
            },
            default=str,
        ),
        user_id=current_user.id if current_user else None,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return {
        "id": report.id,
        "type": report_type,
        "title": report.title,
        "markdown": report.body,
        "source_counts": context.get("workspace_counts", {}),
        "generated_at": report.created_at,
    }


def list_report_history(db: Session, current_user: User | None, limit: int = 12):
    query = (
        db.query(AISummary)
        .filter(AISummary.agent_key == "executive_reports")
        .order_by(AISummary.created_at.desc())
        .limit(limit)
    )
    reports = query.all()
    return [
        {
            "id": report.id,
            "type": report.summary_type,
            "title": report.title,
            "markdown": report.body,
            "created_at": report.created_at,
            "source_counts": json.loads(report.payload_json or "{}").get("source_counts", {}),
        }
        for report in reports
    ]


def get_report(db: Session, report_id: int):
    return (
        db.query(AISummary)
        .filter(
            AISummary.id == report_id,
            AISummary.agent_key == "executive_reports",
        )
        .first()
    )


def markdown_filename(report_type: str):
    return f"workflowos_{normalize_report_type(report_type)}_report.md"


def pdf_filename(report_type: str):
    return f"workflowos_{normalize_report_type(report_type)}_report.pdf"


def _escape_pdf_text(value):
    return (
        str(value or "")
        .replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
        .replace("\r", " ")
        .replace("\n", " ")
    )


def _build_pdf(markdown: str, title: str):
    lines = []
    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        if not line:
            lines.append("")
            continue
        if line.startswith("#"):
            lines.append(line.replace("#", "").strip())
        else:
            lines.extend(wrap(line, width=92) or [""])

    pages = []
    page_lines = []
    for line in lines:
        page_lines.append(line)
        if len(page_lines) >= 48:
            pages.append(page_lines)
            page_lines = []
    if page_lines:
        pages.append(page_lines)
    pages = pages or [[title, "No report content available."]]

    objects = []

    def add_object(data: bytes):
        objects.append(data)
        return len(objects)

    catalog_id = add_object(b"")
    pages_id = add_object(b"")
    font_id = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    bold_id = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    page_ids = []

    for index, page in enumerate(pages):
        commands = [
            "BT /F2 16 Tf 42 752 Td (WorkflowOS Executive Report) Tj ET",
            "0.88 0.90 0.94 RG 1 w 42 736 m 570 736 l S",
        ]
        y = 712
        for line in page:
            size = 12 if line in REPORT_SECTIONS or line == title else 9
            font = "F2" if size == 12 else "F1"
            commands.append(f"BT /{font} {size} Tf 42 {y} Td ({_escape_pdf_text(line)}) Tj ET")
            y -= 14 if size == 9 else 18
        commands.append(f"BT /F1 8 Tf 42 36 Td (Page {index + 1}) Tj ET")
        stream = "\n".join(commands).encode("latin-1", errors="replace")
        content_id = add_object(
            b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream"
        )
        page_id = add_object(
            (
                f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] "
                f"/Resources << /Font << /F1 {font_id} 0 R /F2 {bold_id} 0 R >> >> "
                f"/Contents {content_id} 0 R >>"
            ).encode("ascii")
        )
        page_ids.append(page_id)

    objects[catalog_id - 1] = f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("ascii")
    objects[pages_id - 1] = (
        f"<< /Type /Pages /Kids [{' '.join(f'{page_id} 0 R' for page_id in page_ids)}] /Count {len(page_ids)} >>"
    ).encode("ascii")

    buffer = BytesIO()
    buffer.write(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(buffer.tell())
        buffer.write(f"{index} 0 obj\n".encode("ascii"))
        buffer.write(obj)
        buffer.write(b"\nendobj\n")
    xref_offset = buffer.tell()
    buffer.write(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    buffer.write(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        buffer.write(f"{offset:010d} 00000 n \n".encode("ascii"))
    buffer.write(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF"
        ).encode("ascii")
    )
    buffer.seek(0)
    return buffer


def report_pdf_buffer(markdown: str, title: str):
    return _build_pdf(markdown, title)
