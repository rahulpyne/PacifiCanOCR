"""Application configuration.

Settings are environment-driven so the same code runs locally and on Azure
(App Service / Web App for Containers). Locally we default to filesystem
storage; in Azure we flip ``STORAGE_BACKEND`` to ``adls`` and point at an
ADLS Gen2 account.
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
    # Either supply a connection string OR an account name + use managed identity.
    adls_connection_string: str | None = None
    adls_account_name: str | None = None
    adls_filesystem: str = "parse-studio"          # the ADLS container/filesystem
    adls_originals_prefix: str = "originals"        # original uploaded files
    adls_json_prefix: str = "parsed"               # final parsed JSON output

    # --- Docling ---
    docling_do_ocr: bool = True
    docling_do_table_structure: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
