from __future__ import annotations

import math
from io import BytesIO
from datetime import datetime
from textwrap import wrap


def build_reports(payload: dict):
    kpis = payload["kpis"]
    executive = payload["executive"]
    return {
        "generated_at": datetime.utcnow(),
        "formats_ready": ["json", "csv-ready", "pdf-ready"],
        "executive_summary": executive["summary"],
        "sections": [
            {
                "title": "Operational Health",
                "metrics": {
                    "organization_health": kpis["organization_health"],
                    "delivery_confidence": kpis["delivery_confidence"],
                    "productivity": kpis["productivity"],
                },
            },
            {
                "title": "Sprint Performance",
                "metrics": payload["sprint"]["summary"],
            },
            {
                "title": "Automation Effectiveness",
                "metrics": payload["automation"]["summary"],
            },
            {
                "title": "Workload Intelligence",
                "metrics": {
                    "overloaded_users": len([user for user in payload["workload"]["users"] if user["overloaded"]]),
                    "capacity_risks": len(payload["workload"]["risks"]),
                },
            },
        ],
    }


def _escape_pdf_text(value):
    text = str(value if value is not None else "")
    return (
        text.replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
        .replace("\r", " ")
        .replace("\n", " ")
    )


def _pdf_color(hex_color):
    hex_color = hex_color.lstrip("#")
    r = int(hex_color[0:2], 16) / 255
    g = int(hex_color[2:4], 16) / 255
    b = int(hex_color[4:6], 16) / 255
    return f"{r:.3f} {g:.3f} {b:.3f}"


class _PdfPage:
    width = 612
    height = 792

    def __init__(self):
        self.commands = []

    def text(self, x, y, value, size=10, color="#0f172a", font="F1"):
        self.commands.append(
            f"BT /{font} {size} Tf {_pdf_color(color)} rg {x:.2f} {y:.2f} Td ({_escape_pdf_text(value)}) Tj ET"
        )

    def line(self, x1, y1, x2, y2, color="#e2e8f0", width=1):
        self.commands.append(
            f"q {_pdf_color(color)} RG {width:.2f} w {x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S Q"
        )

    def rect(self, x, y, width, height, fill="#f8fafc", stroke=None):
        if stroke:
            self.commands.append(
                f"q {_pdf_color(fill)} rg {_pdf_color(stroke)} RG {x:.2f} {y:.2f} {width:.2f} {height:.2f} re B Q"
            )
        else:
            self.commands.append(
                f"q {_pdf_color(fill)} rg {x:.2f} {y:.2f} {width:.2f} {height:.2f} re f Q"
            )

    def stream(self):
        return "\n".join(self.commands).encode("latin-1", errors="replace")


def _add_wrapped_text(page, x, y, text, width=86, size=9, line_height=13, color="#334155"):
    lines = []
    for paragraph in str(text or "").split("\n"):
        lines.extend(wrap(paragraph, width=width) or [""])
    for line in lines:
        page.text(x, y, line, size=size, color=color)
        y -= line_height
    return y


def _metric_card(page, x, y, label, value, color="#0f172a"):
    page.rect(x, y - 58, 124, 58, fill="#ffffff", stroke="#e2e8f0")
    page.text(x + 12, y - 20, label.upper(), size=7, color="#64748b")
    page.text(x + 12, y - 45, value, size=20, color=color)


def _bar_chart(page, x, y, title, rows, label_key, value_key, color="#2563eb", width=236):
    page.text(x, y, title, size=12, color="#0f172a")
    y -= 18
    max_value = max([float(row.get(value_key) or 0) for row in rows] or [1])
    max_value = max(max_value, 1)
    for row in rows[:8]:
        label = str(row.get(label_key) or "Unassigned")[:24]
        value = float(row.get(value_key) or 0)
        bar_width = (value / max_value) * width
        page.text(x, y, label, size=8, color="#475569")
        page.rect(x + 110, y - 2, width, 8, fill="#e2e8f0")
        page.rect(x + 110, y - 2, bar_width, 8, fill=color)
        page.text(x + 118 + width, y, str(round(value)), size=8, color="#475569")
        y -= 17
    return y


def _donut_legend(page, x, y, title, rows):
    colors = ["#64748b", "#2563eb", "#7c3aed", "#ef4444", "#10b981", "#f59e0b"]
    page.text(x, y, title, size=12, color="#0f172a")
    y -= 20
    for index, row in enumerate(rows[:6]):
        page.rect(x, y - 2, 9, 9, fill=colors[index % len(colors)])
        page.text(x + 15, y, f"{row.get('status')}: {row.get('count')}", size=9, color="#334155")
        y -= 16
    return y


def _build_manual_pdf(pages):
    objects = []

    def add_object(data):
        objects.append(data)
        return len(objects)

    catalog_id = add_object(b"<< /Type /Catalog /Pages 2 0 R >>")
    pages_id = add_object(b"")
    font_regular_id = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    font_bold_id = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")

    page_ids = []
    for page in pages:
        stream = page.stream()
        content_id = add_object(
            b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream"
        )
        page_id = add_object(
            (
                f"<< /Type /Page /Parent {pages_id} 0 R "
                f"/MediaBox [0 0 {page.width} {page.height}] "
                f"/Resources << /Font << /F1 {font_regular_id} 0 R /F2 {font_bold_id} 0 R >> >> "
                f"/Contents {content_id} 0 R >>"
            ).encode("ascii")
        )
        page_ids.append(page_id)

    objects[pages_id - 1] = (
        f"<< /Type /Pages /Kids [{' '.join(f'{page_id} 0 R' for page_id in page_ids)}] /Count {len(page_ids)} >>"
    ).encode("ascii")
    objects[catalog_id - 1] = f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("ascii")

    buffer = BytesIO()
    buffer.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
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


def _generate_manual_executive_pdf(analytics: dict):
    generated_at = analytics.get("generated_at") or datetime.utcnow()
    if isinstance(generated_at, str):
        generated_at_label = generated_at
    else:
        generated_at_label = generated_at.strftime("%b %d, %Y %H:%M UTC")

    kpis = analytics.get("kpis", {})
    executive = analytics.get("executive", {})
    productivity = analytics.get("members", [])
    workload = analytics.get("workload", {}).get("users", [])
    sprint_summary = analytics.get("sprint", {}).get("summary", {})
    sprint_rows = analytics.get("sprint", {}).get("sprints", [])
    forecasts = analytics.get("forecasts", {}).get("projects", [])
    automation = analytics.get("automation", {}).get("summary", {})

    pages = []

    page = _PdfPage()
    page.rect(0, 720, 612, 72, fill="#0f172a")
    page.text(42, 758, "WorkflowOS", size=18, color="#ffffff", font="F2")
    page.text(42, 737, "Enterprise Executive Analytics Report", size=11, color="#cbd5e1")
    page.text(400, 758, generated_at_label, size=8, color="#cbd5e1")
    page.text(42, 690, "Executive Summary", size=18, color="#0f172a", font="F2")
    y = _add_wrapped_text(page, 42, 664, executive.get("summary", ""), width=92, size=10, line_height=15)

    _metric_card(page, 42, y - 18, "Health", f"{kpis.get('organization_health', 0)}%", "#0f172a")
    _metric_card(page, 178, y - 18, "Delivery", f"{kpis.get('delivery_confidence', 0)}%", "#2563eb")
    _metric_card(page, 314, y - 18, "Productivity", f"{kpis.get('productivity', 0)}%", "#10b981")
    _metric_card(page, 450, y - 18, "Automation", f"{kpis.get('automation_successful_executions', 0)}", "#7c3aed")

    page.text(42, y - 110, "AI Insights", size=14, color="#0f172a", font="F2")
    insight_y = y - 135
    for insight in (executive.get("insights") or [])[:5]:
        page.rect(42, insight_y - 44, 528, 46, fill="#f8fafc", stroke="#e2e8f0")
        page.text(54, insight_y - 14, insight.get("title", "Insight"), size=10, color="#0f172a", font="F2")
        _add_wrapped_text(page, 54, insight_y - 29, insight.get("message", ""), width=86, size=8, line_height=10, color="#475569")
        insight_y -= 54
    pages.append(page)

    page = _PdfPage()
    page.text(42, 748, "Productivity & Workload Intelligence", size=18, color="#0f172a", font="F2")
    _bar_chart(page, 42, 710, "Top Productivity Scores", productivity, "user", "productivity", "#10b981", width=250)
    _bar_chart(page, 42, 520, "Burnout Risk", [
        {"user": row.get("user", {}).get("full_name", "Unassigned") if row.get("user") else "Unassigned", "burnout_risk": row.get("burnout_risk", 0)}
        for row in workload
    ], "user", "burnout_risk", "#ef4444", width=250)
    _donut_legend(page, 370, 710, "Task Distribution", analytics.get("task_distribution", []))
    page.text(370, 575, "Workload Summary", size=12, color="#0f172a", font="F2")
    page.text(370, 550, f"Overloaded users: {len([row for row in workload if row.get('overloaded')])}", size=10, color="#334155")
    page.text(370, 530, f"Total tasks: {kpis.get('total_tasks', 0)}", size=10, color="#334155")
    page.text(370, 510, f"Overdue tasks: {kpis.get('overdue_tasks', 0)}", size=10, color="#334155")
    pages.append(page)

    page = _PdfPage()
    page.text(42, 748, "Sprint, Forecasting & Automation", size=18, color="#0f172a", font="F2")
    page.text(42, 714, "Sprint Analytics", size=13, color="#0f172a", font="F2")
    sprint_metrics = [
        ("Average velocity", sprint_summary.get("average_velocity", 0)),
        ("Predictability", f"{sprint_summary.get('predictability', 0)}%"),
        ("Consistency", f"{sprint_summary.get('consistency', 0)}%"),
        ("Carry-over work", sprint_summary.get("carry_over_work", 0)),
    ]
    y = 690
    for label, value in sprint_metrics:
        page.text(54, y, label, size=9, color="#64748b")
        page.text(230, y, value, size=10, color="#0f172a", font="F2")
        y -= 20
    _bar_chart(page, 42, 580, "Sprint Completion", sprint_rows, "name", "completion_rate", "#2563eb", width=250)

    page.text(370, 714, "Forecasting", size=13, color="#0f172a", font="F2")
    forecast_y = 690
    for forecast in forecasts[:6]:
        project = forecast.get("project") or {}
        page.text(370, forecast_y, project.get("name", "Project"), size=9, color="#334155")
        page.text(500, forecast_y, f"{forecast.get('delivery_confidence', 0)}%", size=9, color="#0f172a", font="F2")
        forecast_y -= 18

    page.text(370, 540, "Automation Effectiveness", size=13, color="#0f172a", font="F2")
    page.text(370, 516, f"Rules: {automation.get('rules', 0)}", size=9, color="#334155")
    page.text(370, 498, f"Executions: {automation.get('executions', 0)}", size=9, color="#334155")
    page.text(370, 480, f"Success rate: {automation.get('success_rate', 0)}%", size=9, color="#334155")
    page.text(370, 462, f"Successful executions: {automation.get('successes', 0)}", size=9, color="#334155")
    pages.append(page)

    page = _PdfPage()
    page.text(42, 748, "Operational Recommendations", size=18, color="#0f172a", font="F2")
    y = 710
    for index, recommendation in enumerate(executive.get("recommendations") or [], start=1):
        page.rect(42, y - 46, 528, 48, fill="#f8fafc", stroke="#e2e8f0")
        _add_wrapped_text(page, 58, y - 16, f"{index}. {recommendation}", width=88, size=10, line_height=13)
        y -= 58
    page.line(42, 104, 570, 104)
    page.text(42, 82, "Prepared by WorkflowOS Analytics Intelligence", size=9, color="#64748b")
    page.text(42, 66, "Confidential executive report. Generated from live operational workspace data.", size=8, color="#94a3b8")
    pages.append(page)

    return _build_manual_pdf(pages)


def generate_executive_pdf_report(analytics: dict):
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import inch
        from reportlab.platypus import (
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
    except Exception:
        return _generate_manual_executive_pdf(analytics)

    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.55 * inch,
        leftMargin=0.55 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.55 * inch,
        title="WorkflowOS Executive Analytics Report",
        author="WorkflowOS",
    )
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="ExecutiveTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=26,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=8,
    ))
    styles.add(ParagraphStyle(
        name="SectionTitle",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=14,
        spaceAfter=8,
    ))
    styles.add(ParagraphStyle(
        name="BodySmall",
        parent=styles["BodyText"],
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#334155"),
    ))

    kpis = analytics.get("kpis", {})
    executive = analytics.get("executive", {})
    sprint_summary = analytics.get("sprint", {}).get("summary", {})
    automation = analytics.get("automation", {}).get("summary", {})
    workload_users = analytics.get("workload", {}).get("users", [])
    forecasts = analytics.get("forecasts", {}).get("projects", [])
    members = analytics.get("members", [])

    generated_at = analytics.get("generated_at")
    if isinstance(generated_at, datetime):
        generated_at = generated_at.strftime("%b %d, %Y %H:%M UTC")
    generated_at = generated_at or datetime.utcnow().strftime("%b %d, %Y %H:%M UTC")

    story = [
        Paragraph("WorkflowOS Executive Analytics Report", styles["ExecutiveTitle"]),
        Paragraph(f"Generated {generated_at}", styles["BodySmall"]),
        Spacer(1, 12),
        Paragraph("Executive Summary", styles["SectionTitle"]),
        Paragraph(executive.get("summary", "No executive summary available."), styles["BodySmall"]),
        Spacer(1, 12),
    ]

    kpi_rows = [
        ["Organization Health", "Delivery Confidence", "Productivity", "Automation Successes"],
        [
            f"{kpis.get('organization_health', 0)}%",
            f"{kpis.get('delivery_confidence', 0)}%",
            f"{kpis.get('productivity', 0)}%",
            f"{kpis.get('automation_successful_executions', 0)}",
        ],
    ]
    table = Table(kpi_rows, colWidths=[1.8 * inch, 1.8 * inch, 1.8 * inch, 1.8 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("TEXTCOLOR", (0, 1), (-1, 1), colors.HexColor("#0f172a")),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("FONTSIZE", (0, 1), (-1, 1), 18),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e2e8f0")),
        ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#f8fafc")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.extend([table, Spacer(1, 14)])

    story.append(Paragraph("AI Insights", styles["SectionTitle"]))
    insight_rows = [["Severity", "Insight", "Message"]]
    for insight in (executive.get("insights") or [])[:6]:
        insight_rows.append([
            insight.get("severity", "low"),
            Paragraph(insight.get("title", "Insight"), styles["BodySmall"]),
            Paragraph(insight.get("message", ""), styles["BodySmall"]),
        ])
    insight_table = Table(insight_rows, colWidths=[0.85 * inch, 1.65 * inch, 4.6 * inch])
    insight_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
    ]))
    story.extend([insight_table, Spacer(1, 12)])

    story.append(Paragraph("Productivity Scorecards", styles["SectionTitle"]))
    member_rows = [["Member", "Assigned", "Completed", "Overdue", "Productivity", "Burnout"]]
    for member in members[:10]:
        member_rows.append([
            member.get("user", "User"),
            member.get("assigned_tasks", 0),
            member.get("completed_tasks", 0),
            member.get("overdue_tasks", 0),
            f"{member.get('productivity', 0)}%",
            f"{member.get('burnout_risk', 0)}%",
        ])
    member_table = Table(member_rows, colWidths=[1.75 * inch, 0.85 * inch, 0.9 * inch, 0.8 * inch, 1.0 * inch, 0.85 * inch])
    member_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#e2e8f0")),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.extend([member_table, Spacer(1, 12)])

    story.append(Paragraph("Sprint, Workload & Forecasting", styles["SectionTitle"]))
    operations_rows = [
        ["Average Sprint Velocity", sprint_summary.get("average_velocity", 0)],
        ["Sprint Predictability", f"{sprint_summary.get('predictability', 0)}%"],
        ["Sprint Carry-over Work", sprint_summary.get("carry_over_work", 0)],
        ["Overloaded Users", len([user for user in workload_users if user.get("overloaded")])],
        ["Automation Success Rate", f"{automation.get('success_rate', 0)}%"],
        ["Automation Executions", automation.get("executions", 0)],
    ]
    operations_table = Table(operations_rows, colWidths=[2.8 * inch, 1.4 * inch])
    operations_table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#e2e8f0")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f8fafc")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
    ]))
    story.extend([operations_table, Spacer(1, 12)])

    story.append(Paragraph("Delivery Forecasts", styles["SectionTitle"]))
    forecast_rows = [["Project", "Delivery Confidence", "Delay Risk", "Staffing Pressure"]]
    for forecast in forecasts[:8]:
        project = forecast.get("project") or {}
        forecast_rows.append([
            project.get("name", "Project"),
            f"{forecast.get('delivery_confidence', 0)}%",
            f"{forecast.get('delay_risk', 0)}%",
            f"{forecast.get('staffing_pressure', 0)}%",
        ])
    forecast_table = Table(forecast_rows, colWidths=[2.6 * inch, 1.45 * inch, 1.1 * inch, 1.35 * inch])
    forecast_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#e2e8f0")),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
    ]))
    story.extend([forecast_table, Spacer(1, 12)])

    story.append(Paragraph("Operational Recommendations", styles["SectionTitle"]))
    for recommendation in executive.get("recommendations") or []:
        story.append(Paragraph(f"- {recommendation}", styles["BodySmall"]))

    document.build(story)
    buffer.seek(0)
    return buffer

def report_filename(report_type: str = "executive"):
    names = {
        "executive": "executive_report.pdf",
        "sprint": "sprint_analytics.pdf",
        "productivity": "productivity_report.pdf",
    }
    return names.get(report_type, "executive_report.pdf")
