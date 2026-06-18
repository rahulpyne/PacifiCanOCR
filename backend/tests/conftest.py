"""Shared test fixtures.

Tests run against the local filesystem storage backend in a throwaway temp dir,
so they never touch Azure and need no docling models (docling is monkeypatched).
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("LOCAL_STORE_DIR", str(tmp_path / "store"))
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost")

    from app.config import get_settings
    from app.storage import get_storage

    # Caches are module-global; reset so each test gets its own tmp store.
    get_settings.cache_clear()
    get_storage.cache_clear()

    from app.main import app

    with TestClient(app) as c:
        yield c

    get_settings.cache_clear()
    get_storage.cache_clear()
