from fastapi import APIRouter, Depends, File, Header, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, get_optional_current_user
from app.agents.agent_manager import agent_manager
from app.agents.approval_engine import approval_engine
from app.models.ai_agent import (
    AIAgentMemory,
    AIApprovalHistory,
    AIContextSnapshot,
    AIDecisionHistory,
    AIExecutionLog,
    AIRecommendation,
    AISummary,
    AIOperationalObservation,
)
from app.models.user import User
from app.services.openai_rag_service import openai_rag_service
from app.services.ai_intelligence_service import (
    analyze_operational_intelligence,
    run_deadline_monitoring,
)
from app.services.ai_task_service import analyze_task_intelligence
from app.services.ai_risk_prediction_service import build_risk_predictions


router = APIRouter()


class CopilotPrompt(BaseModel):
    prompt: str = Field(..., min_length=2, max_length=12000)
    project_id: int | None = None
    conversation_id: int | None = None
    document_ids: list[int] = Field(default_factory=list)
    memory: list[dict] = Field(default_factory=list)
    workspace_context: dict = Field(default_factory=dict)
    file_context: list[dict] = Field(default_factory=list)


class ApprovalPayload(BaseModel):
    modified_payload: dict | None = None


class RejectionPayload(BaseModel):
    reason: str | None = None


class ModifyPayload(BaseModel):
    payload: dict


def serialize_execution(item: AIExecutionLog):
    return {
        "id": item.id,
        "recommendation_id": item.recommendation_id,
        "agent_key": item.agent_key,
        "action_type": item.action_type,
        "action_payload_json": item.action_payload_json,
        "status": item.status,
        "confidence": item.confidence,
        "reasoning_summary": item.reasoning_summary,
        "approval_status": item.approval_status,
        "execution_result_json": item.execution_result_json,
        "rollback_state_json": item.rollback_state_json,
        "project_id": item.project_id,
        "task_id": item.task_id,
        "requested_by": item.requested_by,
        "executed_by": item.executed_by,
        "created_at": item.created_at,
        "executed_at": item.executed_at,
    }


def serialize_approval(item: AIApprovalHistory):
    return {
        "id": item.id,
        "recommendation_id": item.recommendation_id,
        "action": item.action,
        "status": item.status,
        "reviewer_id": item.reviewer_id,
        "rejection_reason": item.rejection_reason,
        "modified_payload_json": item.modified_payload_json,
        "confidence": item.confidence,
        "execution_log_id": item.execution_log_id,
        "created_at": item.created_at,
    }


@router.get("/insights")
def get_ai_insights(
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    return analyze_operational_intelligence(
        db=db,
        current_user=current_user,
        role=role,
    )


@router.get("/risk-predictions")
def get_ai_risk_predictions(
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    return build_risk_predictions(
        db=db,
        current_user=current_user,
        role=role,
    )


@router.get("/tasks")
def get_ai_task_intelligence(
    db: Session = Depends(get_db),
    role: str | None = Header(None),
):
    if role not in ["Admin", "Manager"]:
        return {
            "workload_balancing": [],
            "prioritized_tasks": [],
            "delivery_risks": [],
            "sprint_recommendations": [],
            "productivity_forecast": {
                "completed_last_14_days": 0,
                "forecast_next_14_days": 0,
                "confidence": 0,
            },
        }

    return analyze_task_intelligence(db)


@router.post("/deadline-check")
def run_ai_deadline_check(
    db: Session = Depends(get_db),
    role: str | None = Header(None),
):
    if role not in ["Admin", "Manager"]:
        return {
            "alerts_created": 0,
            "alerts": [],
        }

    alerts = run_deadline_monitoring(db)

    return {
        "alerts_created": len(alerts),
        "alerts": alerts,
    }


@router.get("/agents")
def get_ai_agents():
    return {"agents": agent_manager.list_agents()}


@router.post("/documents")
async def upload_ai_document(
    file: UploadFile = File(...),
    project_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = await openai_rag_service.ingest_document(
        db=db,
        file=file,
        current_user=current_user,
        project_id=project_id,
    )
    return {"success": True, "document": openai_rag_service.serialize_document(document)}


@router.post("/file-context")
async def build_ai_file_context(
    file: UploadFile = File(...),
    project_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = await openai_rag_service.ingest_document(
        db=db,
        file=file,
        current_user=current_user,
        project_id=project_id,
    )
    serialized = openai_rag_service.serialize_document(document)
    return {
        "success": True,
        **serialized,
        "text_excerpt": (document.extracted_text or "")[:9000],
        "supported_questions": [
            "Summarize this document",
            "Generate tasks from this file",
            "Identify delivery risks",
            "Create sprint plan",
            "Review UI or architecture decisions",
        ],
    }


@router.get("/documents")
def list_ai_documents(
    project_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.ai_agent import AIDocument

    query = db.query(AIDocument).filter(AIDocument.user_id == current_user.id)
    if project_id is not None:
        query = query.filter(AIDocument.project_id == project_id)
    documents = query.order_by(AIDocument.created_at.desc()).limit(80).all()
    return {"documents": [openai_rag_service.serialize_document(item) for item in documents]}


@router.post("/agents/analyze")
def run_agent_analysis(
    project_id: int | None = Query(None),
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    return agent_manager.run_analysis(
        db=db,
        current_user=current_user,
        role=role,
        project_id=project_id,
        persist=True,
    )


@router.get("/recommendations")
def get_agent_recommendations(
    status: str | None = Query(None),
    project_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    query = db.query(AIRecommendation).order_by(AIRecommendation.created_at.desc())
    if status:
        query = query.filter(AIRecommendation.status == status)
    if project_id:
        query = query.filter(AIRecommendation.project_id == project_id)
    if role not in ["Admin", "Manager"] and current_user:
        query = query.filter(
            (AIRecommendation.user_id == current_user.id) |
            (AIRecommendation.created_by == current_user.id)
        )
    elif role not in ["Admin", "Manager"] and not current_user:
        query = query.filter(AIRecommendation.id == -1)
    return {
        "recommendations": [
            agent_manager.serialize_recommendation(item)
            for item in query.limit(limit).all()
        ]
    }


@router.post("/copilot")
def ask_workspace_copilot(
    payload: CopilotPrompt,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    if current_user:
        return openai_rag_service.answer(
            db=db,
            prompt=payload.prompt,
            current_user=current_user,
            role=role,
            project_id=payload.project_id,
            conversation_id=payload.conversation_id,
            document_ids=payload.document_ids,
            client_memory=payload.memory,
            workspace_context=payload.workspace_context,
        )
    return agent_manager.copilot_answer(
        db=db,
        prompt=payload.prompt,
        current_user=current_user,
        role=role,
        project_id=payload.project_id,
        memory=payload.memory,
        workspace_context=payload.workspace_context,
        file_context=payload.file_context,
    )


@router.post("/recommendations/{recommendation_id}/approve")
def approve_recommendation(
    recommendation_id: int,
    payload: ApprovalPayload,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    execution = approval_engine.approve(
        db=db,
        recommendation_id=recommendation_id,
        reviewer=current_user,
        role=role,
        modified_payload=payload.modified_payload,
    )
    return {"execution": serialize_execution(execution)}


@router.post("/recommendations/{recommendation_id}/reject")
def reject_recommendation(
    recommendation_id: int,
    payload: RejectionPayload,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    approval = approval_engine.reject(
        db=db,
        recommendation_id=recommendation_id,
        reviewer=current_user,
        role=role,
        reason=payload.reason,
    )
    return {"approval": serialize_approval(approval)}


@router.post("/recommendations/{recommendation_id}/modify")
def modify_recommendation(
    recommendation_id: int,
    payload: ModifyPayload,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    recommendation = approval_engine.modify(
        db=db,
        recommendation_id=recommendation_id,
        reviewer=current_user,
        role=role,
        payload=payload.payload,
    )
    return {"recommendation": agent_manager.serialize_recommendation(recommendation)}


@router.get("/execution-logs")
def get_ai_execution_logs(
    recommendation_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    role: str | None = Header(None),
):
    if role not in ["Admin", "Manager"]:
        return {"execution_logs": []}
    query = db.query(AIExecutionLog).order_by(AIExecutionLog.created_at.desc())
    if recommendation_id:
        query = query.filter(AIExecutionLog.recommendation_id == recommendation_id)
    return {"execution_logs": [serialize_execution(item) for item in query.limit(limit).all()]}


@router.get("/approvals")
def get_ai_approvals(
    recommendation_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    role: str | None = Header(None),
):
    if role not in ["Admin", "Manager"]:
        return {"approvals": []}
    query = db.query(AIApprovalHistory).order_by(AIApprovalHistory.created_at.desc())
    if recommendation_id:
        query = query.filter(AIApprovalHistory.recommendation_id == recommendation_id)
    return {"approvals": [serialize_approval(item) for item in query.limit(limit).all()]}


@router.get("/memory")
def get_ai_memory(
    project_id: int | None = Query(None),
    agent_key: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    role: str | None = Header(None),
):
    if role not in ["Admin", "Manager"]:
        return {"memory": []}
    query = db.query(AIAgentMemory).order_by(AIAgentMemory.updated_at.desc())
    if project_id:
        query = query.filter(AIAgentMemory.project_id == project_id)
    if agent_key:
        query = query.filter(AIAgentMemory.agent_key == agent_key)
    return {
        "memory": [
            {
                "id": item.id,
                "scope": item.scope,
                "agent_key": item.agent_key,
                "memory_type": item.memory_type,
                "project_id": item.project_id,
                "user_id": item.user_id,
                "entity_type": item.entity_type,
                "entity_id": item.entity_id,
                "summary": item.summary,
                "data_json": item.data_json,
                "confidence": item.confidence,
                "created_at": item.created_at,
                "updated_at": item.updated_at,
            }
            for item in query.limit(limit).all()
        ]
    }


@router.get("/summaries")
def get_ai_summaries(
    project_id: int | None = Query(None),
    summary_type: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    query = db.query(AISummary).order_by(AISummary.created_at.desc())
    if project_id:
        query = query.filter(AISummary.project_id == project_id)
    if summary_type:
        query = query.filter(AISummary.summary_type == summary_type)
    if role not in ["Admin", "Manager"] and current_user:
        query = query.filter(AISummary.user_id == current_user.id)
    elif role not in ["Admin", "Manager"] and not current_user:
        query = query.filter(AISummary.id == -1)
    return {
        "summaries": [
            {
                "id": item.id,
                "agent_key": item.agent_key,
                "summary_type": item.summary_type,
                "title": item.title,
                "body": item.body,
                "payload_json": item.payload_json,
                "project_id": item.project_id,
                "user_id": item.user_id,
                "created_at": item.created_at,
            }
            for item in query.limit(limit).all()
        ]
    }


@router.get("/observations")
def get_ai_observations(
    project_id: int | None = Query(None),
    agent_key: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    role: str | None = Header(None),
):
    if role not in ["Admin", "Manager"]:
        return {"observations": []}
    query = db.query(AIOperationalObservation).order_by(AIOperationalObservation.created_at.desc())
    if project_id:
        query = query.filter(AIOperationalObservation.project_id == project_id)
    if agent_key:
        query = query.filter(AIOperationalObservation.agent_key == agent_key)
    return {
        "observations": [
            {
                "id": item.id,
                "agent_key": item.agent_key,
                "observation_type": item.observation_type,
                "severity": item.severity,
                "title": item.title,
                "body": item.body,
                "payload_json": item.payload_json,
                "confidence": item.confidence,
                "project_id": item.project_id,
                "task_id": item.task_id,
                "user_id": item.user_id,
                "created_at": item.created_at,
            }
            for item in query.limit(limit).all()
        ]
    }


@router.get("/decision-history")
def get_ai_decision_history(
    agent_key: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    role: str | None = Header(None),
):
    if role not in ["Admin", "Manager"]:
        return {"decisions": []}
    query = db.query(AIDecisionHistory).order_by(AIDecisionHistory.created_at.desc())
    if agent_key:
        query = query.filter(AIDecisionHistory.agent_key == agent_key)
    return {
        "decisions": [
            {
                "id": item.id,
                "agent_key": item.agent_key,
                "decision_type": item.decision_type,
                "decision_json": item.decision_json,
                "reasoning": item.reasoning,
                "confidence": item.confidence,
                "project_id": item.project_id,
                "user_id": item.user_id,
                "created_at": item.created_at,
            }
            for item in query.limit(limit).all()
        ]
    }


@router.get("/context-snapshots")
def get_ai_context_snapshots(
    project_id: int | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    role: str | None = Header(None),
):
    if role not in ["Admin", "Manager"]:
        return {"context_snapshots": []}
    query = db.query(AIContextSnapshot).order_by(AIContextSnapshot.generated_at.desc())
    if project_id:
        query = query.filter(AIContextSnapshot.project_id == project_id)
    return {
        "context_snapshots": [
            {
                "id": item.id,
                "scope": item.scope,
                "project_id": item.project_id,
                "user_id": item.user_id,
                "context_hash": item.context_hash,
                "payload_json": item.payload_json,
                "generated_at": item.generated_at,
            }
            for item in query.limit(limit).all()
        ]
    }
