import asyncio
import logging

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.core.config import settings
from app.core.errors import (
    AppError,
    USER_SAFE_ERRORS,
    app_error_response,
    error_payload,
    http_exception_response,
    request_id_middleware,
)

from app.core.database import (
    engine,
    Base,
)

from app.api.routes.users import (
    router as users_router
)

from app.models.user import User

from app.models.project import Project

from app.models.task import Task
from app.models.activity import Activity
from app.models.attachment import Attachment
from app.models.milestone import Milestone
from app.models.sprint import Sprint, SprintTask
from app.models.automation import AutomationRule, AutomationExecution, WorkflowTrigger
from app.models.analytics import (
    AnalyticsSnapshot,
    ProductivityMetric,
    SprintMetric,
    WorkloadMetric,
    ForecastingResult,
    AIAnalyticsSummary,
)
from app.models.ai_agent import (
    AIConversation,
    AIDocument,
    AIDocumentChunk,
    AIAgentMemory,
    AIRecommendation,
    AIMessage,
    AIRetrievalLog,
    AIExecutionLog,
    AIApprovalHistory,
    AIContextSnapshot,
    AIDecisionHistory,
    AISummary,
    AIOperationalObservation,
)
from app.models.integration import (
    APIToken,
    ExternalEvent,
    Integration,
    IntegrationSetting,
    OAuthAccount,
    OAuthState,
    OrchestrationEvent,
    SyncHistory,
    WebhookEndpoint,
    WebhookLog,
)
from app.models.task_comment import TaskComment

from app.api.routes.admin import router as admin_router

from app.api.routes.invitations import router as invitation_router

from app.api.routes import auth

from app.api.routes.projects import (
    router as projects_router
)

from app.api.routes.tasks import (
    router as tasks_router
)

from app.api.routes.ai import (
    router as ai_router
)

from app.api.routes.notifications import (
    router as notifications_router
)
from app.api.routes.automations import router as automations_router

from app.api.routes.activity import (
    router as activity_router
)
from app.api.routes.attachments import router as attachments_router
from app.api.routes.comments import router as comments_router
from app.api.routes.planning import router as planning_router
from app.api.routes.realtime import router as realtime_router
from app.api.routes.team_analytics import router as team_analytics_router
from app.api.routes.integrations import router as integrations_router

from app.services.analytics_service import dashboard_analytics
from app.services.ai_intelligence_service import run_deadline_monitoring
from app.services.automation_service import run_scheduled_automations, seed_workflow_triggers
from app.services.smart_notification_service import run_smart_notification_scan
from app.agents.agent_manager import agent_manager
from app.api.routes.team_analytics import persist_analytics_snapshot
from app.core.database import SessionLocal
from app.core.deps import get_optional_current_user
from app.services.openai_rag_service import openai_rag_service
from app.api.routes.ai_copilot import router as ai_copilot_router
from app.api.routes.analytics import router as analytics_router
from app.api.routes.executive_reports import router as executive_reports_router
from app.api.routes.demo import router as demo_router



logger = logging.getLogger(__name__)


# =========================
# CREATE DATABASE TABLES
# =========================

Base.metadata.create_all(bind=engine)


def upgrade_project_table():
    inspector = inspect(engine)

    if not inspector.has_table("projects"):
        return

    existing_columns = {
        column["name"]
        for column in inspector.get_columns("projects")
    }

    columns_to_add = {
        "status": "VARCHAR DEFAULT 'active'",
        "start_date": "DATE",
        "end_date": "DATE",
        "progress": "INTEGER DEFAULT 0",
        "owner_id": "INTEGER",
        "created_at": "DATETIME",
        "email_sent": "BOOLEAN DEFAULT 0",
        "last_alert_at": "DATETIME",
        "alert_level": "VARCHAR DEFAULT 'none'",
    }

    with engine.begin() as connection:
        for column_name, column_type in columns_to_add.items():
            if column_name not in existing_columns:
                connection.execute(
                    text(
                        f"ALTER TABLE projects ADD COLUMN {column_name} {column_type}"
                    )
                )

        connection.execute(
            text(
                """
                UPDATE projects
                SET created_at = CURRENT_TIMESTAMP
                WHERE created_at IS NULL
                """
            )
        )


upgrade_project_table()


def upgrade_notification_table():
    inspector = inspect(engine)

    if not inspector.has_table("notifications"):
        return

    existing_columns = {
        column["name"]
        for column in inspector.get_columns("notifications")
    }

    columns_to_add = {
        "is_read": "BOOLEAN DEFAULT 0",
        "user_id": "INTEGER",
        "created_at": "DATETIME",
        "severity": "VARCHAR DEFAULT 'low'",
        "priority": "VARCHAR DEFAULT 'normal'",
        "entity_type": "VARCHAR",
        "entity_id": "INTEGER",
        "metadata_json": "TEXT",
    }

    with engine.begin() as connection:
        for column_name, column_type in columns_to_add.items():
            if column_name not in existing_columns:
                connection.execute(
                    text(
                        f"ALTER TABLE notifications ADD COLUMN {column_name} {column_type}"
                    )
                )

        connection.execute(
            text(
                """
                UPDATE notifications
                SET created_at = CURRENT_TIMESTAMP
                WHERE created_at IS NULL
                """
            )
        )


upgrade_notification_table()


def upgrade_user_table():
    inspector = inspect(engine)

    if not inspector.has_table("users"):
        return

    existing_columns = {
        column["name"]
        for column in inspector.get_columns("users")
    }

    columns_to_add = {
        "is_verified": "BOOLEAN DEFAULT 0",
        "otp_code": "VARCHAR",
        "otp_expires_at": "DATETIME",
        "otp_attempts": "INTEGER DEFAULT 0",
        "otp_last_sent_at": "DATETIME",
        "pending_invitation_token": "VARCHAR",
        "two_factor_enabled": "BOOLEAN DEFAULT 0",
        "two_factor_method": "VARCHAR",
        "google_auth_secret": "VARCHAR",
    }

    with engine.begin() as connection:
        for column_name, column_type in columns_to_add.items():
            if column_name not in existing_columns:
                connection.execute(
                    text(
                        f"ALTER TABLE users ADD COLUMN {column_name} {column_type}"
                    )
                )

        connection.execute(
            text(
                """
                UPDATE users
                SET is_verified = 1
                WHERE is_verified IS NULL
                """
            )
        )


upgrade_user_table()


def add_missing_columns(table_name: str, columns_to_add: dict[str, str]):
    inspector = inspect(engine)

    if not inspector.has_table(table_name):
        return

    existing_columns = {
        column["name"]
        for column in inspector.get_columns(table_name)
    }

    with engine.begin() as connection:
        for column_name, column_type in columns_to_add.items():
            if column_name not in existing_columns:
                connection.execute(
                    text(
                        f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"
                    )
                )


def upgrade_activity_table():
    inspector = inspect(engine)

    if not inspector.has_table("activities"):
        return

    existing_columns = {
        column["name"]
        for column in inspector.get_columns("activities")
    }

    add_missing_columns(
        "activities",
        {
            "action": "VARCHAR",
            "description": "VARCHAR",
            "entity_type": "VARCHAR",
            "entity_id": "INTEGER",
        },
    )

    with engine.begin() as connection:
        if "action_type" in existing_columns:
            connection.execute(
                text(
                    """
                    UPDATE activities
                    SET action = action_type
                    WHERE action IS NULL
                    """
                )
            )
        if "message" in existing_columns:
            connection.execute(
                text(
                    """
                    UPDATE activities
                    SET description = message
                    WHERE description IS NULL
                    """
                )
            )
        connection.execute(
            text(
                """
                UPDATE activities
                SET entity_type = CASE
                    WHEN task_id IS NOT NULL THEN 'task'
                    WHEN project_id IS NOT NULL THEN 'project'
                    ELSE 'system'
                END
                WHERE entity_type IS NULL
                """
            )
        )
        connection.execute(
            text(
                """
                UPDATE activities
                SET entity_id = COALESCE(task_id, project_id)
                WHERE entity_id IS NULL
                """
            )
        )


def upgrade_task_table():
    add_missing_columns(
        "tasks",
        {
            "position": "INTEGER DEFAULT 0",
            "labels": "TEXT",
            "scheduled_start": "DATETIME",
            "scheduled_end": "DATETIME",
            "estimate_points": "INTEGER DEFAULT 1",
        },
    )

    with engine.begin() as connection:
        connection.execute(
            text(
                """
                UPDATE tasks
                SET scheduled_end = due_date
                WHERE scheduled_end IS NULL
                  AND due_date IS NOT NULL
                """
            )
        )
        connection.execute(
            text(
                """
                UPDATE tasks
                SET estimate_points = 1
                WHERE estimate_points IS NULL
                """
            )
        )


upgrade_activity_table()
upgrade_task_table()


add_missing_columns(
    "project_members",
    {
        "role": "VARCHAR DEFAULT 'Viewer'",
    },
)


def upgrade_attachment_table():
    inspector = inspect(engine)

    if not inspector.has_table("attachments"):
        return

    existing_columns = {
        column["name"]
        for column in inspector.get_columns("attachments")
    }

    columns_to_add = {
        "mime_type": "VARCHAR",
        "file_size": "INTEGER",
        "uploader_id": "INTEGER",
        "uploaded_at": "DATETIME",
        "metadata_json": "TEXT",
        "extracted_text": "TEXT",
        "preview_available": "INTEGER DEFAULT 0",
    }

    with engine.begin() as connection:
        for column_name, column_type in columns_to_add.items():
            if column_name not in existing_columns:
                connection.execute(
                    text(
                        f"ALTER TABLE attachments ADD COLUMN {column_name} {column_type}"
                    )
                )

        if "content_type" in existing_columns:
            connection.execute(
                text(
                    """
                    UPDATE attachments
                    SET mime_type = content_type
                    WHERE mime_type IS NULL
                       OR mime_type = ''
                    """
                )
            )

        if "size" in existing_columns:
            connection.execute(
                text(
                    """
                    UPDATE attachments
                    SET file_size = size
                    WHERE file_size IS NULL
                    """
                )
            )

        if "uploaded_by" in existing_columns:
            connection.execute(
                text(
                    """
                    UPDATE attachments
                    SET uploader_id = uploaded_by
                    WHERE uploader_id IS NULL
                    """
                )
            )

        if "created_at" in existing_columns:
            connection.execute(
                text(
                    """
                    UPDATE attachments
                    SET uploaded_at = created_at
                    WHERE uploaded_at IS NULL
                    """
                )
            )

        connection.execute(
            text(
                """
                UPDATE attachments
                SET mime_type = ''
                WHERE mime_type IS NULL
                """
            )
        )
        connection.execute(
            text(
                """
                UPDATE attachments
                SET file_size = 0
                WHERE file_size IS NULL
                """
            )
        )
        connection.execute(
            text(
                """
                UPDATE attachments
                SET uploaded_at = CURRENT_TIMESTAMP
                WHERE uploaded_at IS NULL
                """
            )
        )
        connection.execute(
            text(
                """
                UPDATE attachments
                SET preview_available = 0
                WHERE preview_available IS NULL
                """
            )
        )


upgrade_attachment_table()


def upgrade_ai_agent_tables():
    table_columns = {
        "ai_agent_memory": {
            "scope": "VARCHAR DEFAULT 'organization'",
            "agent_key": "VARCHAR",
            "memory_type": "VARCHAR",
            "project_id": "INTEGER",
            "user_id": "INTEGER",
            "entity_type": "VARCHAR",
            "entity_id": "INTEGER",
            "summary": "TEXT",
            "data_json": "TEXT",
            "confidence": "FLOAT DEFAULT 0",
            "created_at": "DATETIME",
            "updated_at": "DATETIME",
        },
        "ai_recommendations": {
            "agent_key": "VARCHAR",
            "category": "VARCHAR",
            "title": "VARCHAR",
            "message": "TEXT",
            "reasoning": "TEXT",
            "recommendation_type": "VARCHAR DEFAULT 'insight'",
            "action_type": "VARCHAR",
            "action_payload_json": "TEXT",
            "severity": "VARCHAR DEFAULT 'medium'",
            "confidence": "FLOAT DEFAULT 0",
            "status": "VARCHAR DEFAULT 'open'",
            "approval_required": "INTEGER DEFAULT 1",
            "project_id": "INTEGER",
            "task_id": "INTEGER",
            "user_id": "INTEGER",
            "created_by": "INTEGER",
            "created_at": "DATETIME",
            "updated_at": "DATETIME",
        },
        "ai_execution_logs": {
            "recommendation_id": "INTEGER",
            "agent_key": "VARCHAR",
            "action_type": "VARCHAR",
            "action_payload_json": "TEXT",
            "status": "VARCHAR DEFAULT 'queued'",
            "confidence": "FLOAT DEFAULT 0",
            "reasoning_summary": "TEXT",
            "approval_status": "VARCHAR DEFAULT 'pending'",
            "execution_result_json": "TEXT",
            "rollback_state_json": "TEXT",
            "project_id": "INTEGER",
            "task_id": "INTEGER",
            "requested_by": "INTEGER",
            "executed_by": "INTEGER",
            "created_at": "DATETIME",
            "executed_at": "DATETIME",
        },
        "ai_approval_history": {
            "recommendation_id": "INTEGER",
            "action": "VARCHAR",
            "status": "VARCHAR",
            "reviewer_id": "INTEGER",
            "rejection_reason": "TEXT",
            "modified_payload_json": "TEXT",
            "confidence": "FLOAT DEFAULT 0",
            "execution_log_id": "INTEGER",
            "created_at": "DATETIME",
        },
        "ai_context_snapshots": {
            "scope": "VARCHAR DEFAULT 'organization'",
            "project_id": "INTEGER",
            "user_id": "INTEGER",
            "context_hash": "VARCHAR",
            "payload_json": "TEXT",
            "generated_at": "DATETIME",
        },
        "ai_decision_history": {
            "agent_key": "VARCHAR",
            "decision_type": "VARCHAR",
            "decision_json": "TEXT",
            "reasoning": "TEXT",
            "confidence": "FLOAT DEFAULT 0",
            "project_id": "INTEGER",
            "user_id": "INTEGER",
            "created_at": "DATETIME",
        },
        "ai_summaries": {
            "agent_key": "VARCHAR",
            "summary_type": "VARCHAR",
            "title": "VARCHAR",
            "body": "TEXT",
            "payload_json": "TEXT",
            "project_id": "INTEGER",
            "user_id": "INTEGER",
            "created_at": "DATETIME",
        },
        "ai_operational_observations": {
            "agent_key": "VARCHAR",
            "observation_type": "VARCHAR",
            "severity": "VARCHAR DEFAULT 'medium'",
            "title": "VARCHAR",
            "body": "TEXT",
            "payload_json": "TEXT",
            "confidence": "FLOAT DEFAULT 0",
            "project_id": "INTEGER",
            "task_id": "INTEGER",
            "user_id": "INTEGER",
            "created_at": "DATETIME",
        },
        # NOTE: AI Copilot tables use UUID-as-string (CHAR(36)/VARCHAR) IDs on SQLite.
        # Avoid adding INTEGER columns that would break inserts.
        "ai_conversations": {
            "title": "VARCHAR",
            "user_id": "INTEGER",
            "created_at": "DATETIME",
            "updated_at": "DATETIME",
        },
        "ai_messages": {
            "conversation_id": "VARCHAR",
            "role": "VARCHAR",
            "content": "TEXT",
            "file_name": "VARCHAR",
            "file_type": "VARCHAR",
            "created_at": "DATETIME",
        },
        "ai_documents": {
            "filename": "VARCHAR",
            "original_filename": "VARCHAR",
            "mime_type": "VARCHAR",
            "file_size": "INTEGER",
            "kind": "VARCHAR",
            "storage_path": "VARCHAR",
            "extraction_status": "VARCHAR DEFAULT 'pending'",
            "extracted_text": "TEXT",
            "summary": "TEXT",
            "metadata_json": "TEXT",
            "project_id": "INTEGER",
            "user_id": "INTEGER",
            "created_at": "DATETIME",
            "updated_at": "DATETIME",
        },
        "ai_document_chunks": {
            "document_id": "INTEGER",
            "chunk_index": "INTEGER",
            "content": "TEXT",
            "embedding_json": "TEXT",
            "token_estimate": "INTEGER DEFAULT 0",
            "metadata_json": "TEXT",
            "project_id": "INTEGER",
            "user_id": "INTEGER",
            "created_at": "DATETIME",
        },
        "ai_retrieval_logs": {
            "conversation_id": "INTEGER",
            "prompt": "TEXT",
            "retrieved_json": "TEXT",
            "project_id": "INTEGER",
            "user_id": "INTEGER",
            "created_at": "DATETIME",
        },
    }

    for table_name, columns in table_columns.items():
        add_missing_columns(table_name, columns)


upgrade_ai_agent_tables()


def upgrade_integration_tables():
    add_missing_columns(
        "oauth_accounts",
        {
            "refresh_token_expires_at": "DATETIME",
            "last_refreshed_at": "DATETIME",
            "refresh_error": "TEXT",
            "revoked_at": "DATETIME",
        },
    )
    add_missing_columns(
        "oauth_states",
        {
            "code_verifier_encrypted": "TEXT",
        },
    )


upgrade_integration_tables()
with SessionLocal() as seed_db:
    seed_workflow_triggers(seed_db)


# =========================
# FASTAPI APP
# =========================


app = FastAPI(
    title="WorkflowOS API",
    version="1.0.0"
)

app.middleware("http")(request_id_middleware)


# =========================
# CORS
# =========================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# ROOT ROUTE
# =========================

@app.get("/")
def root():

    return {
        "message":
            "WorkflowOS Backend Running"
    }


@app.get("/api/v1/analytics")
def get_dashboard_analytics(
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    from app.core.database import SessionLocal

    db = SessionLocal()

    try:
        projects = db.query(Project).all()
        tasks = db.query(Task).all()

        return {
            "data": dashboard_analytics(
                projects,
                tasks,
                db,
                current_user,
                role,
            )
        }

    finally:
        db.close()


# =========================
# AUTH ROUTES
# =========================

app.include_router(
    auth.router,
    prefix="/api/v1/auth",
    tags=["Authentication"]
)

app.include_router(
    users_router,
    prefix="/api/v1/users",
    tags=["Users"]
)

# =========================
# PROJECT ROUTES
# =========================

app.include_router(
    projects_router,
    prefix="/api/v1/projects",
    tags=["Projects"]
)


# =========================
# TASK ROUTES
# =========================

app.include_router(
    tasks_router,
    prefix="/api/v1/tasks",
    tags=["Tasks"]
)

app.include_router(
    comments_router,
    prefix="/api/v1",
    tags=["Comments"]
)

app.include_router(
    attachments_router,
    prefix="/api/v1/attachments",
    tags=["Attachments"]
)

app.include_router(
    planning_router,
    prefix="/api/v1/planning",
    tags=["Planning"]
)

app.include_router(
    automations_router,
    prefix="/api/v1/automations",
    tags=["Automations"]
)

app.include_router(
    integrations_router,
    prefix="/api/v1/integrations",
    tags=["Integrations"]
)

app.include_router(
    team_analytics_router,
    prefix="/api/v1/team-analytics",
    tags=["Team Analytics"]
)

app.include_router(
    analytics_router,
    prefix="/api/v1"
)

app.include_router(
    executive_reports_router,
    prefix="/api/v1/executive-reports",
    tags=["Executive Reports"]
)

app.include_router(
    realtime_router,
    prefix="/api/v1/realtime",
    tags=["Realtime"]
)


# =========================
# AI ROUTES
# =========================

app.include_router(
    ai_router,
    prefix="/api/v1/ai",
    tags=["AI"]
)

app.include_router(
    ai_copilot_router,
    prefix="/api/v1"
)

app.include_router(
    admin_router,
    prefix="/api/v1/admin",
    tags=["Admin"]
)

app.include_router(
    invitation_router,
    prefix="/api/v1/invitations",
    tags=["Invitations"]
)

app.include_router(
    demo_router,
    prefix="/api/v1",
    tags=["Demo"],
)


async def deadline_monitor_loop():
    while True:
        db = SessionLocal()

        try:
            run_deadline_monitoring(db)
            run_scheduled_automations(db)
            run_smart_notification_scan(db)
            persist_analytics_snapshot(db)
            agent_manager.run_analysis(db, role="Admin", persist=True)
        finally:
            db.close()

        await asyncio.sleep(900)


@app.on_event("startup")
async def start_deadline_monitor():
    openai_rag_service.validate_startup_configuration()
    asyncio.create_task(deadline_monitor_loop())


@app.exception_handler(AppError)


async def app_exception_handler(request: Request, exc: AppError):
    return app_error_response(exc, getattr(request.state, "request_id", None))


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return http_exception_response(exc, getattr(request.state, "request_id", None))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    messages = []

    for error in exc.errors():
        message = error.get("msg", "Invalid request.")
        location = error.get("loc", [])
        field = location[-1] if location else None

        if message == "Field required" and field == "start_date":
            message = "Start date is required."
        elif message == "Field required" and field == "end_date":
            message = "End date is required."
        elif message == "Field required" and field == "name":
            message = "Project title is required."
        elif message == "Field required" and field == "description":
            message = "Project description is required."

        if message.startswith("Value error, "):
            message = message.replace("Value error, ", "", 1)

        messages.append(message)

    request_id = getattr(request.state, "request_id", None)
    logger.warning("Validation error request_id=%s errors=%s", request_id, exc.errors())
    return JSONResponse(
        status_code=422,
        content={
            **error_payload(
                "VALIDATION_ERROR",
                messages[0] if messages else USER_SAFE_ERRORS["VALIDATION_ERROR"].message,
                request_id,
            ),
            "errors": messages,
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", None)
    logger.exception("Unhandled server error request_id=%s", request_id)
    return JSONResponse(
        status_code=500,
        content=error_payload(
            "INTERNAL_SERVER_ERROR",
            USER_SAFE_ERRORS["INTERNAL_SERVER_ERROR"].message,
            request_id,
        ),
    )


# =========================
# NOTIFICATION ROUTES
# =========================

app.include_router(
    notifications_router,
    prefix="/api/v1/notifications",
    tags=["Notifications"]
)


# =========================
# ACTIVITY ROUTES
# =========================

app.include_router(
    activity_router,
    prefix="/api/v1/activity",
    tags=["Activity"]
)
