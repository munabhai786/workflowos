import json
from urllib.parse import quote

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.analytics.analytics_engine import build_enterprise_analytics
from app.analytics.reporting_engine import generate_executive_pdf_report, report_filename
from app.core.database import get_db
from app.core.deps import get_optional_current_user
from app.models.analytics import AnalyticsSnapshot
from app.models.user import User
from app.services.realtime_service import schedule_global_event


router = APIRouter()


def require_analytics_access(role: str | None, current_user: User | None):
    if role in ["Admin", "Manager"]:
        return
    if current_user:
        return
    raise HTTPException(status_code=403, detail="Permission denied")


@router.get("/")
def get_team_analytics(
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    require_analytics_access(role, current_user)
    return build_enterprise_analytics(db, current_user=current_user, role=role)


@router.get("/executive")
def get_executive_analytics(
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    if role not in ["Admin", "Manager"]:
        raise HTTPException(status_code=403, detail="Permission denied")
    analytics = build_enterprise_analytics(db, current_user=current_user, role=role)
    return {
        "kpis": analytics["kpis"],
        "executive": analytics["executive"],
        "forecasts": analytics["forecasts"],
        "reports": analytics["reports"],
    }


@router.get("/reports")
def get_analytics_reports(
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    require_analytics_access(role, current_user)
    analytics = build_enterprise_analytics(db, current_user=current_user, role=role)
    return analytics["reports"]


@router.get("/reports/pdf")
def download_analytics_pdf_report(
    report_type: str = "executive",
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    require_analytics_access(role, current_user)
    analytics = build_enterprise_analytics(db, current_user=current_user, role=role)
    pdf_buffer = generate_executive_pdf_report(analytics)
    filename = report_filename(report_type)
    encoded_filename = quote(filename)

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}; filename*=UTF-8''{encoded_filename}",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


def persist_analytics_snapshot(db: Session):
    analytics = build_enterprise_analytics(db, current_user=None, role="Admin")
    snapshot = AnalyticsSnapshot(
        scope="organization",
        health_score=analytics["kpis"]["organization_health"],
        delivery_confidence=analytics["kpis"]["delivery_confidence"],
        productivity_score=analytics["kpis"]["productivity"],
        metrics_json=json.dumps(analytics["kpis"], default=str),
        summary_json=json.dumps(analytics["executive"], default=str),
    )
    db.add(snapshot)
    db.commit()
    schedule_global_event(
        "analytics.updated",
        {
            "snapshot_id": snapshot.id,
            "organization_health": snapshot.health_score,
            "delivery_confidence": snapshot.delivery_confidence,
        },
    )
    return snapshot
