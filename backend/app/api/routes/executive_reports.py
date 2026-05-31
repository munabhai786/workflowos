from urllib.parse import quote

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_optional_current_user
from app.models.user import User
from app.services.executive_report_service import (
    REPORT_TYPES,
    generate_report_markdown,
    get_report,
    list_report_history,
    markdown_filename,
    pdf_filename,
    report_pdf_buffer,
)


router = APIRouter()


class ReportGenerateRequest(BaseModel):
    report_type: str = "weekly"


def require_report_access(role: str | None, current_user: User | None):
    if role in ["Admin", "Manager"]:
        return
    if current_user:
        return
    raise HTTPException(status_code=403, detail="Permission denied")


@router.get("/types")
def get_report_types(
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    require_report_access(role, current_user)
    return [
        {
            "value": key,
            "label": label,
        }
        for key, label in REPORT_TYPES.items()
    ]


@router.get("/history")
def get_history(
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    require_report_access(role, current_user)
    return list_report_history(db, current_user)


@router.post("/generate")
def generate_report(
    payload: ReportGenerateRequest,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    require_report_access(role, current_user)
    return generate_report_markdown(
        db=db,
        report_type=payload.report_type,
        current_user=current_user,
        role=role,
    )


@router.get("/{report_id}/markdown")
def download_markdown(
    report_id: int,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    require_report_access(role, current_user)
    report = get_report(db, report_id)

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    filename = markdown_filename(report.summary_type)
    encoded_filename = quote(filename)

    return Response(
        content=report.body,
        media_type="text/markdown",
        headers={
            "Content-Disposition": f"attachment; filename={filename}; filename*=UTF-8''{encoded_filename}",
            "Cache-Control": "no-store",
        },
    )


@router.get("/{report_id}/pdf")
def download_pdf(
    report_id: int,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    require_report_access(role, current_user)
    report = get_report(db, report_id)

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    filename = pdf_filename(report.summary_type)
    encoded_filename = quote(filename)

    return StreamingResponse(
        report_pdf_buffer(report.body, report.title),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}; filename*=UTF-8''{encoded_filename}",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
