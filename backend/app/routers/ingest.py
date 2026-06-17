"""Ingest module — embed & write chunks into a vector store.

Locally this performs the chunking step and reports what *would* be ingested
(a no-op "local-preview" store), keeping the surface ready for a real vector
store (e.g. Azure AI Search) in production without changing the API.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import service
from ..models import IngestRequest, IngestResponse

router = APIRouter(prefix="/api/documents", tags=["ingest"])


@router.post("/{doc_id}/ingest", response_model=IngestResponse)
def ingest_document(doc_id: str, req: IngestRequest) -> IngestResponse:
    try:
        chunks = service.chunk_document(doc_id, req.max_tokens, req.overlap)
    except KeyError:
        raise HTTPException(status_code=404, detail="Document not found")

    # TODO(prod): push chunks to the configured vector store (Azure AI Search).
    return IngestResponse(
        document_id=doc_id,
        store=req.store,
        chunks_ingested=len(chunks),
        status="completed" if req.store == "local-preview" else "queued",
    )
