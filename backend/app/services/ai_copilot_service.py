from datetime import datetime
import logging
from typing import List, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.ai_copilot import AIConversation, AIMessage, AIUploadedFile
from app.services.ai_workspace_memory_service import (
    build_workspace_context,
    summarize_conversation_memory,
)


logger = logging.getLogger(__name__)

MAX_HISTORY_MESSAGES = 18
MAX_FILE_CONTEXT_CHARS = 12000
MAX_STORED_FILES = 5


def extract_text_from_file(
    file_bytes: bytes,
    file_type: str,
    file_name: str,
) -> str:
    file_type = (file_type or "").lower()

    if file_type == "pdf":
        import fitz

        doc = fitz.open(stream=file_bytes, filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text()
        return text.strip()

    if file_type in ["png", "jpg", "jpeg", "webp"]:
        import base64
        import anthropic

        client = anthropic.Anthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            base_url=settings.ANTHROPIC_BASE_URL,
        )

        b64 = base64.standard_b64encode(file_bytes).decode("utf-8")

        media_map = {
            "png": "image/png",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "webp": "image/webp",
        }
        response = client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=2000,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_map.get(
                                    file_type,
                                    "image/jpeg",
                                ),
                                "data": b64,
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                "Extract and return all text content from "
                                "this image. Return only the extracted text, "
                                "nothing else."
                            ),
                        },
                    ],
                }
            ],
        )
        return response.content[0].text

    if file_type == "docx":
        import io
        from docx import Document

        doc = Document(io.BytesIO(file_bytes))
        return "\n".join(
            [
                paragraph.text
                for paragraph in doc.paragraphs
                if paragraph.text.strip()
            ]
        )

    if file_type == "txt":
        return file_bytes.decode("utf-8", errors="ignore")

    return ""


def get_conversation_history(
    db: Session,
    conversation_id: UUID | str,
) -> List[dict]:
    conversation_id = str(conversation_id)

    messages = (
        db.query(AIMessage)
        .filter(AIMessage.conversation_id == conversation_id)
        .order_by(AIMessage.created_at)
        .all()
    )

    history = []
    recent_messages = messages[-MAX_HISTORY_MESSAGES:]
    omitted_count = max(0, len(messages) - len(recent_messages))

    if omitted_count:
        history.append(
            {
                "role": "user",
                "content": (
                    f"Conversation note: {omitted_count} earlier message(s) "
                    "exist in this thread. Continue using the visible recent "
                    "conversation and ask a clarifying question if older detail "
                    "is required."
                ),
            }
        )

    for msg in recent_messages:
        history.append(
            {
                "role": msg.role,
                "content": msg.content,
            }
        )
    return history


def get_uploaded_files_context(
    db: Session,
    conversation_id: UUID | str,
    current_file_name: Optional[str] = None,
) -> str:
    uploads = (
        db.query(AIUploadedFile)
        .filter(AIUploadedFile.conversation_id == str(conversation_id))
        .order_by(AIUploadedFile.created_at.desc())
        .limit(MAX_STORED_FILES)
        .all()
    )

    sections = []
    budget = MAX_FILE_CONTEXT_CHARS

    for uploaded in uploads:
        if current_file_name and uploaded.file_name == current_file_name:
            continue

        content = (uploaded.file_content or "").strip()
        if not content:
            continue

        snippet = content[: min(len(content), max(1200, budget // 2))]
        budget -= len(snippet)
        sections.append(
            "\n".join(
                [
                    f"Stored file: {uploaded.file_name}",
                    f"Type: {uploaded.file_type}",
                    "Excerpt:",
                    snippet,
                ]
            )
        )

        if budget <= 0:
            break

    if not sections:
        return ""

    return "\n\n".join(sections)


def build_system_prompt(
    workspace_context: Optional[str],
    file_context: Optional[str],
    conversation_memory: Optional[str],
) -> str:
    system_prompt = """You are WorkflowOS Copilot, a premium AI assistant inside WorkflowOS.

Your job is to help with project execution, planning, file analysis, productivity decisions, technical questions, brainstorming, and general work questions.

Behavior rules:
- Be direct, professional, and useful.
- Preserve conversational continuity from the provided chat history.
- Use workspace/project data when it is relevant, but do not force every answer to be about projects.
- When answering from uploaded files, cite the file name or evidence source in plain language.
- Never invent facts from a filename, missing document content, or weak workspace context.
- Always ground answers in the provided workspace summary and conversation memory. Do not hallucinate workspace data.
- If the user asks a follow-up like "what are blockers?", infer the likely subject from recent messages and uploaded files; ask a short clarifying question only when the context is genuinely ambiguous.
- For comparisons, decisions, plans, risks, sprint reports, and document analysis, use clear markdown headings, bullets, tables when compact, and recommended next actions.
- If the user requests a WorkflowOS product action, respond in a way that can be detected and confirmed by the backend. Do not say the system cannot create or update tasks that WorkflowOS supports.
- If an action is executable, offer confirmation or report success clearly. Never pretend an action completed when it did not.
- Keep responses concise unless the user asks for depth.
"""

    if workspace_context:
        system_prompt += f"""

WORKSPACE MEMORY SUMMARY:
{workspace_context}

Use this as a bounded snapshot of the user's active workspace. Mention uncertainty if the data is incomplete.
"""

    if conversation_memory:
        system_prompt += f"""

CONVERSATION MEMORY SUMMARY:
{conversation_memory}

Use this summary to preserve continuity with earlier discussion. If detail is missing, ask a focused follow-up question.
"""

    if file_context:
        system_prompt += f"""

DOCUMENT CONTEXT AVAILABLE IN THIS CONVERSATION:
{file_context}

Use this document context for follow-up questions. Compare files only using the provided content. If evidence is insufficient, say what is missing.
"""

    return system_prompt


def generate_suggested_actions(
    user_message: str,
    ai_reply: str,
    file_name: Optional[str] = None,
) -> List[str]:
    text = f"{user_message}\n{ai_reply}".lower()
    actions: list[str] = []

    def add(action: str):
        if action not in actions and len(actions) < 4:
            actions.append(action)

    if file_name or any(word in text for word in ["document", "file", "requirements", "resume", "pdf"]):
        add("Summarize the key evidence from this file")
        add("Extract action items and owners")

    if any(word in text for word in ["risk", "blocker", "blocked", "deadline", "delay"]):
        add("Create a risk and blocker plan")

    if any(word in text for word in ["sprint", "standup", "progress", "status", "report"]):
        add("Generate a sprint status report")

    if any(word in text for word in ["task", "todo", "action item", "owner"]):
        add("Draft tasks from this response")

    if any(word in text for word in ["compare", "difference", "versus", "vs"]):
        add("Create a structured comparison table")

    add("Turn this into an execution plan")
    add("What should I do next?")

    return actions[:4]


def estimate_confidence(
    ai_reply: str,
    file_content: Optional[str],
    project_context: Optional[str],
) -> float:
    reply = (ai_reply or "").lower()
    confidence = 0.72

    if file_content:
        confidence += 0.12

    if project_context:
        confidence += 0.08

    uncertainty_markers = [
        "not enough information",
        "insufficient",
        "i don't have",
        "unclear",
        "clarify",
        "missing",
    ]

    if any(marker in reply for marker in uncertainty_markers):
        confidence -= 0.18

    return round(max(0.35, min(0.96, confidence)), 2)


def create_copilot_conversation(
    db: Session,
    user_id,
    title_seed: str,
) -> AIConversation:
    title = title_seed.strip() or "New Conversation"
    convo = AIConversation(
        user_id=user_id,
        title=(
            title[:60] + "..."
            if len(title) > 60
            else title
        ),
    )
    db.add(convo)
    db.commit()
    db.refresh(convo)
    return convo


def chat_with_claude(
    db: Session,
    user_id,
    user_message: str,
    conversation_id: Optional[UUID],
    file_content: Optional[str],
    file_name: Optional[str],
    file_type: Optional[str],
    project_context: Optional[str],
) -> dict:
    import anthropic

    client = anthropic.Anthropic(
        api_key=settings.ANTHROPIC_API_KEY,
        base_url=settings.ANTHROPIC_BASE_URL,
    )


    incoming_conversation_id = str(conversation_id) if conversation_id else None
    recovered_conversation = False

    if not conversation_id:
        convo = create_copilot_conversation(
            db=db,
            user_id=user_id,
            title_seed=user_message,
        )
    else:
        convo = (
            db.query(AIConversation)
            .filter(
                AIConversation.id == str(conversation_id),
                AIConversation.user_id == user_id,
            )
            .first()
        )

        if not convo:
            recovered_conversation = True
            logger.warning(
                "[AI COPILOT] conversation_id=%s user_id=%s "
                "conversation_found=False creating_new_conversation=True",
                incoming_conversation_id,
                user_id,
            )
            convo = create_copilot_conversation(
                db=db,
                user_id=user_id,
                title_seed=user_message,
            )

    conversation_id = str(convo.id)

    logger.info(
        "[AI COPILOT] conversation_id=%s active_conversation_id=%s "
        "user_id=%s conversation_found=True recovered=%s file_attached=%s",
        incoming_conversation_id,
        conversation_id,
        user_id,
        recovered_conversation,
        bool(file_name),
    )

    stored_file_context = get_uploaded_files_context(
        db,
        conversation_id,
        current_file_name=file_name,
    )
    file_context_sections = []
    if file_content:
        file_context_sections.append(
            "\n".join(
                [
                    f"Current uploaded file: {file_name or 'document'}",
                    f"Type: {file_type or 'unknown'}",
                    "Content:",
                    file_content[:MAX_FILE_CONTEXT_CHARS],
                ]
            )
        )

    if stored_file_context:
        file_context_sections.append(stored_file_context)

    conversation_memory = summarize_conversation_memory(db, convo)

    # Smart Workspace Memory MUST NEVER crash the copilot.
    workspace_context_summary: Optional[str] = None
    try:
        conversation_for_memory = (
            db.query(AIConversation)
            .filter(AIConversation.id == conversation_id)
            .first()
        )

        if not conversation_for_memory:
            logger.warning(
                "[WORKSPACE MEMORY] conversation_found=False conversation_id=%s",
                conversation_id,
            )
        else:
            # AICopilotConversation may NOT expose a relationship `user`.
            user_obj = None
            user_found = False

            if hasattr(conversation_for_memory, "user") and getattr(
                conversation_for_memory, "user"
            ) is not None:
                user_obj = getattr(conversation_for_memory, "user")
                user_found = True
            else:
                user_id_for_memory = getattr(conversation_for_memory, "user_id", None)
                if user_id_for_memory is not None:
                    from app.models.user import User

                    user_obj = db.query(User).filter(User.id == user_id_for_memory).first()
                    user_found = user_obj is not None

            logger.info(
                "[WORKSPACE MEMORY] conversation_found=True conversation_id=%s user_found=%s",
                conversation_id,
                user_found,
            )

            if user_obj is not None:
                workspace_memory = build_workspace_context(db, user_obj)
                workspace_context_summary = (
                    workspace_memory.get("summary") if isinstance(workspace_memory, dict) else None
                )
                logger.info(
                    "[WORKSPACE MEMORY] memory_loaded=%s workspace_context_present=%s",
                    bool(workspace_context_summary),
                    bool(workspace_context_summary),
                )
            else:
                logger.warning(
                    "[WORKSPACE MEMORY] memory_loaded=False fallback_used=True reason=missing_user"
                )
    except Exception:
        logger.exception(
            "[WORKSPACE MEMORY] memory_loaded=False fallback_used=True"
        )

    system_prompt = build_system_prompt(
        workspace_context=workspace_context_summary,
        file_context="\n\n".join(file_context_sections),
        conversation_memory=conversation_memory,
    )

    history = get_conversation_history(db, conversation_id)
    history.append(
        {
            "role": "user",
            "content": user_message,
        }
    )

    response = client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=2000,
        system=system_prompt,
        messages=history,
    )

    ai_reply = response.content[0].text
    suggested_actions = generate_suggested_actions(
        user_message=user_message,
        ai_reply=ai_reply,
        file_name=file_name,
    )
    confidence = estimate_confidence(
        ai_reply=ai_reply,
        file_content=file_content or stored_file_context,
        project_context=project_context,
    )

    user_msg = AIMessage(
        conversation_id=conversation_id,
        role="user",
        content=user_message,
        file_name=file_name,
        file_type=file_type,
    )
    db.add(user_msg)

    if file_content and file_name and file_type:
        logger.info(
            "[AI COPILOT] linking_upload conversation_id=%s user_id=%s "
            "file_name=%s file_type=%s",
            conversation_id,
            user_id,
            file_name,
            file_type,
        )
        uploaded_file = AIUploadedFile(
            user_id=user_id,
            conversation_id=conversation_id,
            file_name=file_name,
            file_type=file_type,
            file_size=None,
            file_content=file_content,
        )
        db.add(uploaded_file)

    ai_msg = AIMessage(
        conversation_id=conversation_id,
        role="assistant",
        content=ai_reply,
    )
    db.add(ai_msg)

    convo.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(ai_msg)

    return {
        "conversation_id": conversation_id,
        "message": ai_msg,
        "suggested_actions": suggested_actions,
        "confidence": confidence,
    }


def get_project_context(
    db: Session,
    user_id,
) -> str:
    from app.models.project import Project
    from app.models.task import Task

    projects = (
        db.query(Project)
        .filter(Project.owner_id == user_id)
        .limit(10)
        .all()
    )

    context = "USER PROJECTS:\n"
    for project in projects:
        tasks = (
            db.query(Task)
            .filter(Task.project_id == project.id)
            .all()
        )
        overdue = [
            task
            for task in tasks
            if task.due_date
            and task.due_date < datetime.utcnow()
            and task.status != "completed"
        ]
        context += f"""
- Project: {project.name}
  Status: {project.status}
  Priority: {project.priority}
  Progress: {project.progress}%
  Deadline: {project.end_date}
  Total Tasks: {len(tasks)}
  Overdue Tasks: {len(overdue)}
"""
    return context
