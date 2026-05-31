from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.automation import AutomationExecution, AutomationRule, WorkflowTrigger
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.user import User
from app.services.activity_service import create_activity
from app.services.automation_service import automation_recommendations, json_loads, process_trigger
from app.services.realtime_service import schedule_global_event, schedule_project_event


router = APIRouter()

MANAGEMENT_ROLES = {"Admin", "Manager"}


class AutomationPayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=180)
    description: str | None = None
    trigger_type: str
    conditions: dict | list | None = None
    actions: list[dict] = Field(default_factory=list)
    scope: str = "personal"
    project_id: int | None = None
    enabled: bool = True


class AutomationTogglePayload(BaseModel):
    enabled: bool


class TriggerPayload(BaseModel):
    trigger_type: str
    context: dict = Field(default_factory=dict)


def require_scope_permission(payload_scope: str, role: str | None):
    if payload_scope in ["organization", "project"] and role not in MANAGEMENT_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")


def can_access_project(db: Session, project_id: int | None, user: User, role: str | None):
    if project_id is None:
        return True
    if role in MANAGEMENT_ROLES:
        return True
    project = db.query(Project).filter(Project.id == project_id).first()
    if project and project.owner_id == user.id:
        return True
    return (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id)
        .filter(ProjectMember.user_id == user.id)
        .first()
        is not None
    )


def scoped_rules(db: Session, user: User, role: str | None):
    query = db.query(AutomationRule).options(
        joinedload(AutomationRule.project),
        joinedload(AutomationRule.owner),
    )
    if role in MANAGEMENT_ROLES:
        return query
    project_ids = [
        project_id for (project_id,) in db.query(ProjectMember.project_id)
        .filter(ProjectMember.user_id == user.id)
        .all()
    ]
    return query.filter(
        or_(
            AutomationRule.owner_id == user.id,
            AutomationRule.project_id.in_(project_ids) if project_ids else AutomationRule.id == -1,
        )
    )


def serialize_project(project: Project | None):
    if not project:
        return None
    return {
        "id": project.id,
        "name": project.name,
        "status": project.status,
    }


def serialize_user(user: User | None):
    if not user:
        return None
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
    }


def serialize_execution(execution: AutomationExecution):
    return {
        "id": execution.id,
        "rule_id": execution.rule_id,
        "trigger_type": execution.trigger_type,
        "status": execution.status,
        "input": json_loads(execution.input_json, {}),
        "output": json_loads(execution.output_json, []),
        "error": execution.error,
        "started_at": execution.started_at,
        "finished_at": execution.finished_at,
        "created_at": execution.created_at,
    }


def serialize_rule(rule: AutomationRule):
    return {
        "id": rule.id,
        "name": rule.name,
        "description": rule.description,
        "trigger_type": rule.trigger_type,
        "conditions": json_loads(rule.conditions_json, {}),
        "actions": json_loads(rule.actions_json, []),
        "scope": rule.scope,
        "project_id": rule.project_id,
        "project": serialize_project(rule.project),
        "owner_id": rule.owner_id,
        "owner": serialize_user(rule.owner),
        "enabled": bool(rule.enabled),
        "run_count": rule.run_count or 0,
        "failure_count": rule.failure_count or 0,
        "last_run_at": rule.last_run_at,
        "next_run_at": rule.next_run_at,
        "created_at": rule.created_at,
        "updated_at": rule.updated_at,
    }


@router.get("/workspace")
def get_automation_workspace(
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    rules = scoped_rules(db, current_user, role).order_by(AutomationRule.created_at.desc()).all()
    rule_ids = [rule.id for rule in rules]
    executions = (
        db.query(AutomationExecution)
        .filter(AutomationExecution.rule_id.in_(rule_ids))
        .order_by(AutomationExecution.created_at.desc())
        .limit(50)
        .all()
        if rule_ids
        else []
    )

    projects_query = db.query(Project)
    if role not in MANAGEMENT_ROLES:
        project_ids = [
            project_id for (project_id,) in db.query(ProjectMember.project_id)
            .filter(ProjectMember.user_id == current_user.id)
            .all()
        ]
        owned_ids = [
            project_id for (project_id,) in db.query(Project.id)
            .filter(Project.owner_id == current_user.id)
            .all()
        ]
        ids = list(set(project_ids + owned_ids))
        projects_query = projects_query.filter(Project.id.in_(ids)) if ids else projects_query.filter(Project.id == -1)

    return {
        "rules": [serialize_rule(rule) for rule in rules],
        "executions": [serialize_execution(execution) for execution in executions],
        "triggers": [
            {
                "id": trigger.id,
                "key": trigger.key,
                "name": trigger.name,
                "description": trigger.description,
                "entity_type": trigger.entity_type,
            }
            for trigger in db.query(WorkflowTrigger).order_by(WorkflowTrigger.name.asc()).all()
        ],
        "projects": [serialize_project(project) for project in projects_query.order_by(Project.name.asc()).all()],
        "recommendations": automation_recommendations(db, current_user),
        "metrics": {
            "enabled": len([rule for rule in rules if rule.enabled]),
            "disabled": len([rule for rule in rules if not rule.enabled]),
            "executions": len(executions),
            "failures": len([execution for execution in executions if execution.status == "failed"]),
        },
    }


@router.post("/rules")
def create_rule(
    payload: AutomationPayload,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    require_scope_permission(payload.scope, role)
    if payload.project_id and not can_access_project(db, payload.project_id, current_user, role):
        raise HTTPException(status_code=403, detail="Permission denied")
    if not payload.actions:
        raise HTTPException(status_code=422, detail="At least one action is required")

    rule = AutomationRule(
        name=payload.name,
        description=payload.description,
        trigger_type=payload.trigger_type,
        conditions_json=json.dumps(payload.conditions or {}),
        actions_json=json.dumps(payload.actions),
        scope=payload.scope,
        project_id=payload.project_id,
        owner_id=current_user.id,
        enabled=payload.enabled,
    )
    db.add(rule)
    db.flush()

    create_activity(
        db=db,
        action_type="automation_created",
        message=f"{current_user.full_name} created automation {rule.name}.",
        user_id=current_user.id,
        project_id=rule.project_id,
        entity_type="automation",
        entity_id=rule.id,
    )
    db.commit()
    db.refresh(rule)

    schedule_project_event(rule.project_id, "automation.created", {"rule_id": rule.id})
    schedule_global_event("automation.created", {"rule_id": rule.id})

    return serialize_rule(rule)


@router.put("/rules/{rule_id}")
def update_rule(
    rule_id: int,
    payload: AutomationPayload,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    rule = scoped_rules(db, current_user, role).filter(AutomationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Automation not found")
    require_scope_permission(payload.scope, role)

    rule.name = payload.name
    rule.description = payload.description
    rule.trigger_type = payload.trigger_type
    rule.conditions_json = json.dumps(payload.conditions or {})
    rule.actions_json = json.dumps(payload.actions)
    rule.scope = payload.scope
    rule.project_id = payload.project_id
    rule.enabled = payload.enabled

    create_activity(
        db=db,
        action_type="automation_updated",
        message=f"{current_user.full_name} updated automation {rule.name}.",
        user_id=current_user.id,
        project_id=rule.project_id,
        entity_type="automation",
        entity_id=rule.id,
    )
    db.commit()
    db.refresh(rule)

    schedule_project_event(rule.project_id, "automation.updated", {"rule_id": rule.id})
    schedule_global_event("automation.updated", {"rule_id": rule.id})

    return serialize_rule(rule)


@router.patch("/rules/{rule_id}/toggle")
def toggle_rule(
    rule_id: int,
    payload: AutomationTogglePayload,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    rule = scoped_rules(db, current_user, role).filter(AutomationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Automation not found")
    rule.enabled = payload.enabled
    db.commit()
    db.refresh(rule)

    schedule_global_event("automation.updated", {"rule_id": rule.id, "enabled": rule.enabled})
    return serialize_rule(rule)


@router.delete("/rules/{rule_id}")
def delete_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    rule = scoped_rules(db, current_user, role).filter(AutomationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Automation not found")
    project_id = rule.project_id
    db.delete(rule)
    db.commit()

    schedule_project_event(project_id, "automation.deleted", {"rule_id": rule_id})
    schedule_global_event("automation.deleted", {"rule_id": rule_id})
    return {"message": "Automation deleted"}


@router.post("/trigger")
def trigger_workflow(
    payload: TriggerPayload,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    if role not in MANAGEMENT_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")
    context = {
        **payload.context,
        "actor_id": current_user.id,
    }
    matched = process_trigger(db, payload.trigger_type, context)
    return {"triggered": matched}
