"""PacifiCan Parse Studio — FastAPI application entrypoint."""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
# The Azure SDK logs every blob request/response at INFO, which floods the log
# stream and buries our parse/docling timing lines. Quiet it to WARNING.
for _noisy in ("azure", "azure.core.pipeline.policies.http_logging_policy", "azure.identity", "urllib3"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import chunking, documents, ingest

settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(chunking.router)
app.include_router(ingest.router)


@app.get("/api/health", tags=["meta"])
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "engine": "docling",
        "storage_backend": settings.storage_backend,
        "environment": settings.environment,
    }


@app.get("/api/health/engine", tags=["meta"])
def engine_health() -> dict[str, object]:
    """Reports docling availability + version (drives the 'ENGINE ONLINE' badge)."""
    try:
        import importlib.metadata as md

        import docling  # noqa: F401  (ensures the package is importable)

        return {"online": True, "engine": "docling", "version": md.version("docling")}
    except Exception as exc:  # pragma: no cover
        return {"online": False, "engine": "docling", "error": str(exc)}


# --- Serve the built SPA (production/container) ---
# In local dev the frontend runs on Vite (:5173) and proxies /api here, so this
# block is a no-op unless a built ``static/`` directory is present.
_STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
if _STATIC_DIR.is_dir():
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    app.mount("/assets", StaticFiles(directory=_STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        candidate = _STATIC_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_STATIC_DIR / "index.html")
