"""Document service: orchestrates storage + docling parsing + JSON export.

Keeps routers thin. A "record" (metadata) and the node list (final JSON) are
stored separately so the original file, metadata, and parsed JSON can each live
in their own ADLS container/prefix in production.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from .models import Chunk, DocumentDetail, DocumentSummary, Node
from .parser import parse_document
from .storage import get_storage


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _summary_from_record(rec: dict[str, Any]) -> DocumentSummary:
    return DocumentSummary(**{k: rec[k] for k in DocumentSummary.model_fields if k in rec})


def create_document(filename: str, data: bytes) -> DocumentSummary:
    storage = get_storage()
    doc_id = uuid.uuid4().hex[:12]
    storage.save_original(doc_id, filename, data)
    rec: dict[str, Any] = {
        "id": doc_id,
        "filename": filename,
        "size_bytes": len(data),
        "status": "uploaded",
        "pages": 0,
        "node_count": 0,
        "classification": "Unclassified",
        "created_at": _now(),
        "parsed_at": None,
        "error": None,
    }
    storage.save_record(doc_id, rec)
    return _summary_from_record(rec)


def list_documents() -> list[DocumentSummary]:
    return [_summary_from_record(r) for r in get_storage().list_records()]


def get_document(doc_id: str) -> Optional[DocumentDetail]:
    storage = get_storage()
    rec = storage.read_record(doc_id)
    if not rec:
        return None
    payload = storage.read_json(doc_id) or {}
    nodes = [Node(**n) for n in payload.get("nodes", [])]
    return DocumentDetail(**{**rec, "nodes": nodes})


def parse(doc_id: str) -> DocumentDetail:
    """Run docling on the stored original and persist the resulting nodes."""
    storage = get_storage()
    rec = storage.read_record(doc_id)
    if not rec:
        raise KeyError(doc_id)

    rec["status"] = "parsing"
    storage.save_record(doc_id, rec)
    try:
        data = storage.read_original(doc_id, rec["filename"])
        result = parse_document(data, rec["filename"])
        nodes: list[Node] = result["nodes"]
        rec.update(
            status="parsed",
            pages=result["pages"],
            node_count=len(nodes),
            parsed_at=_now(),
            error=None,
        )
        storage.save_record(doc_id, rec)
        _persist_nodes(doc_id, rec, nodes)
        return DocumentDetail(**{**rec, "nodes": nodes})
    except Exception as exc:  # surface parse failures to the UI
        rec.update(status="error", error=str(exc))
        storage.save_record(doc_id, rec)
        raise


def _persist_nodes(doc_id: str, rec: dict[str, Any], nodes: list[Node]) -> str:
    payload = build_export(rec, nodes)
    return get_storage().save_json(doc_id, payload)


def update_nodes(doc_id: str, nodes: list[Node]) -> DocumentDetail:
    storage = get_storage()
    rec = storage.read_record(doc_id)
    if not rec:
        raise KeyError(doc_id)
    # re-number reading order to match the (possibly edited) sequence
    for i, n in enumerate(nodes, start=1):
        n.reading_order = i
    rec["node_count"] = len(nodes)
    storage.save_record(doc_id, rec)
    _persist_nodes(doc_id, rec, nodes)
    return DocumentDetail(**{**rec, "nodes": nodes})


def delete_document(doc_id: str) -> None:
    get_storage().delete_record(doc_id)


def build_export(rec: dict[str, Any], nodes: list[Node]) -> dict[str, Any]:
    return {
        "document": rec["filename"],
        "document_id": rec["id"],
        "classification": rec.get("classification", "Unclassified"),
        "pages": rec.get("pages", 0),
        "node_count": len(nodes),
        "exported_at": _now(),
        "engine": "docling",
        "nodes": [n.model_dump() for n in nodes],
    }


# --------- chunking (used by chunking + ingest modules) ----------

def _estimate_tokens(text: str) -> int:
    # rough heuristic: ~4 chars per token
    return max(1, len(text) // 4)


def chunk_document(doc_id: str, max_tokens: int, overlap: int) -> list[Chunk]:
    detail = get_document(doc_id)
    if not detail:
        raise KeyError(doc_id)

    chunks: list[Chunk] = []
    buf_text: list[str] = []
    buf_ids: list[str] = []
    buf_pages: set[int] = set()
    buf_tokens = 0
    idx = 0

    def flush() -> None:
        nonlocal idx, buf_text, buf_ids, buf_pages, buf_tokens
        if not buf_text:
            return
        chunks.append(
            Chunk(
                index=idx,
                text="\n\n".join(buf_text),
                node_ids=list(buf_ids),
                page_span=sorted(buf_pages),
                token_estimate=buf_tokens,
            )
        )
        idx += 1
        # carry overlap from the tail of the previous chunk
        if overlap > 0 and buf_text:
            tail = buf_text[-1]
            buf_text = [tail]
            buf_ids = [buf_ids[-1]]
            buf_pages = {max(buf_pages)}
            buf_tokens = _estimate_tokens(tail)
        else:
            buf_text, buf_ids, buf_pages, buf_tokens = [], [], set(), 0

    for n in detail.nodes:
        if not n.text.strip():
            continue
        t = _estimate_tokens(n.text)
        if buf_tokens + t > max_tokens and buf_text:
            flush()
        buf_text.append(n.text)
        buf_ids.append(n.id)
        buf_pages.add(n.page)
        buf_tokens += t
    flush()
    return chunks
