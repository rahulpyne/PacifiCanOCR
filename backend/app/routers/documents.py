"""Document endpoints: upload, list, get, parse/re-parse, edit, export, delete."""
from __future__ import annotations

import json

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response

from .. import service
from ..models import DocumentDetail, DocumentSummary, Node

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.get("", response_model=list[DocumentSummary])
def list_documents() -> list[DocumentSummary]:
    return service.list_documents()


@router.post("", response_model=DocumentSummary, status_code=201)
async def upload_document(file: UploadFile = File(...)) -> DocumentSummary:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    return service.create_document(file.filename or "document", data)


@router.post("/upload-and-parse", response_model=DocumentDetail, status_code=201)
async def upload_and_parse(
    background_tasks: BackgroundTasks, file: UploadFile = File(...)
) -> DocumentDetail:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    summary = service.create_document(file.filename or "document", data)
    # Parse in the background so the request returns immediately (docling can run
    # for minutes on a constrained host, past Azure's 230s request timeout). The
    # client polls GET /{id} until status is "parsed" or "error".
    background_tasks.add_task(service.parse_safe, summary.id)
    return DocumentDetail(**{**summary.model_dump(), "status": "parsing", "nodes": []})


@router.get("/{doc_id}", response_model=DocumentDetail)
def get_document(doc_id: str) -> DocumentDetail:
    detail = service.get_document(doc_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Document not found")
    return detail


@router.post("/{doc_id}/parse", response_model=DocumentDetail)
def parse_document(doc_id: str, background_tasks: BackgroundTasks) -> DocumentDetail:
    detail = service.get_document(doc_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Document not found")
    # Re-parse in the background; client polls GET /{id} for completion.
    background_tasks.add_task(service.parse_safe, doc_id)
    return DocumentDetail(**{**detail.model_dump(), "status": "parsing", "nodes": []})


@router.put("/{doc_id}/nodes", response_model=DocumentDetail)
def update_nodes(doc_id: str, nodes: list[Node]) -> DocumentDetail:
    try:
        return service.update_nodes(doc_id, nodes)
    except KeyError:
        raise HTTPException(status_code=404, detail="Document not found")


@router.get("/{doc_id}/export")
def export_json(doc_id: str) -> Response:
    detail = service.get_document(doc_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Document not found")
    payload = service.build_export(detail.model_dump(), detail.nodes)
    body = json.dumps(payload, indent=2, default=str)
    # date-coded download name keeps JSON files mappable to their originals
    stem = detail.filename.rsplit(".", 1)[0]
    filename = f"{detail.id}_{stem}.json"
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/{doc_id}", status_code=204)
def delete_document(doc_id: str) -> Response:
    service.delete_document(doc_id)
    return Response(status_code=204)
