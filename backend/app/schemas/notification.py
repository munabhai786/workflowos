from datetime import datetime

from pydantic import BaseModel


class NotificationCreate(BaseModel):
    title: str
    message: str
    type: str
    severity: str = "low"
    priority: str = "normal"
    entity_type: str | None = None
    entity_id: int | None = None
    metadata: dict | None = None


class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    type: str
    severity: str | None = "low"
    priority: str | None = "normal"
    entity_type: str | None = None
    entity_id: int | None = None
    metadata_json: str | None = None
    is_read: bool
    user_id: int | None
    created_at: datetime

    class Config:
        from_attributes = True
