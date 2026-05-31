from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel


class AIMessageSchema(BaseModel):
    id: UUID
    role: str
    content: str
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AIConversationSchema(BaseModel):
    id: UUID
    title: str
    created_at: datetime
    updated_at: datetime
    messages: List[AIMessageSchema] = []

    class Config:
        from_attributes = True


class AIConversationCreate(BaseModel):
    title: Optional[str] = "New Conversation"


class AIChatRequest(BaseModel):
    conversation_id: Optional[UUID] = None
    message: str
    file_content: Optional[str] = None
    file_name: Optional[str] = None
    file_type: Optional[str] = None


class AIChatResponse(BaseModel):
    conversation_id: UUID
    message: AIMessageSchema


class AIUploadedFileSchema(BaseModel):
    id: UUID
    file_name: str
    file_type: str
    file_size: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True
