"""Chunking module — segment a parsed document into retrieval-ready chunks."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import service
from ..models import ChunkRequest, ChunkResponse

router = APIRouter(prefix="/api/documents", tags=["chunking"])


@router.post("/{doc_id}/chunk", response_model=ChunkResponse)
def chunk_document(doc_id: str, req: ChunkRequest) -> ChunkResponse:
    try:
        chunks = service.chunk_document(doc_id, req.max_tokens, req.overlap)
    except KeyError:
        raise HTTPException(status_code=404, detail="Document not found")
    return ChunkResponse(document_id=doc_id, chunk_count=len(chunks), chunks=chunks)
