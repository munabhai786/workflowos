from datetime import datetime
from typing import List, Optional
from uuid import UUID
import logging

from pydantic import BaseModel
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models.ai_copilot import AIConversation, AIMessage
from app.models.user import User
from app.schemas.ai_copilot import AIConversationCreate, AIConversationSchema
from app.services.ai_copilot_service import (
    chat_with_claude,
    create_copilot_conversation,
    extract_text_from_file,
    get_project_context,
)
from app.services.ai_project_generator_service import (
    preview_project_plan,
    generate_project_from_plan,
)
from app.services.ai_workspace_memory_service import build_workspace_context
from app.services.ai_actions import detect_ai_action, execute_ai_action
from app.services.task_service import serialize_task


router = APIRouter(prefix="/ai-copilot", tags=["AI Copilot"])
logger = logging.getLogger(__name__)


class AIActionDetectRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    context_hint: Optional[str] = None


@router.get(
    "/conversations",
    response_model=List[AIConversationSchema],
)
def get_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(AIConversation)
        .filter(AIConversation.user_id == current_user.id)
        .order_by(AIConversation.updated_at.desc())
        .all()
    )


@router.get(
    "/conversations/{conversation_id}",
    response_model=AIConversationSchema,
)
def get_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = (
        db.query(AIConversation)
        .filter(
            AIConversation.id == str(conversation_id),
            AIConversation.user_id == current_user.id,
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found",
        )

    return conversation


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = (
        db.query(AIConversation)
        .filter(
            AIConversation.id == str(conversation_id),
            AIConversation.user_id == current_user.id,
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found",
        )

    db.delete(conversation)
    db.commit()

    return {"message": "Conversation deleted"}


@router.post("/actions/detect")
def detect_action(
    payload: AIActionDetectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message = payload.message.strip()

    if not message:
        raise HTTPException(
            status_code=400,
            detail="Message is required for action detection.",
        )

    context_hint = payload.context_hint or ""

    if payload.conversation_id:
        conversation = (
            db.query(AIConversation)
            .filter(
                AIConversation.id == payload.conversation_id,
                AIConversation.user_id == current_user.id,
            )
            .first()
        )

        if conversation:
            context_hint = (
                f"{context_hint}\nConversation title: {conversation.title}"
            ).strip()

    action = detect_ai_action(
        message=message,
        context_hint=context_hint,
    )

    return action


class AIActionExecuteRequest(BaseModel):
    action: dict
    conversation_id: Optional[str] = None


@router.post("/actions/execute")
def execute_action(
    payload: AIActionExecuteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    action = payload.action or {}
    intent = action.get("intent")
    if not intent or intent == "none":
        raise HTTPException(
            status_code=400,
            detail="No executable action was provided.",
        )

    result = None
    try:
        result = execute_ai_action(action, db, current_user)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    conversation = None
    if payload.conversation_id:
        conversation = (
            db.query(AIConversation)
            .filter(
                AIConversation.id == payload.conversation_id,
                AIConversation.user_id == current_user.id,
            )
            .first()
        )

    if conversation is None:
        conversation = create_copilot_conversation(
            db=db,
            user_id=current_user.id,
            title_seed=intent,
        )

    action_message = AIMessage(
        conversation_id=str(conversation.id),
        role="assistant",
        content=result.get("message") or "Action executed.",
    )
    db.add(action_message)
    conversation.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(action_message)

    logger.info(
        "[AI ACTION] intent=%s parsed=True executed=True task_id=%s",
        intent,
        result.get("task_id"),
    )

    response = {
        "executed": True,
        "intent": intent,
        "action_result": result.get("action_result"),
        "conversation_id": str(conversation.id),
        "message": {
            "id": str(action_message.id),
            "role": action_message.role,
            "content": action_message.content,
            "created_at": action_message.created_at.isoformat(),
        },
    }
    if result.get("task") is not None:
        response["task"] = serialize_task(result.get("task"))

    return response


@router.post("/chat")
async def chat(
    message: str = Form(...),
    conversation_id: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file_content = None
    file_name = None
    file_type = None

    if file:
        file_bytes = await file.read()
        file_name = file.filename or "upload"
        ext = file_name.split(".")[-1].lower()
        file_type = ext

        logger.info(
            "[AI COPILOT] upload_received user_id=%s conversation_id=%s "
            "file_name=%s file_type=%s file_size=%s",
            current_user.id,
            conversation_id,
            file_name,
            file_type,
            len(file_bytes),
        )

        allowed = [
            "pdf",
            "png",
            "jpg",
            "jpeg",
            "docx",
            "txt",
            "webp",
        ]
        if ext not in allowed:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"File type .{ext} not supported. "
                    "Use: PDF, PNG, JPG, DOCX, TXT"
                ),
            )

        if len(file_bytes) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail="File too large. Maximum size is 10MB.",
            )

        try:
            file_content = extract_text_from_file(
                file_bytes,
                ext,
                file_name,
            )
        except Exception as exc:
            logger.exception(
                "[AI COPILOT] file_extract_failed user_id=%s "
                "conversation_id=%s file_name=%s file_type=%s",
                current_user.id,
                conversation_id,
                file_name,
                file_type,
            )
            raise HTTPException(
                status_code=400,
                detail="Unable to read this file. Please try another file.",
            ) from exc

    project_context = get_project_context(
        db,
        current_user.id,
    )

    conv_uuid = None
    if conversation_id:
        try:
            conv_uuid = UUID(conversation_id)
        except ValueError:
            logger.warning(
                "[AI COPILOT] invalid_conversation_id user_id=%s "
                "conversation_id=%s creating_new_conversation=True",
                current_user.id,
                conversation_id,
            )
            conv_uuid = None

    try:
        result = chat_with_claude(
            db=db,
            user_id=current_user.id,
            user_message=message,
            conversation_id=conv_uuid,
            file_content=file_content,
            file_name=file_name,
            file_type=file_type,
            project_context=project_context,
        )
    except ValueError as exc:
        logger.warning(
            "[AI COPILOT] chat_rejected user_id=%s conversation_id=%s error=%s",
            current_user.id,
            conversation_id,
            str(exc),
        )
        raise HTTPException(
            status_code=400,
            detail="Conversation expired. Please start a new message.",
        ) from exc

    return {
        "conversation_id": str(result["conversation_id"]),
        "message": {
            "id": str(result["message"].id),
            "role": result["message"].role,
            "content": result["message"].content,
            "file_name": result["message"].file_name,
            "file_type": result["message"].file_type,
            "created_at": result["message"].created_at.isoformat(),
        },
        "suggested_actions": result.get("suggested_actions", []),
        "confidence": result.get("confidence"),
    }


@router.post(
    "/conversations",
    response_model=AIConversationSchema,
)
def create_conversation(
    payload: AIConversationCreate = AIConversationCreate(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = AIConversation(
        user_id=current_user.id,
        title=payload.title or "New Conversation",
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    return conversation


class ProjectPreviewRequest(BaseModel):
    project_description: str
    include_workspace_context: bool = True


@router.post("/projects/preview")
def preview_project(
    payload: ProjectPreviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.project_description.strip():
        raise HTTPException(
            status_code=400,
            detail="Project description is required.",
        )

    workspace_summary = None
    if payload.include_workspace_context:
        try:
            workspace_memory = build_workspace_context(db, current_user)
            workspace_summary = workspace_memory.get("summary")
        except Exception as e:
            logger.warning(
                "[AI PROJECT] workspace_context_failed user_id=%s error=%s",
                current_user.id,
                str(e),
            )

    try:
        result = preview_project_plan(
            db=db,
            current_user=current_user,
            project_description=payload.project_description,
            workspace_summary=workspace_summary,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    logger.info(
        "[AI PROJECT] preview_generated user_id=%s "
        "project_name=%s",
        current_user.id,
        result.get("preview", {}).get("project", {}).get("name", "Untitled"),
    )

    return {
        "preview": result.get("preview"),
    }


class ProjectGenerateRequest(BaseModel):
    plan: dict


@router.post("/projects/generate")
def generate_project(
    payload: ProjectGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.plan:
        raise HTTPException(
            status_code=400,
            detail="Project plan is required.",
        )

    try:
        result = generate_project_from_plan(
            db=db,
            current_user=current_user,
            plan=payload.plan,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    logger.info(
        "[AI PROJECT] project_generated user_id=%s project_id=%s "
        "project_name=%s task_count=%s",
        current_user.id,
        result.get("project", {}).get("id"),
        result.get("project", {}).get("name"),
        len(result.get("tasks", [])),
    )

    return {
        "project": result.get("project"),
        "tasks": result.get("tasks"),
        "milestones": result.get("milestones"),
    }
