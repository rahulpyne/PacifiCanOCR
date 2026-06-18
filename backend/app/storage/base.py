"""Storage backend interface.

Two content containers + an index:

  originals container      original uploaded files, keyed by a dated path
  parsed-json container     final JSON content, keyed by the SAME dated path
                            plus a ``records/`` index of metadata for listing

Content methods take a full relative ``path`` (e.g.
``2026/06/17/<doc_id>/file.pdf``). The identical date+doc_id prefix is reused
in both containers so an original and its JSON always line up. Records are
keyed by ``doc_id`` alone so the document list is cheap to enumerate.

Local mode mirrors this exact layout on disk; ADLS mode maps each container to
an ADLS Gen2 filesystem. Swapping backends is a config flag.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional


class StorageBackend(ABC):
    # ---- originals container ----
    @abstractmethod
    def save_original(self, path: str, data: bytes) -> str:
        """Persist an original upload at ``path``; returns a storage URI."""

    @abstractmethod
    def read_original(self, path: str) -> bytes:
        ...

    # ---- parsed-json container (final JSON content) ----
    @abstractmethod
    def save_json(self, path: str, payload: dict[str, Any]) -> str:
        """Persist the final parsed JSON at ``path``; returns a storage URI."""

    @abstractmethod
    def read_json(self, path: str) -> Optional[dict[str, Any]]:
        ...

    # ---- metadata index (records/, lives in the json container) ----
    @abstractmethod
    def save_record(self, doc_id: str, record: dict[str, Any]) -> None:
        ...

    @abstractmethod
    def read_record(self, doc_id: str) -> Optional[dict[str, Any]]:
        ...

    @abstractmethod
    def list_records(self) -> list[dict[str, Any]]:
        ...

    # ---- delete everything belonging to a document ----
    @abstractmethod
    def delete_document(self, doc_id: str, prefix: str) -> None:
        """Remove the record plus the dated ``prefix`` folder in both containers."""
