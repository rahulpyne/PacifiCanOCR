"""Document service: orchestrates storage + docling parsing + JSON export.

Keeps routers thin. A "record" (metadata) and the node list (final JSON) are
stored separately so the original file, metadata, and parsed JSON can each live
in their own ADLS container/prefix in production.
"""
from __future__ import annotations

import logging
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .models import Chunk, DocumentDetail, DocumentSummary, Node, PageImage
from .parser import parse_document
from .storage import get_storage

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_name(filename: str) -> str:
    """Strip path separators / odd chars so the name is blob-path safe."""
    base = Path(filename).name or "document"
    return re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("_") or "document"


def _content_paths(rec: dict[str, Any]) -> dict[str, str]:
    """Build the dated, container-relative paths for a document.

    Both containers share ``path_key`` (2026/06/17/<doc_id>), so the original
    and its JSON always live under the same prefix and map one-to-one.
    """
    pk = rec["path_key"]
    fn = _safe_name(rec["filename"])
    stem = Path(fn).stem
    return {
        "prefix": pk,
        "original": f"{pk}/{fn}",
        "json": f"{pk}/{stem}.json",
    }


def _summary_from_record(rec: dict[str, Any]) -> DocumentSummary:
    paths = _content_paths(rec) if rec.get("path_key") else {}
    enriched = {
        **rec,
        "original_path": paths.get("original"),
        "json_path": paths.get("json"),
    }
    return DocumentSummary(
        **{k: enriched[k] for k in DocumentSummary.model_fields if k in enriched}
    )


def create_document(filename: str, data: bytes) -> DocumentSummary:
    storage = get_storage()
    now = datetime.now(timezone.utc)
    # date-coded, sortable id: 20260617-131500-a1b2
    doc_id = f"{now:%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:4]}"
    # shared dated prefix used in BOTH containers
    path_key = f"{now:%Y/%m/%d}/{doc_id}"
    rec: dict[str, Any] = {
        "id": doc_id,
        "filename": filename,
        "path_key": path_key,
        "size_bytes": len(data),
        "status": "uploaded",
        "pages": 0,
        "node_count": 0,
        "classification": "Unclassified",
        "created_at": now.isoformat(),
        "parsed_at": None,
        "error": None,
    }
    storage.save_original(_content_paths(rec)["original"], data)
    storage.save_record(doc_id, rec)
    return _summary_from_record(rec)


def list_documents() -> list[DocumentSummary]:
    return [_summary_from_record(r) for r in get_storage().list_records()]


def get_document(doc_id: str) -> Optional[DocumentDetail]:
    storage = get_storage()
    rec = storage.read_record(doc_id)
    if not rec:
        return None
    payload = storage.read_json(_content_paths(rec)["json"]) or {}
    nodes = [Node(**n) for n in payload.get("nodes", [])]
    page_images = [PageImage(**p) for p in payload.get("page_images", [])]
    return DocumentDetail(
        **{**_summary_from_record(rec).model_dump(), "nodes": nodes, "page_images": page_images}
    )


def parse(doc_id: str) -> DocumentDetail:
    """Run docling on the stored original and persist the resulting nodes."""
    storage = get_storage()
    rec = storage.read_record(doc_id)
    if not rec:
        raise KeyError(doc_id)

    rec["status"] = "parsing"
    storage.save_record(doc_id, rec)
    try:
        paths = _content_paths(rec)
        data = storage.read_original(paths["original"])
        result = parse_document(data, rec["filename"])
        nodes: list[Node] = result["nodes"]
        page_images = result.get("page_images", [])
        rec.update(
            status="parsed",
            pages=result["pages"],
            node_count=len(nodes),
            parsed_at=_now(),
            error=None,
        )
        storage.save_record(doc_id, rec)
        _persist_nodes(rec, nodes, page_images)
        return DocumentDetail(
            **{
                **_summary_from_record(rec).model_dump(),
                "nodes": nodes,
                "page_images": [PageImage(**p) for p in page_images],
            }
        )
    except Exception as exc:  # surface parse failures to the UI
        rec.update(status="error", error=str(exc))
        storage.save_record(doc_id, rec)
        raise


def parse_safe(doc_id: str) -> None:
    """Background-task entry point: parse with timing logs.

    ``parse`` records ``status="error"`` + message on failure; we log it here
    so it shows up in the Azure log stream alongside timing info.
    """
    logger.info("[parse] start doc_id=%s", doc_id)
    t0 = time.monotonic()
    try:
        parse(doc_id)
        logger.info("[parse] done doc_id=%s elapsed=%.1fs", doc_id, time.monotonic() - t0)
    except Exception as exc:
        logger.error("[parse] failed doc_id=%s elapsed=%.1fs error=%s", doc_id, time.monotonic() - t0, exc)


def _persist_nodes(
    rec: dict[str, Any], nodes: list[Node], page_images: list[dict[str, Any]] | None = None
) -> str:
    payload = build_export(rec, nodes, page_images)
    return get_storage().save_json(_content_paths(rec)["json"], payload)


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
    # preserve page images from the existing payload (node edits don't touch them)
    existing = storage.read_json(_content_paths(rec)["json"]) or {}
    page_images = existing.get("page_images", [])
    _persist_nodes(rec, nodes, page_images)
    return DocumentDetail(
        **{
            **_summary_from_record(rec).model_dump(),
            "nodes": nodes,
            "page_images": [PageImage(**p) for p in page_images],
        }
    )


def delete_document(doc_id: str) -> None:
    storage = get_storage()
    rec = storage.read_record(doc_id)
    if not rec:
        return
    prefix = _content_paths(rec)["prefix"] if rec.get("path_key") else doc_id
    storage.delete_document(doc_id, prefix)


def build_export(
    rec: dict[str, Any], nodes: list[Node], page_images: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    paths = _content_paths(rec) if rec.get("path_key") else {}
    return {
        "document": rec["filename"],
        "document_id": rec["id"],
        "path_key": rec.get("path_key"),
        "original_path": paths.get("original"),
        "json_path": paths.get("json"),
        "classification": rec.get("classification", "Unclassified"),
        "pages": rec.get("pages", 0),
        "node_count": len(nodes),
        "exported_at": _now(),
        "engine": "docling",
        "nodes": [n.model_dump() for n in nodes],
        "page_images": page_images or [],
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
