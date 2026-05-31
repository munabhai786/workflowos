from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class AIAgentMemory(Base):
    __tablename__ = "ai_agent_memory"

    id = Column(Integer, primary_key=True, index=True)
    scope = Column(String, default="organization", index=True)
    agent_key = Column(String, nullable=False, index=True)
    memory_type = Column(String, nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    entity_type = Column(String, nullable=True, index=True)
    entity_id = Column(Integer, nullable=True, index=True)
    summary = Column(Text, nullable=False)
    data_json = Column(Text, nullable=True)
    confidence = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project")
    user = relationship("User")


class AIRecommendation(Base):
    __tablename__ = "ai_recommendations"

    id = Column(Integer, primary_key=True, index=True)
    agent_key = Column(String, nullable=False, index=True)
    category = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    reasoning = Column(Text, nullable=True)
    recommendation_type = Column(String, default="insight", index=True)
    action_type = Column(String, nullable=True, index=True)
    action_payload_json = Column(Text, nullable=True)
    severity = Column(String, default="medium", index=True)
    confidence = Column(Float, default=0.0)
    status = Column(String, default="open", index=True)
    approval_required = Column(Integer, default=1)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", foreign_keys=[project_id])
    task = relationship("Task", foreign_keys=[task_id])
    user = relationship("User", foreign_keys=[user_id])
    creator = relationship("User", foreign_keys=[created_by])
    approvals = relationship(
        "AIApprovalHistory",
        back_populates="recommendation",
        cascade="all, delete-orphan",
        order_by="AIApprovalHistory.created_at.desc()",
    )


class AIExecutionLog(Base):
    __tablename__ = "ai_execution_logs"

    id = Column(Integer, primary_key=True, index=True)
    recommendation_id = Column(Integer, ForeignKey("ai_recommendations.id"), nullable=True, index=True)
    agent_key = Column(String, nullable=False, index=True)
    action_type = Column(String, nullable=False, index=True)
    action_payload_json = Column(Text, nullable=True)
    status = Column(String, default="queued", index=True)
    confidence = Column(Float, default=0.0)
    reasoning_summary = Column(Text, nullable=True)
    approval_status = Column(String, default="pending", index=True)
    execution_result_json = Column(Text, nullable=True)
    rollback_state_json = Column(Text, nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True, index=True)
    requested_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    executed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    executed_at = Column(DateTime, nullable=True)

    recommendation = relationship("AIRecommendation")
    project = relationship("Project", foreign_keys=[project_id])
    task = relationship("Task", foreign_keys=[task_id])


class AIApprovalHistory(Base):
    __tablename__ = "ai_approval_history"

    id = Column(Integer, primary_key=True, index=True)
    recommendation_id = Column(Integer, ForeignKey("ai_recommendations.id"), nullable=False, index=True)
    action = Column(String, nullable=False, index=True)
    status = Column(String, nullable=False, index=True)
    reviewer_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    rejection_reason = Column(Text, nullable=True)
    modified_payload_json = Column(Text, nullable=True)
    confidence = Column(Float, default=0.0)
    execution_log_id = Column(Integer, ForeignKey("ai_execution_logs.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    recommendation = relationship("AIRecommendation", back_populates="approvals")
    reviewer = relationship("User", foreign_keys=[reviewer_id])
    execution_log = relationship("AIExecutionLog")


class AIContextSnapshot(Base):
    __tablename__ = "ai_context_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    scope = Column(String, default="organization", index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    context_hash = Column(String, nullable=False, index=True)
    payload_json = Column(Text, nullable=False)
    generated_at = Column(DateTime, default=datetime.utcnow, index=True)

    project = relationship("Project")
    user = relationship("User")


class AIDecisionHistory(Base):
    __tablename__ = "ai_decision_history"

    id = Column(Integer, primary_key=True, index=True)
    agent_key = Column(String, nullable=False, index=True)
    decision_type = Column(String, nullable=False, index=True)
    decision_json = Column(Text, nullable=False)
    reasoning = Column(Text, nullable=True)
    confidence = Column(Float, default=0.0)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    project = relationship("Project")
    user = relationship("User")


class AISummary(Base):
    __tablename__ = "ai_summaries"

    id = Column(Integer, primary_key=True, index=True)
    agent_key = Column(String, nullable=False, index=True)
    summary_type = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    payload_json = Column(Text, nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    project = relationship("Project")
    user = relationship("User")


class AIOperationalObservation(Base):
    __tablename__ = "ai_operational_observations"

    id = Column(Integer, primary_key=True, index=True)
    agent_key = Column(String, nullable=False, index=True)
    observation_type = Column(String, nullable=False, index=True)
    severity = Column(String, default="medium", index=True)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    payload_json = Column(Text, nullable=True)
    confidence = Column(Float, default=0.0)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    project = relationship("Project", foreign_keys=[project_id])
    task = relationship("Task", foreign_keys=[task_id])
    user = relationship("User", foreign_keys=[user_id])


class AIConversation(Base):
    __tablename__ = "ai_conversations"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    status = Column(String, default="active", index=True)
    memory_summary = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project")
    user = relationship("User")
    messages = relationship(
        "AIMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="AIMessage.created_at.asc()",
    )


class AIMessage(Base):
    __tablename__ = "ai_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("ai_conversations.id"), nullable=False, index=True)
    role = Column(String, nullable=False, index=True)
    content = Column(Text, nullable=False)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    conversation = relationship("AIConversation", back_populates="messages")


class AIDocument(Base):
    __tablename__ = "ai_documents"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False, index=True)
    original_filename = Column(String, nullable=False)
    mime_type = Column(String, nullable=False, index=True)
    file_size = Column(Integer, nullable=False)
    kind = Column(String, nullable=False, index=True)
    storage_path = Column(String, nullable=True)
    extraction_status = Column(String, default="pending", index=True)
    extracted_text = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project")
    user = relationship("User")
    chunks = relationship(
        "AIDocumentChunk",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="AIDocumentChunk.chunk_index.asc()",
    )


class AIDocumentChunk(Base):
    __tablename__ = "ai_document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("ai_documents.id"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False, index=True)
    content = Column(Text, nullable=False)
    embedding_json = Column(Text, nullable=True)
    token_estimate = Column(Integer, default=0)
    metadata_json = Column(Text, nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    document = relationship("AIDocument", back_populates="chunks")
    project = relationship("Project")
    user = relationship("User")


class AIRetrievalLog(Base):
    __tablename__ = "ai_retrieval_logs"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("ai_conversations.id"), nullable=True, index=True)
    prompt = Column(Text, nullable=False)
    retrieved_json = Column(Text, nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    conversation = relationship("AIConversation")
    project = relationship("Project")
    user = relationship("User")
