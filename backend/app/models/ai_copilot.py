import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


def _uuid_str() -> str:
    return str(uuid.uuid4())


class AICopilotConversation(Base):
    __tablename__ = "ai_conversations"
    __table_args__ = {"extend_existing": True}

    # SQLite-compatible UUID storage: store as canonical string (36 chars)
    id = Column(String(36), primary_key=True, default=_uuid_str)

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    title = Column(String(255), default="New Conversation")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    messages = relationship(
        "app.models.ai_copilot.AICopilotMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="AICopilotMessage.created_at",
        overlaps="conversation,messages",
    )
    files = relationship(
        "app.models.ai_copilot.AICopilotUploadedFile",
        back_populates="conversation",
        cascade="all, delete-orphan",
    )


class AICopilotMessage(Base):
    __tablename__ = "ai_messages"
    __table_args__ = {"extend_existing": True}

    id = Column(String(36), primary_key=True, default=_uuid_str)

    conversation_id = Column(
        String(36),
        ForeignKey("ai_conversations.id", ondelete="CASCADE"),
    )

    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)

    file_name = Column(String(255), nullable=True)
    file_type = Column(String(50), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    conversation = relationship(
        "app.models.ai_copilot.AICopilotConversation",
        back_populates="messages",
        overlaps="conversation,messages",
    )


class AICopilotUploadedFile(Base):
    __tablename__ = "ai_uploaded_files"
    __table_args__ = {"extend_existing": True}

    id = Column(String(36), primary_key=True, default=_uuid_str)

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))

    conversation_id = Column(
        String(36),
        ForeignKey("ai_conversations.id", ondelete="CASCADE"),
    )

    file_name = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False)
    file_size = Column(Integer, nullable=True)
    file_content = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    conversation = relationship(
        "app.models.ai_copilot.AICopilotConversation",
        back_populates="files",
    )


AIConversation = AICopilotConversation
AIMessage = AICopilotMessage
AIUploadedFile = AICopilotUploadedFile

