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

from app.services import openai_rag_service as rag


NORMAL_PDF_TEXT = """
Page 1
Minhas Ali
Senior Backend Engineer
Experience building Python, FastAPI, PostgreSQL, and AI workflow systems.
Led document ingestion services, retrieval pipelines, and production API integrations.
Skills include Python, SQL, Docker, OpenAI APIs, and observability.
"""

CANVA_RESUME_TEXT = """
Page 1
Minhas Ali
AI Backend Engineer
Professional Experience
Built multimodal retrieval systems, FastAPI services, vector embeddings, and workflow automations.
Education
Bachelor of Computer Science
Skills
Python, FastAPI, React, SQL, Docker, OpenAI, OCR, and production debugging.
"""

OCR_TEXT = """
Page 1
Scanned Resume
Machine Learning Engineer with experience in OCR pipelines, Python services, API design,
semantic search, document processing, and cloud deployment.
"""


class FakeTextPage:
    def __init__(self, text):
        self.text = text

    def get_text(self, mode):
        assert mode == "text"
        return self.text

    def get_pixmap(self, matrix=None, alpha=False):
        return SimpleNamespace(width=1, height=1, samples=b"\xff\xff\xff")


class FakeFitzDocument:
    def __init__(self, pages):
        self.pages = pages

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def __iter__(self):
        return iter(self.pages)


class FakePlumberPage:
    def __init__(self, text):
        self.text = text

    def extract_text(self):
        return self.text


class FakePlumberDocument:
    def __init__(self, pages):
        self.pages = pages

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def install_fake_fitz(monkeypatch, text):
    fake_fitz = SimpleNamespace(
        open=lambda stream, filetype: FakeFitzDocument([FakeTextPage(text)]),
        Matrix=lambda x, y: (x, y),
    )
    monkeypatch.setitem(sys.modules, "fitz", fake_fitz)


def install_fake_pdfplumber(monkeypatch, text):
    fake_pdfplumber = SimpleNamespace(
        open=lambda stream: FakePlumberDocument([FakePlumberPage(text)])
    )
    monkeypatch.setitem(sys.modules, "pdfplumber", fake_pdfplumber)


def test_normal_pdf_uses_pymupdf_and_produces_readable_chunks(monkeypatch):
    install_fake_fitz(monkeypatch, NORMAL_PDF_TEXT)

    result = rag._extract_pdf_text(b"%PDF-normal")
    chunks = rag._chunk_text(result.text)

    assert result.status == "text_extracted"
    assert result.method == "pymupdf"
    assert "Senior Backend Engineer" in result.text
    assert chunks
    assert all(rag._is_valid_extracted_text(chunk, minimum_chars=30) for chunk in chunks)


def test_canva_pdf_junk_from_pymupdf_falls_back_to_pdfplumber(monkeypatch):
    install_fake_fitz(monkeypatch, "\x81E\xb7\x9b ISO DIS 15339-2 CGATS21 \x00\x01")
    install_fake_pdfplumber(monkeypatch, CANVA_RESUME_TEXT)

    result = rag._extract_pdf_text(b"%PDF-canva")
    chunks = rag._chunk_text(result.text)

    assert result.status == "text_extracted"
    assert result.method == "pdfplumber"
    assert "AI Backend Engineer" in result.text
    assert "ISO DIS 15339-2" not in result.text
    assert chunks


def test_scanned_pdf_uses_ocr_after_text_extractors_fail(monkeypatch):
    install_fake_fitz(monkeypatch, "")
    install_fake_pdfplumber(monkeypatch, "")
    monkeypatch.setitem(sys.modules, "pytesseract", SimpleNamespace(image_to_string=lambda image: OCR_TEXT))
    monkeypatch.setitem(
        sys.modules,
        "PIL",
        SimpleNamespace(Image=SimpleNamespace(frombytes=lambda mode, size, samples: object())),
    )

    result = rag._extract_pdf_text(b"%PDF-scanned")

    assert result.status == "text_extracted"
    assert result.method == "ocr_pytesseract"
    assert result.ocr_attempted is True
    assert result.ocr_used is True
    assert "Machine Learning Engineer" in result.text


def test_binary_corrupted_text_never_becomes_embedding_chunks():
    binary_text = "\x81E\xb7\x9b+\xbf\xcf\xae\x9e\xd2\x82\xcc\xff ISO DIS 15339-2 CGATS21 stream endstream"

    assert rag._is_corrupt_text(binary_text)
    assert rag._chunk_text(binary_text) == []
