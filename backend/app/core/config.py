# ```python
from pathlib import Path
import logging
import os

from dotenv import load_dotenv
from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = BACKEND_DIR / ".env"

load_dotenv(ENV_FILE)

DEV_DATABASE_URL = "sqlite:///./workflowos.db"
DEV_SECRET_KEY = "workflowos-local-development-secret-change-me"
DEV_FRONTEND_URL = "http://localhost:5173"


def _env_value_missing(name: str) -> bool:
    value = os.getenv(name)
    return value is None or value.strip() == ""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ==========================
    # APP ENVIRONMENT
    # ==========================
    ENVIRONMENT: str = "development"
    APP_ENV: str | None = None

    DATABASE_URL: str = DEV_DATABASE_URL
    SECRET_KEY: str = DEV_SECRET_KEY

    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    FRONTEND_URL: str = DEV_FRONTEND_URL

    # ==========================
    # AI PROVIDER
    # ==========================
    AI_PROVIDER: str = "anthropic"

    # ==========================
    # AGENTROUTER / CLAUDE
    # ==========================
    ANTHROPIC_API_KEY: str = "sk-w6gRfG7OLxBPkAFAHL2lYAklapdVsKYdPGrAX4VbPDkhtmAm"

    # IMPORTANT: AgentRouter URL
    ANTHROPIC_BASE_URL: str = "https://agentrouter.org/"

    # Use your preferred model
    CLAUDE_MODEL: str = "claude-opus-4-6"

    ANTHROPIC_TIMEOUT_SECONDS: float = 60.0
    ANTHROPIC_MAX_RETRIES: int = 3

    # ==========================
    # OPENAI (OPTIONAL FALLBACK)
    # ==========================
    OPENAI_API_KEY: str | None = None
    OPENAI_CHAT_MODEL: str = "gpt-4o"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"
    OPENAI_TIMEOUT_SECONDS: float = 30.0
    OPENAI_MAX_RETRIES: int = 2

    AI_RAG_MAX_FILE_BYTES: int = 10485760

    # ==========================
    # EMAIL CONFIG
    # ==========================
    SMTP_SERVER: str = ""
    SMTP_PORT: int = 587
    SMTP_EMAIL: str = ""
    SMTP_PASSWORD: str = ""

    SMTP_HOST: str | None = None
    SMTP_USER: str | None = None
    EMAIL_FROM: str | None = None

    EMAIL_ENABLED: bool = True

    # ==========================
    # OAUTH / INTEGRATIONS
    # ==========================
    OAUTH_REDIRECT_BASE_URL: str | None = None

    GITHUB_CLIENT_ID: str | None = None
    GITHUB_CLIENT_SECRET: str | None = None

    SLACK_CLIENT_ID: str | None = None
    SLACK_CLIENT_SECRET: str | None = None

    GOOGLE_CLIENT_ID: str | None = None
    GOOGLE_CLIENT_SECRET: str | None = None

    DISCORD_CLIENT_ID: str | None = None
    DISCORD_CLIENT_SECRET: str | None = None

    MICROSOFT_CLIENT_ID: str | None = None
    MICROSOFT_CLIENT_SECRET: str | None = None

    integrations_enabled: bool = False

    @property
    def smtp_host(self):
        return self.SMTP_HOST or self.SMTP_SERVER

    @property
    def smtp_user(self):
        return self.SMTP_USER or self.SMTP_EMAIL

    @property
    def email_from(self):
        return self.EMAIL_FROM or self.SMTP_EMAIL

    @property
    def environment_name(self) -> str:
        return (
            self.APP_ENV
            or self.ENVIRONMENT
            or "development"
        ).lower()

    @property
    def is_production(self) -> bool:
        return self.environment_name in {
            "production",
            "prod",
        }

    def validate_startup_configuration(self) -> None:
        dev_default_fields = {
            "DATABASE_URL": DEV_DATABASE_URL,
            "SECRET_KEY": DEV_SECRET_KEY,
            "FRONTEND_URL": DEV_FRONTEND_URL,
        }

        missing = [
            name
            for name in dev_default_fields
            if _env_value_missing(name)
        ]

        if self.is_production:
            insecure_defaults = [
                name
                for name, default in dev_default_fields.items()
                if getattr(self, name) == default
            ]

            failures = sorted(
                set(missing + insecure_defaults)
            )

            if failures:
                details = ", ".join(failures)

                raise RuntimeError(
                    "Backend configuration is incomplete "
                    "for production. Missing or insecure "
                    f"values: {details}"
                )

        for name in missing:
            logger.warning(
                "Missing %s in .env/environment; "
                "using development default",
                name,
            )

        logger.info(
            "Backend settings loaded "
            "environment=%s "
            "database=%s "
            "frontend=%s "
            "ai_provider=%s "
            "anthropic_configured=%s "
            "model=%s "
            "openai_configured=%s",
            self.environment_name,
            bool(self.DATABASE_URL),
            self.FRONTEND_URL,
            self.AI_PROVIDER,
            bool(self.ANTHROPIC_API_KEY.strip()),
            self.CLAUDE_MODEL,
            bool(
                self.OPENAI_API_KEY
                and self.OPENAI_API_KEY.strip()
            ),
        )


def load_settings() -> Settings:
    try:
        loaded_settings = Settings()

    except ValidationError as exc:
        missing_fields = [
            str(error["loc"][0])
            for error in exc.errors()
            if error.get("type") == "missing"
            and error.get("loc")
        ]

        if missing_fields:
            for field in missing_fields:
                logger.error(
                    "Missing %s in .env/environment",
                    field,
                )

            raise RuntimeError(
                "Backend configuration incomplete. "
                f"Missing settings: "
                f"{', '.join(missing_fields)}"
            ) from exc

        raise

    loaded_settings.validate_startup_configuration()

    return loaded_settings


settings = load_settings()
