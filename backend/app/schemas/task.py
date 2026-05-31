from pydantic import (
    BaseModel,
    Field,
)

from typing import (
    Optional,
    List,
)

from datetime import (
    datetime,
)


# =========================================
# CREATE TASK
# =========================================

class TaskCreateSchema(BaseModel):

    title: str = Field(
        ...,
        min_length=3,
        max_length=200
    )

    description: Optional[str] = Field(
        default=""
    )

    priority: str = Field(
        default="medium"
    )

    status: str = Field(
        default="todo"
    )

    # OPTIONAL PROJECT

    project_id: Optional[int] = None

    assignee_id: Optional[int] = None

    due_date: Optional[datetime] = None

    labels: Optional[List[str]] = []


# =========================================
# UPDATE TASK
# =========================================

class TaskUpdateSchema(BaseModel):

    title: Optional[str] = Field(
        default=None,
        min_length=3,
        max_length=200
    )

    description: Optional[str] = None

    priority: Optional[str] = None

    status: Optional[str] = None

    project_id: Optional[int] = None

    assignee_id: Optional[int] = None

    due_date: Optional[datetime] = None

    labels: Optional[List[str]] = None


# =========================================
# RESPONSE
# =========================================

class TaskResponseSchema(BaseModel):

    id: int

    title: str

    description: Optional[str]

    priority: str

    status: str

    project_id: Optional[int]

    assignee_id: Optional[int]

    due_date: Optional[datetime]

    labels: Optional[List[str]]

    created_at: datetime

    updated_at: datetime


    class Config:

        from_attributes = True