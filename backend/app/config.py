"""Application configuration.

Settings are environment-driven so the same code runs locally and on Azure
(App Service / Web App for Containers). Locally we default to filesystem
storage; in Azure we flip ``STORAGE_BACKEND`` to ``adls`` and point at an
ADLS Gen2 account.

ADLS layout (two separate containers):
  originals/          ← ADLS_ORIGINALS_FILESYSTEM
    <doc_id>/<filename>

  parsed-json/        ← ADLS_JSON_FILESYSTEM
    records/<doc_id>.json
    <doc_id>/parsed.json
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- General ---
    app_name: str = "PacifiCan Parse Studio"
    environment: str = "local"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Storage ---
    # "local" -> filesystem under data/store; "adls" -> Azure Data Lake Gen2.
    storage_backend: Literal["local", "adls"] = "local"
    local_store_dir: Path = BASE_DIR / "data" / "store"

    # --- ADLS Gen2 (only required when storage_backend == "adls") ---
    # Auth: supply a connection string OR just an account name (uses
    # DefaultAzureCredential — managed identity on App Service).
    adls_connection_string: str | None = None
    adls_account_name: str | None = None

    # Two separate ADLS containers (filesystems):
    adls_originals_filesystem: str = "originalfiles"  # raw uploaded files
    adls_json_filesystem: str = "parsedjsons"         # parsed JSON + records

    # --- Docling ---
    docling_do_ocr: bool = True
    docling_do_table_structure: bool = True
    # OCR strategy: "auto" skips OCR when the PDF already has a text layer
    # (born-digital), "on"/"off" force it via docling_do_ocr semantics.
    docling_ocr_mode: Literal["auto", "on", "off"] = "auto"
    # Directory holding pre-downloaded docling models (baked into the Docker
    # image). When set, docling/EasyOCR read from here instead of fetching at
    # runtime. Unset locally → docling uses its default cache.
    docling_artifacts_path: str | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
