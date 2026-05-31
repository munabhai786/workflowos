from datetime import datetime

from pydantic import BaseModel


class ActivityUserResponse(BaseModel):
    id: int
    full_name: str
    email: str
    role: str

    class Config:
        from_attributes = True


class ActivityProjectResponse(BaseModel):
    id: int
    name: str
    status: str | None = None

    class Config:
        from_attributes = True


class ActivityTaskResponse(BaseModel):
    id: int
    title: str
    status: str | None = None

    class Config:
        from_attributes = True


class ActivityResponse(BaseModel):
    id: int
    action_type: str
    message: str
    user_id: int | None
    project_id: int | None
    task_id: int | None
    created_at: datetime
    user: ActivityUserResponse | None = None
    project: ActivityProjectResponse | None = None
    task: ActivityTaskResponse | None = None

    class Config:
        from_attributes = True
