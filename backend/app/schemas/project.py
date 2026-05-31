from datetime import date, datetime

from pydantic import BaseModel, field_validator, model_validator


class ProjectOwnerResponse(BaseModel):
    id: int
    full_name: str
    email: str
    role: str

    class Config:
        from_attributes = True


class ProjectCreate(BaseModel):
    name: str
    description: str
    priority: str = "medium"
    status: str = "active"
    start_date: date
    end_date: date
    owner_id: int | None = None
    deadline: datetime | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str):
        cleaned_value = value.strip()

        if not cleaned_value:
            raise ValueError("Project title cannot be empty.")

        if len(cleaned_value) < 20:
            raise ValueError("Project title must be at least 20 characters.")

        if len(cleaned_value) > 100:
            raise ValueError("Project title cannot exceed 100 characters.")

        return cleaned_value

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str):
        cleaned_value = value.strip()

        if not cleaned_value:
            raise ValueError("Project description cannot be empty.")

        if len(cleaned_value) < 100:
            raise ValueError("Project description must be at least 100 characters.")

        if len(cleaned_value) > 600:
            raise ValueError("Project description cannot exceed 600 characters.")

        return cleaned_value

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("End date cannot be earlier than start date.")

        return self


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    owner_id: int | None = None
    deadline: datetime | None = None

    @field_validator("name")
    @classmethod
    def validate_optional_name(cls, value: str | None):
        if value is None:
            return value

        cleaned_value = value.strip()

        if not cleaned_value:
            raise ValueError("Project title cannot be empty.")

        if len(cleaned_value) < 20:
            raise ValueError("Project title must be at least 20 characters.")

        if len(cleaned_value) > 100:
            raise ValueError("Project title cannot exceed 100 characters.")

        return cleaned_value

    @field_validator("description")
    @classmethod
    def validate_optional_description(cls, value: str | None):
        if value is None:
            return value

        cleaned_value = value.strip()

        if not cleaned_value:
            raise ValueError("Project description cannot be empty.")

        if len(cleaned_value) < 100:
            raise ValueError("Project description must be at least 100 characters.")

        if len(cleaned_value) > 600:
            raise ValueError("Project description cannot exceed 600 characters.")

        return cleaned_value

    @model_validator(mode="after")
    def validate_optional_dates(self):
        if (
            self.start_date is not None and
            self.end_date is not None and
            self.end_date < self.start_date
        ):
            raise ValueError("End date cannot be earlier than start date.")

        return self


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: str | None
    status: str
    priority: str
    progress: int
    start_date: date | None
    end_date: date | None
    owner_id: int | None
    created_at: datetime | None
    email_sent: bool | None = False
    last_alert_at: datetime | None = None
    alert_level: str | None = "none"
    owner: ProjectOwnerResponse | None = None
    task_count: int = 0
    completed_task_count: int = 0
    is_overdue: bool = False

    class Config:
        from_attributes = True
