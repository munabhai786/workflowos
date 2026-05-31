from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class Integration(Base):
    __tablename__ = "integrations"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    status = Column(String, default="disconnected", index=True)
    workspace_id = Column(String, nullable=True, index=True)
    external_account_id = Column(String, nullable=True, index=True)
    scopes_json = Column(Text, nullable=True)
    capabilities_json = Column(Text, nullable=True)
    settings_json = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    secret_ref = Column(String, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    connected_at = Column(DateTime, nullable=True)
    last_sync_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    enabled = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    creator = relationship("User")
    oauth_accounts = relationship(
        "OAuthAccount",
        back_populates="integration",
        cascade="all, delete-orphan",
    )
    webhook_logs = relationship(
        "WebhookLog",
        back_populates="integration",
        cascade="all, delete-orphan",
    )


class OAuthAccount(Base):
    __tablename__ = "oauth_accounts"

    id = Column(Integer, primary_key=True, index=True)
    integration_id = Column(Integer, ForeignKey("integrations.id"), nullable=True, index=True)
    provider = Column(String, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    external_account_id = Column(String, nullable=True, index=True)
    external_account_email = Column(String, nullable=True)
    access_token_encrypted = Column(Text, nullable=True)
    refresh_token_encrypted = Column(Text, nullable=True)
    token_type = Column(String, default="Bearer")
    scopes_json = Column(Text, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    refresh_token_expires_at = Column(DateTime, nullable=True)
    last_refreshed_at = Column(DateTime, nullable=True)
    refresh_error = Column(Text, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    status = Column(String, default="active", index=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    integration = relationship("Integration", back_populates="oauth_accounts")
    user = relationship("User")


class OAuthState(Base):
    __tablename__ = "oauth_states"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String, nullable=False, index=True)
    state = Column(String, nullable=False, unique=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    redirect_uri = Column(String, nullable=False)
    frontend_return_url = Column(String, nullable=False)
    scopes_json = Column(Text, nullable=True)
    code_verifier_encrypted = Column(Text, nullable=True)
    consumed_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class WebhookEndpoint(Base):
    __tablename__ = "webhook_endpoints"

    id = Column(Integer, primary_key=True, index=True)
    integration_id = Column(Integer, ForeignKey("integrations.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    direction = Column(String, default="inbound", index=True)
    target_url = Column(String, nullable=True)
    provider = Column(String, nullable=True, index=True)
    secret_encrypted = Column(Text, nullable=True)
    events_json = Column(Text, nullable=True)
    headers_json = Column(Text, nullable=True)
    enabled = Column(Boolean, default=True, index=True)
    retry_count = Column(Integer, default=3)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class WebhookLog(Base):
    __tablename__ = "webhook_logs"

    id = Column(Integer, primary_key=True, index=True)
    integration_id = Column(Integer, ForeignKey("integrations.id"), nullable=True, index=True)
    endpoint_id = Column(Integer, ForeignKey("webhook_endpoints.id"), nullable=True, index=True)
    provider = Column(String, nullable=True, index=True)
    event_type = Column(String, nullable=False, index=True)
    event_id = Column(String, nullable=True, index=True)
    direction = Column(String, default="inbound", index=True)
    status = Column(String, default="queued", index=True)
    signature_valid = Column(Boolean, default=False)
    attempt_count = Column(Integer, default=0)
    request_headers_json = Column(Text, nullable=True)
    payload_json = Column(Text, nullable=True)
    response_json = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    received_at = Column(DateTime, default=datetime.utcnow, index=True)
    processed_at = Column(DateTime, nullable=True)
    next_retry_at = Column(DateTime, nullable=True, index=True)

    integration = relationship("Integration", back_populates="webhook_logs")


class APIToken(Base):
    __tablename__ = "api_tokens"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    token_prefix = Column(String, nullable=False, index=True)
    token_hash = Column(String, nullable=False, unique=True, index=True)
    scopes_json = Column(Text, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    workspace_id = Column(String, nullable=True, index=True)
    integration_id = Column(Integer, ForeignKey("integrations.id"), nullable=True, index=True)
    last_used_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True, index=True)
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    owner = relationship("User")


class ExternalEvent(Base):
    __tablename__ = "external_events"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String, nullable=False, index=True)
    event_type = Column(String, nullable=False, index=True)
    external_event_id = Column(String, nullable=True, index=True)
    integration_id = Column(Integer, ForeignKey("integrations.id"), nullable=True, index=True)
    source = Column(String, nullable=True)
    status = Column(String, default="queued", index=True)
    payload_json = Column(Text, nullable=True)
    dedupe_key = Column(String, nullable=True, unique=True, index=True)
    orchestration_result_json = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    received_at = Column(DateTime, default=datetime.utcnow, index=True)
    processed_at = Column(DateTime, nullable=True)


class SyncHistory(Base):
    __tablename__ = "sync_history"

    id = Column(Integer, primary_key=True, index=True)
    integration_id = Column(Integer, ForeignKey("integrations.id"), nullable=False, index=True)
    provider = Column(String, nullable=False, index=True)
    sync_type = Column(String, nullable=False, index=True)
    status = Column(String, default="queued", index=True)
    started_at = Column(DateTime, default=datetime.utcnow, index=True)
    finished_at = Column(DateTime, nullable=True)
    records_read = Column(Integer, default=0)
    records_written = Column(Integer, default=0)
    error = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)


class IntegrationSetting(Base):
    __tablename__ = "integration_settings"

    id = Column(Integer, primary_key=True, index=True)
    integration_id = Column(Integer, ForeignKey("integrations.id"), nullable=False, index=True)
    key = Column(String, nullable=False, index=True)
    value_json = Column(Text, nullable=True)
    encrypted_value = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class OrchestrationEvent(Base):
    __tablename__ = "orchestration_events"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String, nullable=False, index=True)
    trigger = Column(String, nullable=False, index=True)
    external_event_id = Column(Integer, ForeignKey("external_events.id"), nullable=True, index=True)
    integration_id = Column(Integer, ForeignKey("integrations.id"), nullable=True, index=True)
    status = Column(String, default="queued", index=True)
    action = Column(String, nullable=True)
    result_json = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    processed_at = Column(DateTime, nullable=True)
