from __future__ import annotations

import base64
import hashlib
import json
import logging
import math
import os
import re
import time
import uuid
import zipfile
from dataclasses import dataclass, field
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.agents.context_builder import context_builder
from app.core.config import settings
from app.core.errors import AppError
from app.models.ai_agent import (
    AIConversation,
    AIDocument,
    AIDocumentChunk,
    AIMessage,
    AIRetrievalLog,
)
from app.models.user import User


SUPPORTED_MIME_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "text/plain",
    "text/markdown",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
SUPPORTED_EXTENSIONS = {
    "pdf",
    "png",
    "jpeg",
    "jpg",
    "webp",
    "txt",
    "doc",
    "docx",
    "md",
    "markdown",
}
DOCUMENT_DIR = Path("uploads") / "ai_documents"
MIN_READABLE_TEXT_CHARS = 80
MAX_BINARY_CHAR_RATIO = 0.02
PDF_METADATA_JUNK_PATTERNS = [
    r"\bISO\s+DIS\s+15339-2\b",
    r"\bCGATS21\b",
    r"\bICC\s+profile\b",
    r"\bOutputIntent\b",
    r"\bxref\b",
    r"\btrailer\b",
    r"\bobj\b",
    r"\bendobj\b",
    r"\bstream\b",
    r"\bendstream\b",
]

logger = logging.getLogger(__name__)


@dataclass
class ExtractionResult:
    text: str = ""
    method: str = "none"
    status: str = "failed"
    warnings: list[str] = field(default_factory=list)
    ocr_attempted: bool = False
    ocr_used: bool = False
    extracted_length: int = 0
    readable_length: int = 0
    corruption_score: float = 1.0


@dataclass
class OpenAIStatus:
    available: bool
    error_code: str | None = None
    retryable: bool = False
    internal_message: str | None = None


def _json_default(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _dumps(value):
    return json.dumps(value, default=_json_default)


def _loads(value, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def _decode_text(raw: bytes) -> str:
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return ""


def _clean_text(value: str) -> str:
    value = "".join(
        character
        if character in "\n\t" or (character.isprintable() and character not in "\x00\x0b\x0c")
        else " "
        for character in value or ""
    )
    value = re.sub(r"\r\n?", "\n", value)
    for pattern in PDF_METADATA_JUNK_PATTERNS:
        value = re.sub(pattern, " ", value, flags=re.IGNORECASE)
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r" *\n *", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def _readability_metrics(value: str) -> dict[str, float | int]:
    if not value:
        return {
            "readable_length": 0,
            "alpha_count": 0,
            "word_count": 0,
            "binary_ratio": 1.0,
            "corruption_score": 1.0,
        }

    control_count = sum(
        1 for character in value if not (character in "\n\t\r" or character.isprintable())
    )
    replacement_count = value.count("\ufffd")
    suspicious_count = sum(1 for character in value if ord(character) < 32 and character not in "\n\t\r")
    alpha_count = sum(1 for character in value if character.isalpha())
    words = re.findall(r"[A-Za-z][A-Za-z0-9+#.'/-]{1,}", value)
    binary_ratio = (control_count + replacement_count + suspicious_count) / max(1, len(value))
    low_signal_ratio = 1 - (alpha_count / max(1, len(value)))
    corruption_score = max(binary_ratio, low_signal_ratio if len(words) < 8 else binary_ratio)
    return {
        "readable_length": len(_clean_text(value)),
        "alpha_count": alpha_count,
        "word_count": len(words),
        "binary_ratio": binary_ratio,
        "corruption_score": corruption_score,
    }


def _is_corrupt_text(value: str) -> bool:
    metrics = _readability_metrics(value)
    if metrics["binary_ratio"] > MAX_BINARY_CHAR_RATIO:
        return True
    if metrics["word_count"] < 8 and metrics["readable_length"] < MIN_READABLE_TEXT_CHARS:
        return True
    if metrics["alpha_count"] < max(20, int(metrics["readable_length"] * 0.25)):
        return True
    return False


def _is_valid_extracted_text(value: str, minimum_chars: int = MIN_READABLE_TEXT_CHARS) -> bool:
    cleaned = _clean_text(value)
    metrics = _readability_metrics(cleaned)
    return (
        metrics["readable_length"] >= minimum_chars
        and metrics["word_count"] >= 8
        and metrics["binary_ratio"] <= MAX_BINARY_CHAR_RATIO
        and not _is_corrupt_text(cleaned)
    )


def _failure_summary(filename: str, reason: str | None = None) -> str:
    detail = f" {reason}" if reason else ""
    return (
        f"Text extraction failed for {filename}.{detail} "
        "No document summary is available until the PDF is re-uploaded with selectable text or OCR succeeds."
    )


def _extraction_confidence(extraction: ExtractionResult | None, text: str) -> float:
    if not extraction or extraction.status != "text_extracted" or not text:
        return 0.0
    length_score = min(1.0, extraction.readable_length / 1200)
    corruption_penalty = min(0.8, max(0.0, extraction.corruption_score))
    method_score = {
        "pymupdf": 0.95,
        "pdfplumber": 0.88,
        "ocr_pytesseract": 0.72,
        "text_decode": 0.92,
        "docx_xml": 0.92,
    }.get(extraction.method, 0.65)
    return round(max(0.0, min(0.99, method_score * length_score * (1 - corruption_penalty))), 2)


def _extract_docx_text(raw: bytes) -> str:
    try:
        with zipfile.ZipFile(BytesIO(raw)) as archive:
            xml = archive.read("word/document.xml").decode("utf-8", errors="ignore")
    except Exception:
        return ""

    xml = re.sub(r"</w:p>", "\n", xml)
    text = re.sub(r"<[^>]+>", " ", xml)
    return _clean_text(text)


def _validated_result(
    text: str,
    method: str,
    warnings: list[str] | None = None,
    ocr_attempted: bool = False,
    ocr_used: bool = False,
) -> ExtractionResult:
    cleaned = _clean_text(text)
    metrics = _readability_metrics(cleaned)
    warnings = list(warnings or [])
    status = "text_extracted"
    if not _is_valid_extracted_text(cleaned):
        status = "failed"
        warnings.append("extracted_text_failed_readability_validation")
    return ExtractionResult(
        text=cleaned if status == "text_extracted" else "",
        method=method,
        status=status,
        warnings=warnings,
        ocr_attempted=ocr_attempted,
        ocr_used=ocr_used,
        extracted_length=len(cleaned),
        readable_length=int(metrics["readable_length"]),
        corruption_score=float(metrics["corruption_score"]),
    )


def _extract_pdf_text_with_pymupdf(raw: bytes) -> str:
    import fitz

    pages = []
    with fitz.open(stream=raw, filetype="pdf") as document:
        for index, page in enumerate(document):
            page_text = page.get_text("text") or ""
            if page_text.strip():
                pages.append(f"Page {index + 1}\n{page_text}")
    return "\n\n".join(pages)


def _extract_pdf_text_with_pdfplumber(raw: bytes) -> str:
    import pdfplumber

    pages = []
    with pdfplumber.open(BytesIO(raw)) as document:
        for index, page in enumerate(document.pages):
            page_text = page.extract_text() or ""
            if page_text.strip():
                pages.append(f"Page {index + 1}\n{page_text}")
    return "\n\n".join(pages)


def _ocr_pdf_with_pymupdf(raw: bytes) -> str:
    import fitz
    import pytesseract
    from PIL import Image

    pages = []
    with fitz.open(stream=raw, filetype="pdf") as document:
        for index, page in enumerate(document):
            matrix = fitz.Matrix(2, 2)
            pixmap = page.get_pixmap(matrix=matrix, alpha=False)
            if getattr(pixmap, "n", 3) != 3:
                pixmap = fitz.Pixmap(fitz.csRGB, pixmap)
            image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
            page_text = pytesseract.image_to_string(image) or ""
            if page_text.strip():
                pages.append(f"Page {index + 1}\n{page_text}")
    return "\n\n".join(pages)


def _extract_pdf_text(raw: bytes) -> ExtractionResult:
    warnings: list[str] = []

    try:
        result = _validated_result(_extract_pdf_text_with_pymupdf(raw), "pymupdf")
        if result.status == "text_extracted":
            return result
        warnings.extend(result.warnings)
        warnings.append("pymupdf_output_unreadable_or_empty")
    except Exception as exc:
        logger.warning("PDF extraction with PyMuPDF failed: %s", exc)
        warnings.append(f"pymupdf_failed:{exc.__class__.__name__}")

    try:
        result = _validated_result(_extract_pdf_text_with_pdfplumber(raw), "pdfplumber", warnings)
        if result.status == "text_extracted":
            return result
        warnings = result.warnings
        warnings.append("pdfplumber_output_unreadable_or_empty")
    except Exception as exc:
        logger.warning("PDF extraction with pdfplumber failed: %s", exc)
        warnings.append(f"pdfplumber_failed:{exc.__class__.__name__}")

    try:
        logger.info("Activating OCR fallback for PDF extraction.")
        result = _validated_result(
            _ocr_pdf_with_pymupdf(raw),
            "ocr_pytesseract",
            warnings,
            ocr_attempted=True,
            ocr_used=True,
        )
        if result.status == "text_extracted":
            return result
        result.ocr_attempted = True
        return result
    except Exception as exc:
        logger.warning("PDF OCR fallback failed: %s", exc)
        warnings.append(f"ocr_failed:{exc.__class__.__name__}")
        return ExtractionResult(
            method="failed",
            status="failed",
            warnings=warnings,
            ocr_attempted=True,
            ocr_used=False,
            extracted_length=0,
            readable_length=0,
            corruption_score=1.0,
        )


def _kind(content_type: str, filename: str) -> str:
    suffix = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if content_type.startswith("image/") or suffix in {"png", "jpeg", "jpg", "webp"}:
        return "image"
    if content_type == "application/pdf" or suffix == "pdf":
        return "pdf"
    if suffix in {"doc", "docx"}:
        return "document"
    if suffix in {"md", "markdown"}:
        return "markdown"
    return "text"


def _chunk_text(text: str, size: int = 1400, overlap: int = 180) -> list[str]:
    text = _clean_text(text)
    if not text or not _is_valid_extracted_text(text):
        return []

    paragraphs = [item.strip() for item in text.split("\n\n") if item.strip()]
    chunks = []
    current = ""

    for paragraph in paragraphs:
        if len(current) + len(paragraph) + 2 <= size:
            current = f"{current}\n\n{paragraph}".strip()
            continue
        if current:
            chunks.append(current)
        current = paragraph

    if current:
        chunks.append(current)

    expanded = []
    for chunk in chunks:
        if len(chunk) <= size:
            if _is_valid_extracted_text(chunk, minimum_chars=30):
                expanded.append(chunk)
            continue
        start = 0
        while start < len(chunk):
            piece = chunk[start : start + size]
            if _is_valid_extracted_text(piece, minimum_chars=30):
                expanded.append(piece)
            start += max(1, size - overlap)
    return expanded[:80]


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    left = math.sqrt(sum(x * x for x in a))
    right = math.sqrt(sum(y * y for y in b))
    if not left or not right:
        return 0.0
    return dot / (left * right)


def _fallback_embedding(text: str, dimensions: int = 256) -> list[float]:
    vector = [0.0] * dimensions
    words = re.findall(r"[a-zA-Z0-9_+#.-]+", text.lower())
    for word in words:
        digest = hashlib.sha256(word.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dimensions
        vector[index] += 1.0
    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / norm for value in vector]


class OpenAIRAGService:
    def __init__(self):
        self.chat_model = settings.OPENAI_CHAT_MODEL
        self.embedding_model = settings.OPENAI_EMBEDDING_MODEL
        self.timeout_seconds = settings.OPENAI_TIMEOUT_SECONDS
        self.max_retries = settings.OPENAI_MAX_RETRIES
        self.provider = (getattr(settings, "AI_PROVIDER", "openai") or "openai").lower()


    def _client(self):
        if not settings.OPENAI_API_KEY:
            return None
        try:
            from openai import OpenAI

            return OpenAI(
                api_key=settings.OPENAI_API_KEY.strip(),
                timeout=self.timeout_seconds,
                max_retries=self.max_retries,
            )
        except Exception as exc:
            logger.exception("OpenAI client initialization failed: %s", exc)
            return None

    def validate_startup_configuration(self) -> OpenAIStatus:
        # Provider-aware validation.
        if self.provider != "openai":
            logger.info(
                "AI provider '%s' selected; skipping OpenAI validation.",
                self.provider,
            )
            # No OpenAI available/required in non-openai modes.
            return OpenAIStatus(available=False, error_code="AI_PROVIDER_NOT_OPENAI", retryable=False)

        key_exists = bool(settings.OPENAI_API_KEY and settings.OPENAI_API_KEY.strip())

        if not key_exists:
            logger.warning(
                "OpenAI provider selected but OPENAI_API_KEY is missing; using safe fallback responses.")
            return OpenAIStatus(
                available=False,
                error_code="AI_CONFIGURATION_ERROR",
                retryable=False,
                internal_message="OPENAI_API_KEY missing",
            )

        logger.info(
            "OpenAI provider configured chat_model=%s embedding_model=%s key_exists=%s timeout=%s max_retries=%s",
            self.chat_model,
            self.embedding_model,
            key_exists,
            self.timeout_seconds,
            self.max_retries,
        )
        return OpenAIStatus(available=True)


    def _classify_openai_exception(self, exc: Exception) -> OpenAIStatus:
        name = exc.__class__.__name__
        status_code = getattr(exc, "status_code", None)
        code = getattr(exc, "code", None)
        message = f"{name}: {exc}"

        if name in {"AuthenticationError"} or status_code == 401:
            return OpenAIStatus(False, "AI_CONFIGURATION_ERROR", False, message)
        if name in {"PermissionDeniedError", "NotFoundError"} or status_code in {403, 404}:
            return OpenAIStatus(False, "AI_CONFIGURATION_ERROR", False, message)
        if name in {"BadRequestError", "UnprocessableEntityError"} or status_code in {400, 422}:
            invalid_model = "model" in str(exc).lower() or code == "model_not_found"
            return OpenAIStatus(False, "AI_CONFIGURATION_ERROR" if invalid_model else "AI_SERVICE_UNAVAILABLE", False, message)
        if name in {"RateLimitError"} or status_code == 429:
            return OpenAIStatus(False, "AI_SERVICE_RATE_LIMITED", True, message)
        if name in {"APITimeoutError", "TimeoutError"} or status_code == 408:
            return OpenAIStatus(False, "AI_SERVICE_TIMEOUT", True, message)
        if name in {"APIConnectionError", "InternalServerError"} or status_code in {500, 502, 503, 504}:
            return OpenAIStatus(False, "AI_SERVICE_UNAVAILABLE", True, message)
        return OpenAIStatus(False, "AI_SERVICE_UNAVAILABLE", True, message)

    def _log_openai_success(self, operation: str, model: str, started_at: float, response: Any):
        usage = getattr(response, "usage", None)
        logger.info(
            "OpenAI request succeeded operation=%s model=%s latency_ms=%s usage=%s",
            operation,
            model,
            round((time.perf_counter() - started_at) * 1000),
            usage.model_dump() if hasattr(usage, "model_dump") else usage,
        )

    def _log_openai_failure(self, operation: str, model: str, started_at: float, exc: Exception, status: OpenAIStatus):
        logger.error(
            "OpenAI request failed operation=%s model=%s latency_ms=%s error_code=%s retryable=%s internal=%s",
            operation,
            model,
            round((time.perf_counter() - started_at) * 1000),
            status.error_code,
            status.retryable,
            status.internal_message or str(exc),
        )

    def embed(self, text: str) -> list[float]:
        client = self._client()
        if not client:
            logger.warning("Using local fallback embedding because OpenAI client is unavailable.")
            return _fallback_embedding(text)

        started_at = time.perf_counter()
        try:
            response = client.embeddings.create(
                model=self.embedding_model,
                input=text[:12000],
            )
            self._log_openai_success("embedding", self.embedding_model, started_at, response)
            return response.data[0].embedding
        except Exception as exc:
            status = self._classify_openai_exception(exc)
            self._log_openai_failure("embedding", self.embedding_model, started_at, exc, status)
            return _fallback_embedding(text)

    async def ingest_document(
        self,
        db: Session,
        file: UploadFile,
        current_user: User,
        project_id: int | None = None,
    ) -> AIDocument:
        content_type = file.content_type or "application/octet-stream"
        original_filename = file.filename or "Untitled file"
        suffix = original_filename.lower().rsplit(".", 1)[-1] if "." in original_filename else ""

        if content_type not in SUPPORTED_MIME_TYPES and suffix not in SUPPORTED_EXTENSIONS:
            raise AppError("UNSUPPORTED_FILE_TYPE", internal_message=f"Unsupported AI document type: {content_type} {suffix}")

        raw = await file.read()
        if len(raw) > settings.AI_RAG_MAX_FILE_BYTES:
            raise AppError("FILE_TOO_LARGE", internal_message=f"AI document exceeded max bytes: {len(raw)}")

        DOCUMENT_DIR.mkdir(parents=True, exist_ok=True)
        stored_name = f"{uuid.uuid4().hex}_{original_filename}"
        storage_path = DOCUMENT_DIR / stored_name
        storage_path.write_bytes(raw)

        kind = _kind(content_type, original_filename)
        extraction = self.extract_text_result(raw, content_type, original_filename, kind)
        extracted_text = extraction.text
        metadata = self.inspect_document(raw, content_type, original_filename, kind, extracted_text, extraction)
        logger.info(
            "AI document extraction completed filename=%s kind=%s method=%s status=%s length=%s readable=%s ocr_attempted=%s warnings=%s",
            original_filename,
            kind,
            extraction.method,
            extraction.status,
            extraction.extracted_length,
            extraction.readable_length,
            extraction.ocr_attempted,
            extraction.warnings,
        )

        document = AIDocument(
            filename=stored_name,
            original_filename=original_filename,
            mime_type=content_type,
            file_size=len(raw),
            kind=kind,
            storage_path=str(storage_path),
            extraction_status=extraction.status if kind != "image" else "visual_ready",
            extracted_text=extracted_text[:50000] if extracted_text else None,
            summary=metadata.get("summary"),
            metadata_json=_dumps(metadata),
            project_id=project_id,
            user_id=current_user.id,
        )
        db.add(document)
        db.flush()

        chunks = _chunk_text(extracted_text)
        if not chunks and kind == "image":
            visual_summary = self.analyze_image(raw, content_type, original_filename)
            chunks = [visual_summary]
            document.summary = visual_summary[:2000]
            document.extracted_text = visual_summary
            document.extraction_status = "vision_analyzed" if settings.OPENAI_API_KEY else "visual_metadata_ready"

        for index, chunk in enumerate(chunks):
            if not _is_valid_extracted_text(chunk, minimum_chars=30):
                logger.warning(
                    "Skipping unreadable AI document chunk filename=%s index=%s method=%s",
                    original_filename,
                    index,
                    extraction.method,
                )
                continue
            embedding = self.embed(chunk)
            db.add(
                AIDocumentChunk(
                    document_id=document.id,
                    chunk_index=index,
                    content=chunk,
                    embedding_json=_dumps(embedding),
                    token_estimate=max(1, len(chunk) // 4),
                    metadata_json=_dumps({"source": original_filename, "kind": kind}),
                    project_id=project_id,
                    user_id=current_user.id,
                )
            )

        db.commit()
        db.refresh(document)
        return document

    def extract_text(self, raw: bytes, content_type: str, filename: str, kind: str) -> str:
        return self.extract_text_result(raw, content_type, filename, kind).text

    def extract_text_result(self, raw: bytes, content_type: str, filename: str, kind: str) -> ExtractionResult:
        suffix = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
        if kind in {"text", "markdown"}:
            return _validated_result(_decode_text(raw), "text_decode")
        if kind == "document" and suffix == "docx":
            return _validated_result(_extract_docx_text(raw), "docx_xml")
        if kind == "pdf":
            return _extract_pdf_text(raw)
        return ExtractionResult(status="visual_ready" if kind == "image" else "failed", method="none")

    def inspect_document(
        self,
        raw: bytes,
        content_type: str,
        filename: str,
        kind: str,
        text: str,
        extraction: ExtractionResult | None = None,
    ) -> dict[str, Any]:
        lowered = text.lower()
        doc_type = "image" if kind == "image" else "document"
        if any(term in lowered for term in ["experience", "education", "skills", "resume", "cv", "linkedin"]):
            doc_type = "resume"
        elif any(term in lowered for term in ["requirements", "prd", "user story", "acceptance criteria"]):
            doc_type = "product_requirements"
        elif any(term in lowered for term in ["architecture", "api", "database", "service", "endpoint"]):
            doc_type = "technical_specification"

        headings = []
        for line in text.splitlines():
            clean = line.strip()
            if 3 <= len(clean) <= 90 and (clean.isupper() or clean.endswith(":") or re.match(r"^\d+[\).\s]", clean)):
                headings.append(clean.rstrip(":"))

        summary = self.local_summary(filename, doc_type, text, kind, extraction)
        return {
            "document_type": doc_type,
            "kind": kind,
            "mime_type": content_type,
            "headings": headings[:20],
            "character_count": len(text),
            "extraction_method": extraction.method if extraction else "unknown",
            "extraction_status": extraction.status if extraction else ("text_extracted" if text else "failed"),
            "extraction_warnings": extraction.warnings if extraction else [],
            "ocr_attempted": extraction.ocr_attempted if extraction else False,
            "ocr_used": extraction.ocr_used if extraction else False,
            "readable_character_count": extraction.readable_length if extraction else len(text),
            "corruption_score": extraction.corruption_score if extraction else 0.0,
            "extraction_confidence": _extraction_confidence(extraction, text),
            "summary": summary,
            "sha256": hashlib.sha256(raw).hexdigest(),
        }

    def local_summary(
        self,
        filename: str,
        doc_type: str,
        text: str,
        kind: str,
        extraction: ExtractionResult | None = None,
    ) -> str:
        if kind == "image":
            return f"{filename} is an image artifact ready for visual analysis and execution planning."
        if not text or (extraction and extraction.status == "failed"):
            return _failure_summary(filename)
        if doc_type == "resume":
            skills = re.findall(r"\b(React|Python|JavaScript|TypeScript|Node|FastAPI|SQL|AWS|Azure|AI|ML|Docker|Kubernetes|Django|Flask|PostgreSQL|MongoDB)\b", text, re.I)
            unique = sorted({skill for skill in skills}, key=str.lower)
            return f"Extracted text contains resume/CV signals. Detected skill signals: {', '.join(unique[:12]) or 'skills not clearly extracted'}."
        if doc_type == "product_requirements":
            return "Extracted text contains requirements-document signals: scope, milestones, acceptance criteria, risks, or sprint-ready tasks."
        if doc_type == "technical_specification":
            return "Extracted text contains technical-specification signals: APIs, dependencies, implementation phases, risks, or validation tasks."
        return f"Document text was parsed for AI retrieval with {len(text)} validated extracted characters."

    def analyze_image(self, raw: bytes, content_type: str, filename: str) -> str:
        client = self._client()
        if not client:
            return (
                "I couldn't analyze this image right now. Please try again after AI analysis is available."
            )

        data_url = f"data:{content_type};base64,{base64.b64encode(raw).decode('ascii')}"
        started_at = time.perf_counter()
        try:
            response = client.chat.completions.create(
                model=self.chat_model,
                messages=[
                    {
                        "role": "system",
                        "content": "Analyze images for an AI-native project execution workspace. Be specific, operational, and concise.",
                    },
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Analyze this image. Identify what it is, key details, risks, implementation tasks, and UX or architecture implications."},
                            {"type": "image_url", "image_url": {"url": data_url}},
                        ],
                    },
                ],
                temperature=0.2,
            )
            self._log_openai_success("vision_chat", self.chat_model, started_at, response)
            return response.choices[0].message.content or ""
        except Exception as exc:
            status = self._classify_openai_exception(exc)
            self._log_openai_failure("vision_chat", self.chat_model, started_at, exc, status)
            return (
                "I couldn't analyze this image right now. Please try again."
            )

    def retrieve(
        self,
        db: Session,
        query: str,
        current_user: User | None,
        project_id: int | None = None,
        document_ids: list[int] | None = None,
        limit: int = 8,
    ) -> list[dict[str, Any]]:
        query_embedding = self.embed(query)
        chunk_query = db.query(AIDocumentChunk).join(AIDocument)

        if project_id is not None:
            chunk_query = chunk_query.filter(
                (AIDocumentChunk.project_id == project_id) | (AIDocumentChunk.project_id.is_(None))
            )
        if current_user is not None:
            chunk_query = chunk_query.filter(
                (AIDocumentChunk.user_id == current_user.id) | (AIDocumentChunk.project_id.isnot(None))
            )
        if document_ids:
            chunk_query = chunk_query.filter(AIDocumentChunk.document_id.in_(document_ids))

        scored = []
        for chunk in chunk_query.order_by(AIDocumentChunk.created_at.desc()).limit(500).all():
            if not chunk.content or not _is_valid_extracted_text(chunk.content, minimum_chars=30):
                logger.warning(
                    "Skipping unreadable persisted retrieval chunk chunk_id=%s document_id=%s",
                    chunk.id,
                    chunk.document_id,
                )
                continue
            if chunk.document and chunk.document.extraction_status in {"failed", "metadata_only"}:
                continue
            embedding = _loads(chunk.embedding_json, [])
            score = _cosine(query_embedding, embedding)
            scored.append((score, chunk))

        results = []
        for score, chunk in sorted(scored, key=lambda item: item[0], reverse=True)[:limit]:
            results.append(
                {
                    "score": round(score, 4),
                    "chunk_id": chunk.id,
                    "document_id": chunk.document_id,
                    "document_name": chunk.document.original_filename if chunk.document else "Document",
                    "content": chunk.content,
                    "metadata": _loads(chunk.metadata_json, {}),
                }
            )
        return results

    def answer(
        self,
        db: Session,
        prompt: str,
        current_user: User | None,
        role: str | None,
        project_id: int | None = None,
        conversation_id: int | None = None,
        document_ids: list[int] | None = None,
        client_memory: list[dict] | None = None,
        workspace_context: dict | None = None,
    ) -> dict[str, Any]:
        conversation = self._conversation(db, current_user, project_id, conversation_id, prompt)
        retrieved = self.retrieve(db, prompt, current_user, project_id, document_ids)
        workspace = context_builder.build(db, current_user, role, project_id, persist_snapshot=False)
        extraction_failures = self._selected_document_failures(db, document_ids, current_user, project_id)
        if extraction_failures and not retrieved:
            answer = self._extraction_failed_answer(prompt, workspace, extraction_failures)
        else:
            answer = self._openai_answer(prompt, workspace, retrieved, conversation, client_memory or [], workspace_context or {})

        assistant_content = answer["answer"]
        db.add(AIMessage(conversation_id=conversation.id, role="user", content=prompt, metadata_json=_dumps({"document_ids": document_ids or []})))
        db.add(AIMessage(conversation_id=conversation.id, role="assistant", content=assistant_content, metadata_json=_dumps(answer)))
        db.add(
            AIRetrievalLog(
                conversation_id=conversation.id,
                prompt=prompt,
                retrieved_json=_dumps(retrieved),
                project_id=project_id,
                user_id=current_user.id if current_user else None,
            )
        )
        conversation.updated_at = datetime.utcnow()
        conversation.memory_summary = self._memory_summary(conversation, prompt, assistant_content)
        db.commit()

        answer["conversation_id"] = conversation.id
        answer["citations"] = [
            {
                "document_id": item["document_id"],
                "chunk_id": item["chunk_id"],
                "document_name": item["document_name"],
                "score": item["score"],
                "excerpt": item["content"][:320],
            }
            for item in retrieved[:5]
        ]
        answer["retrieval_count"] = len(retrieved)
        answer["success"] = True
        return answer

    def _selected_document_failures(
        self,
        db: Session,
        document_ids: list[int] | None,
        current_user: User | None,
        project_id: int | None,
    ) -> list[AIDocument]:
        if not document_ids:
            return []
        query = db.query(AIDocument).filter(AIDocument.id.in_(document_ids))
        if current_user is not None:
            query = query.filter(
                (AIDocument.user_id == current_user.id) | (AIDocument.project_id.isnot(None))
            )
        if project_id is not None:
            query = query.filter((AIDocument.project_id == project_id) | (AIDocument.project_id.is_(None)))
        documents = query.all()
        return [
            document
            for document in documents
            if document.extraction_status in {"failed", "metadata_only"} or not (document.extracted_text or "").strip()
        ]

    def _extraction_failed_answer(
        self,
        prompt: str,
        workspace: dict,
        documents: list[AIDocument],
    ) -> dict[str, Any]:
        names = ", ".join(document.original_filename for document in documents[:5])
        return {
            "agent_key": "openai_multimodal_rag",
            "success": False,
            "error_code": "DOCUMENT_EXTRACTION_FAILED",
            "answer": (
                f"I could not summarize {names} because readable text extraction failed. "
                "No reliable document chunks are available, so I will not infer content from the filename or file type. "
                "Please re-upload a PDF with selectable text, or install/enable OCR support and upload the file again."
            ),
            "suggested_actions": ["Re-upload selectable PDF", "Enable OCR", "Try a DOCX or text export"],
            "evidence": [],
            "confidence": 0.2,
            "reasoning": "The selected document has no validated human-readable extraction, so the copilot refused to summarize unavailable content.",
            "context_hash": workspace.get("context_hash"),
            "generated_at": datetime.utcnow(),
        }

    def _conversation(
        self,
        db: Session,
        current_user: User | None,
        project_id: int | None,
        conversation_id: int | None,
        prompt: str,
    ) -> AIConversation:
        if conversation_id:
            query = db.query(AIConversation).filter(AIConversation.id == conversation_id)
            if current_user:
                query = query.filter(AIConversation.user_id == current_user.id)
            conversation = query.first()
            if conversation:
                return conversation

        conversation = AIConversation(
            title=prompt[:80],
            project_id=project_id,
            user_id=current_user.id if current_user else None,
        )
        db.add(conversation)
        db.flush()
        return conversation

    def _memory_summary(self, conversation: AIConversation, prompt: str, answer: str) -> str:
        previous = conversation.memory_summary or ""
        addition = f"User asked: {prompt[:240]} Assistant answered: {answer[:360]}"
        return f"{previous}\n{addition}".strip()[-3000:]

    def _openai_answer(
        self,
        prompt: str,
        workspace: dict,
        retrieved: list[dict[str, Any]],
        conversation: AIConversation,
        client_memory: list[dict],
        workspace_context: dict,
    ) -> dict[str, Any]:
        client = self._client()
        if not client:
            logger.warning("OpenAI chat client unavailable; using safe retrieval/workspace fallback.")
            return self._fallback_answer(prompt, workspace, retrieved, conversation, client_memory, workspace_context)

        context_blocks = "\n\n".join(
            f"[{index + 1}] {item['document_name']} (score {item['score']}):\n{item['content'][:1800]}"
            for index, item in enumerate(retrieved[:8])
        )
        workspace_brief = {
            "signals": workspace.get("signals", {}),
            "projects": workspace.get("projects", [])[:8],
            "tasks": workspace.get("tasks", [])[:30],
            "sprints": workspace.get("sprints", [])[:10],
            "client_workspace_context": workspace_context,
        }
        memory = [
            {"role": item.get("role", "user"), "content": str(item.get("content", ""))[:1200]}
            for item in client_memory[-8:]
            if item.get("content")
        ]

        system = (
            "You are the OpenAI-powered Multimodal RAG Copilot for an AI-native project execution workspace. "
            "Answer with grounded, operational guidance. Use retrieved document chunks and workspace context. "
            "If the file appears to be a resume, identify career domain, skills, seniority signals, and structure. "
            "If it is a PRD/spec/image analysis, convert it into execution risks, tasks, sprint plans, APIs, and decisions. "
            "Never infer document content from filenames, MIME types, or weak metadata. "
            "Never pretend to inspect unavailable content. Cite sources by document name and chunk number when used."
        )
        user = (
            f"User question:\n{prompt}\n\n"
            f"Conversation memory summary:\n{conversation.memory_summary or 'No persisted memory yet.'}\n\n"
            f"Retrieved context:\n{context_blocks or 'No retrieved document chunks.'}\n\n"
            f"Workspace context JSON:\n{json.dumps(workspace_brief, default=_json_default)[:12000]}\n\n"
            "Return a concise but useful answer with: direct answer, evidence, recommended actions, and caveats."
        )

        started_at = time.perf_counter()
        try:
            response = client.chat.completions.create(
                model=self.chat_model,
                messages=[
                    {"role": "system", "content": system},
                    *memory,
                    {"role": "user", "content": user},
                ],
                temperature=0.2,
            )
            self._log_openai_success("rag_chat", self.chat_model, started_at, response)
            content = response.choices[0].message.content or ""
            return {
                "agent_key": "openai_multimodal_rag",
                "answer": content,
                "suggested_actions": self._suggested_actions(prompt, retrieved),
                "evidence": retrieved[:5],
                "confidence": 0.88 if retrieved else 0.72,
                "reasoning": "Generated from validated retrieved document text, workspace context, and recent conversation memory.",
                "context_hash": workspace.get("context_hash"),
                "generated_at": datetime.utcnow(),
            }
        except Exception as exc:
            status = self._classify_openai_exception(exc)
            self._log_openai_failure("rag_chat", self.chat_model, started_at, exc, status)
            return self._fallback_answer(prompt, workspace, retrieved, conversation, client_memory, workspace_context)

    def _fallback_answer(
        self,
        prompt: str,
        workspace: dict,
        retrieved: list[dict[str, Any]],
        conversation: AIConversation,
        client_memory: list[dict],
        workspace_context: dict,
    ) -> dict[str, Any]:
        if retrieved:
            top = retrieved[0]
            doc_names = ", ".join({item["document_name"] for item in retrieved[:5]})
            text = " ".join(item["content"] for item in retrieved[:3]).lower()
            if any(term in text for term in ["experience", "education", "skills", "resume", "cv"]):
                answer = (
                    f"I found readable resume-related context in {doc_names}. Strongest extracted section: "
                    f"{top['content'][:900]} "
                    "Any summary should be limited to these extracted chunks and cited evidence."
                )
            else:
                answer = (
                    f"I found relevant document context in {doc_names}. The strongest match is: {top['content'][:700]} "
                    "Use these retrieved sections to build tasks, risks, milestones, or a sprint plan."
                )
        else:
            signals = workspace.get("signals", {})
            answer = (
                f"No document chunks matched strongly. Workspace context shows {signals.get('total_projects', 0)} project(s), "
                f"{signals.get('total_tasks', 0)} task(s), and {signals.get('total_attachments', 0)} attachment(s). "
                "Ask about blockers, sprint plans, task generation, or upload a text-extractable file for deeper retrieval."
            )

        return {
            "agent_key": "openai_multimodal_rag",
            "answer": answer,
            "suggested_actions": self._suggested_actions(prompt, retrieved),
            "evidence": retrieved[:5],
            "confidence": 0.68 if retrieved else 0.48,
            "reasoning": "Answer used validated retrieval and workspace context available to the copilot.",
            "context_hash": workspace.get("context_hash"),
            "generated_at": datetime.utcnow(),
        }

    def _suggested_actions(self, prompt: str, retrieved: list[dict[str, Any]]) -> list[str]:
        normalized = prompt.lower()
        if "resume" in normalized or any("resume" in item["content"].lower() for item in retrieved[:3]):
            return ["Extract skills", "Assess role fit", "Summarize experience level"]
        if "sprint" in normalized or "plan" in normalized:
            return ["Create sprint backlog", "Identify dependencies", "Estimate delivery risk"]
        if "task" in normalized or "prd" in normalized or "spec" in normalized:
            return ["Generate tasks", "Create QA checklist", "Find missing requirements"]
        if "image" in normalized or "ui" in normalized or "architecture" in normalized:
            return ["Review implementation risks", "Generate frontend tasks", "List backend APIs"]
        return ["Summarize sources", "Identify risks", "Recommend next actions"]

    def serialize_document(self, document: AIDocument) -> dict[str, Any]:
        return {
            "id": document.id,
            "name": document.original_filename,
            "filename": document.filename,
            "kind": document.kind,
            "mime_type": document.mime_type,
            "size": document.file_size,
            "extraction_status": document.extraction_status,
            "summary": document.summary,
            "metadata": _loads(document.metadata_json, {}),
            "project_id": document.project_id,
            "created_at": document.created_at,
            "chunk_count": len(document.chunks or []),
        }


openai_rag_service = OpenAIRAGService()
