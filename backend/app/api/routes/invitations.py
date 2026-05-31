from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)

from sqlalchemy.orm import Session

from uuid import uuid4

from app.core.database import get_db
from app.core.deps import get_optional_current_user

from app.models.project import Project

from app.models.user import User

from app.models.project_invitation import (
    ProjectInvitation
)

from app.schemas.invitation import (
    InvitationCreateSchema
)

from app.services.email_service import (
    send_invitation_email
)
from app.services.activity_service import create_activity
from app.services.realtime_service import schedule_project_event


router = APIRouter()


# =========================================
# CREATE INVITATION
# =========================================

@router.post("/create")
def create_invitation(
    data: InvitationCreateSchema,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):

    # CHECK PROJECT

    project = db.query(Project).filter(
        Project.id == data.project_id
    ).first()

    if not project:

        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )


    # CHECK EXISTING INVITATION

    existing_invitation = db.query(
        ProjectInvitation
    ).filter(
        ProjectInvitation.email == data.email,
        ProjectInvitation.project_id == data.project_id,
        ProjectInvitation.status == "pending"
    ).first()


    if existing_invitation:

        raise HTTPException(
            status_code=400,
            detail="Invitation already exists"
        )


    # GENERATE TOKEN

    token = str(uuid4())


    # TEMPORARY INVITER
    # Later replace with authenticated user

    inviter_id = current_user.id if current_user else 1


    # CREATE INVITATION

    invitation = ProjectInvitation(

        email=data.email,

        role=data.role,

        token=token,

        project_id=data.project_id,

        invited_by=inviter_id
    )


    db.add(invitation)

    db.commit()

    db.refresh(invitation)


    # GET INVITER

    inviter = db.query(User).filter(
        User.id == inviter_id
    ).first()

    create_activity(
        db=db,
        action_type="invitation_sent",
        message=f"{inviter.full_name if inviter else 'A teammate'} invited {invitation.email} to {project.name}.",
        user_id=inviter_id,
        project_id=project.id,
        entity_type="invitation",
        entity_id=invitation.id,
    )


    # SEND EMAIL

    try:

        send_invitation_email(

            to_email=invitation.email,

            project_name=project.name,

            inviter_name=inviter.full_name,

            role=invitation.role,

            invitation_token=invitation.token
        )

    except Exception as e:

        print("Invitation Email Error:", e)

    db.commit()
    schedule_project_event(
        project.id,
        "invitation.created",
        {"project_id": project.id, "email": invitation.email},
    )


    return {

        "success": True,

        "message":
            "Invitation created successfully",

        "data": {

            "token": invitation.token,

            "email": invitation.email,

            "role": invitation.role,

            "project_id": invitation.project_id,
        }
    }


# =========================================
# GET ALL INVITATIONS
# =========================================

@router.get("/")
def get_invitations(
    db: Session = Depends(get_db)
):

    invitations = db.query(
        ProjectInvitation
    ).all()


    results = []


    for invitation in invitations:

        results.append({

            "id": invitation.id,

            "email": invitation.email,

            "role": invitation.role,

            "status": invitation.status,

            "project_id": invitation.project_id,

            "created_at": invitation.created_at,
        })


    return {

        "success": True,

        "data": results
    }


# =========================================
# VALIDATE INVITATION TOKEN
# =========================================

@router.get("/validate/{token}")
def validate_invitation(
    token: str,
    db: Session = Depends(get_db)
):

    invitation = db.query(
        ProjectInvitation
    ).filter(
        ProjectInvitation.token == token
    ).first()


    if not invitation:

        raise HTTPException(
            status_code=404,
            detail="Invalid invitation token"
        )


    return {

        "success": True,

        "data": {

            "email": invitation.email,

            "role": invitation.role,

            "project_id": invitation.project_id,

            "status": invitation.status,
        }
    }
