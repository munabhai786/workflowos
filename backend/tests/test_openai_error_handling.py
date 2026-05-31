import os
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")
os.environ.setdefault("SMTP_SERVER", "localhost")
os.environ.setdefault("SMTP_PORT", "1025")
os.environ.setdefault("SMTP_EMAIL", "test@example.com")
os.environ.setdefault("SMTP_PASSWORD", "password")

from app.core.config import settings
from app.services.openai_rag_service import OpenAIRAGService


class AuthenticationError(Exception):
    status_code = 401


class APITimeoutError(Exception):
    status_code = 408


class RateLimitError(Exception):
    status_code = 429


class FakeChatCompletions:
    def __init__(self, exc):
        self.exc = exc

    def create(self, **kwargs):
        raise self.exc


class FakeClient:
    def __init__(self, exc):
        self.chat = SimpleNamespace(completions=FakeChatCompletions(exc))


def test_startup_validation_detects_missing_openai_key(monkeypatch):
    monkeypatch.setattr(settings, "OPENAI_API_KEY", None)
    service = OpenAIRAGService()

    status = service.validate_startup_configuration()

    assert status.available is False
    assert status.error_code == "AI_CONFIGURATION_ERROR"
    assert "missing" in status.internal_message


def test_invalid_openai_key_is_classified_as_configuration_error():
    service = OpenAIRAGService()

    status = service._classify_openai_exception(AuthenticationError("invalid api key"))

    assert status.available is False
    assert status.error_code == "AI_CONFIGURATION_ERROR"
    assert status.retryable is False


def test_openai_timeout_returns_user_safe_fallback(monkeypatch):
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-test")
    service = OpenAIRAGService()
    monkeypatch.setattr(service, "_client", lambda: FakeClient(APITimeoutError("request timed out")))

    answer = service._openai_answer(
        prompt="Summarize this document",
        workspace={"signals": {}, "context_hash": "abc"},
        retrieved=[
            {
                "document_name": "resume.pdf",
                "score": 0.9,
                "content": "Experience Python FastAPI SQL Docker Education Skills Backend Engineer",
            }
        ],
        conversation=SimpleNamespace(memory_summary=""),
        client_memory=[],
        workspace_context={},
    )

    assert answer["agent_key"] == "openai_multimodal_rag"
    assert "OpenAI" not in answer["reasoning"]
    assert "request failed" not in answer["reasoning"]
    assert "Experience Python" in answer["answer"]


def test_rate_limit_is_classified_as_retryable():
    service = OpenAIRAGService()

    status = service._classify_openai_exception(RateLimitError("too many requests"))

    assert status.error_code == "AI_SERVICE_RATE_LIMITED"
    assert status.retryable is True
