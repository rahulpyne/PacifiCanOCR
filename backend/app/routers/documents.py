"""Document endpoints: upload, list, get, parse/re-parse, edit, export, delete."""
from __future__ import annotations

import json

from fastapi import APIRouter, File, HTTPException, UploadFile
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
async def upload_and_parse(file: UploadFile = File(...)) -> DocumentDetail:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    summary = service.create_document(file.filename or "document", data)
    try:
        return service.parse(summary.id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Parse failed: {exc}")


@router.get("/{doc_id}", response_model=DocumentDetail)
def get_document(doc_id: str) -> DocumentDetail:
    detail = service.get_document(doc_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Document not found")
    return detail


@router.post("/{doc_id}/parse", response_model=DocumentDetail)
def parse_document(doc_id: str) -> DocumentDetail:
    try:
        return service.parse(doc_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Document not found")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Parse failed: {exc}")


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
    filename = f"{detail.filename.rsplit('.', 1)[0]}.parsed.json"
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/{doc_id}", status_code=204)
def delete_document(doc_id: str) -> Response:
    service.delete_document(doc_id)
    return Response(status_code=204)
