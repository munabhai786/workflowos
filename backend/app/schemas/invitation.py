from pydantic import BaseModel, EmailStr


class InvitationCreateSchema(BaseModel):

    email: EmailStr

    role: str

    project_id: int