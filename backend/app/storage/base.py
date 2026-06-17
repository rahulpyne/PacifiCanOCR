"""Storage backend interface.

The app persists three things per document:
  * the original uploaded file (bytes)
  * a metadata record (document summary)
  * the parsed/edited node JSON (the "final json content")

Local mode keeps these on disk; ADLS mode keeps originals + final JSON in
Azure Data Lake Gen2 containers, exactly as required for the Azure deployment.
Swapping backends is a config flag — no API changes.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional


class StorageBackend(ABC):
    # ---- original files ----
    @abstractmethod
    def save_original(self, doc_id: str, filename: str, data: bytes) -> str:
        """Persist the original upload, returning a storage URI/path."""

    @abstractmethod
    def read_original(self, doc_id: str, filename: str) -> bytes:
        ...

    # ---- metadata records ----
    @abstractmethod
    def save_record(self, doc_id: str, record: dict[str, Any]) -> None:
        ...

    @abstractmethod
    def read_record(self, doc_id: str) -> Optional[dict[str, Any]]:
        ...

    @abstractmethod
    def list_records(self) -> list[dict[str, Any]]:
        ...

    @abstractmethod
    def delete_record(self, doc_id: str) -> None:
        ...

    # ---- final parsed JSON ----
    @abstractmethod
    def save_json(self, doc_id: str, payload: dict[str, Any]) -> str:
        """Persist the final parsed JSON, returning a storage URI/path."""

    @abstractmethod
    def read_json(self, doc_id: str) -> Optional[dict[str, Any]]:
        ...
