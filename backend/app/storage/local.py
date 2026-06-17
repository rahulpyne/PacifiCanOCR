"""Filesystem storage backend used for local development & testing.

Layout under ``local_store_dir``::

    store/
      <doc_id>/
        record.json          # document metadata
        parsed.json          # final parsed JSON content
        originals/<filename>  # the original uploaded file
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from .base import StorageBackend


class LocalStorage(StorageBackend):
    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _doc_dir(self, doc_id: str) -> Path:
        d = self.root / doc_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    # ---- original files ----
    def save_original(self, doc_id: str, filename: str, data: bytes) -> str:
        originals = self._doc_dir(doc_id) / "originals"
        originals.mkdir(parents=True, exist_ok=True)
        path = originals / filename
        path.write_bytes(data)
        return str(path)

    def read_original(self, doc_id: str, filename: str) -> bytes:
        return (self.root / doc_id / "originals" / filename).read_bytes()

    # ---- metadata ----
    def save_record(self, doc_id: str, record: dict[str, Any]) -> None:
        path = self._doc_dir(doc_id) / "record.json"
        path.write_text(json.dumps(record, indent=2, default=str), encoding="utf-8")

    def read_record(self, doc_id: str) -> Optional[dict[str, Any]]:
        path = self.root / doc_id / "record.json"
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def list_records(self) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        for child in self.root.iterdir():
            if child.is_dir():
                rec = self.read_record(child.name)
                if rec:
                    records.append(rec)
        records.sort(key=lambda r: r.get("created_at", ""), reverse=True)
        return records

    def delete_record(self, doc_id: str) -> None:
        import shutil

        d = self.root / doc_id
        if d.exists():
            shutil.rmtree(d)

    # ---- final JSON ----
    def save_json(self, doc_id: str, payload: dict[str, Any]) -> str:
        path = self._doc_dir(doc_id) / "parsed.json"
        path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
        return str(path)

    def read_json(self, doc_id: str) -> Optional[dict[str, Any]]:
        path = self.root / doc_id / "parsed.json"
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))
