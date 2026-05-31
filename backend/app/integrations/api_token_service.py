from __future__ import annotations

import json
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.integrations.security import hash_token, new_secret
from app.models.integration import APIToken


ALLOWED_SCOPES = {
    "read:tasks",
    "write:tasks",
    "manage:projects",
    "manage:automations",
    "ai:access",
    "analytics:read",
}


class APITokenService:
    def create_token(
        self,
        db: Session,
        name: str,
        scopes: list[str],
        owner_id: int | None,
        expires_at=None,
        workspace_id: str | None = None,
        integration_id: int | None = None,
    ) -> dict:
        invalid = [scope for scope in scopes if scope not in ALLOWED_SCOPES]
        if invalid:
            raise HTTPException(status_code=422, detail=f"Invalid scopes: {', '.join(invalid)}")
        raw = new_secret("wos")
        token = APIToken(
            name=name,
            token_prefix=raw[:12],
            token_hash=hash_token(raw),
            scopes_json=json.dumps(scopes),
            owner_id=owner_id,
            workspace_id=workspace_id,
            integration_id=integration_id,
            expires_at=expires_at,
        )
        db.add(token)
        db.flush()
        return {"token": raw, "record": token}

    def verify(self, db: Session, raw_token: str, required_scope: str | None = None) -> APIToken | None:
        token = db.query(APIToken).filter(APIToken.token_hash == hash_token(raw_token)).first()
        if not token or token.revoked_at:
            return None
        if token.expires_at and token.expires_at < datetime.utcnow():
            return None
        scopes = set(json.loads(token.scopes_json or "[]"))
        if required_scope and required_scope not in scopes:
            return None
        token.last_used_at = datetime.utcnow()
        db.flush()
        return token

    def revoke(self, db: Session, token: APIToken):
        token.revoked_at = datetime.utcnow()
        db.flush()


api_token_service = APITokenService()
