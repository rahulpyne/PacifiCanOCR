"""Filesystem storage backend for local development & testing.

Mirrors the two-container ADLS layout under ``local_store_dir``::

    originals/<dated-path>/<filename>          # originals container
    parsed-json/<dated-path>/<stem>.json       # parsed-json container
    parsed-json/records/<doc_id>.json          # metadata index
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any, Optional

from .base import StorageBackend


class LocalStorage(StorageBackend):
    def __init__(self, root: Path):
        self.root = Path(root)
        self.originals_root = self.root / "originals"
        self.json_root = self.root / "parsed-json"
        self.records_root = self.json_root / "records"
        for d in (self.originals_root, self.json_root, self.records_root):
            d.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _write(path: Path, data: bytes) -> str:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return str(path)

    # ---- originals ----
    def save_original(self, path: str, data: bytes) -> str:
        return self._write(self.originals_root / path, data)

    def read_original(self, path: str) -> bytes:
        return (self.originals_root / path).read_bytes()

    # ---- parsed-json content ----
    def save_json(self, path: str, payload: dict[str, Any]) -> str:
        return self._write(
            self.json_root / path,
            json.dumps(payload, indent=2, default=str).encode("utf-8"),
        )

    def read_json(self, path: str) -> Optional[dict[str, Any]]:
        p = self.json_root / path
        return json.loads(p.read_text("utf-8")) if p.exists() else None

    # ---- records (index) ----
    def save_record(self, doc_id: str, record: dict[str, Any]) -> None:
        self._write(
            self.records_root / f"{doc_id}.json",
            json.dumps(record, indent=2, default=str).encode("utf-8"),
        )

    def read_record(self, doc_id: str) -> Optional[dict[str, Any]]:
        p = self.records_root / f"{doc_id}.json"
        return json.loads(p.read_text("utf-8")) if p.exists() else None

    def list_records(self) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        for p in self.records_root.glob("*.json"):
            try:
                records.append(json.loads(p.read_text("utf-8")))
            except Exception:
                continue
        records.sort(key=lambda r: r.get("created_at", ""), reverse=True)
        return records

    # ---- delete ----
    def delete_document(self, doc_id: str, prefix: str) -> None:
        for base in (self.originals_root, self.json_root):
            target = base / prefix
            if target.exists():
                shutil.rmtree(target, ignore_errors=True)
        rec = self.records_root / f"{doc_id}.json"
        if rec.exists():
            rec.unlink()
