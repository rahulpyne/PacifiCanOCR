"""OCR strategy selection (parser._resolve_do_ocr)."""
from __future__ import annotations

import pytest


@pytest.fixture
def reset_settings():
    from app.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _resolve(monkeypatch, mode, *, filename="doc.pdf", has_text=True):
    monkeypatch.setenv("DOCLING_OCR_MODE", mode)
    from app import parser
    from app.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setattr(parser, "_has_text_layer", lambda data, **k: has_text)
    return parser._resolve_do_ocr(b"%PDF-1.4", filename)


def test_mode_on_forces_ocr(reset_settings, monkeypatch):
    assert _resolve(monkeypatch, "on", has_text=True) is True


def test_mode_off_disables_ocr(reset_settings, monkeypatch):
    assert _resolve(monkeypatch, "off", has_text=False) is False


def test_auto_skips_ocr_when_text_layer_present(reset_settings, monkeypatch):
    assert _resolve(monkeypatch, "auto", has_text=True) is False


def test_auto_enables_ocr_for_scans(reset_settings, monkeypatch):
    assert _resolve(monkeypatch, "auto", has_text=False) is True


def test_auto_enables_ocr_for_non_pdf(reset_settings, monkeypatch):
    # Images can't have a text layer → always OCR.
    assert _resolve(monkeypatch, "auto", filename="scan.png", has_text=True) is True
