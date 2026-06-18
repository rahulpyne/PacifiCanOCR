"""Pydantic schemas shared across the API.

The core object is a ``Node`` — one parsed element of a document (matching the
element types in the Parse Studio design: text, section_header, table, picture,
list, formula, caption, page_header).
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

NodeType = Literal[
    "page_header",
    "section_header",
    "text",
    "table",
    "picture",
    "list",
    "formula",
    "caption",
]

DocStatus = Literal["uploaded", "parsing", "parsed", "error"]


class BBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class Node(BaseModel):
    id: str
    reading_order: int
    page: int
    type: NodeType
    text: str = ""
    confidence: float = 1.0
    bbox: Optional[BBox] = None
    # For table nodes: structured HTML for rich rendering (text holds markdown).
    table_html: Optional[str] = None
    # For picture nodes: base64 PNG data URI of the extracted image.
    image: Optional[str] = None


class DocumentSummary(BaseModel):
    id: str
    filename: str
    size_bytes: int
    status: DocStatus
    pages: int = 0
    node_count: int = 0
    classification: str = "Unclassified"
    created_at: datetime
    parsed_at: Optional[datetime] = None
    error: Optional[str] = None
    # dated path prefix shared by both containers, e.g. 2026/06/17/<doc_id>
    path_key: Optional[str] = None
    original_path: Optional[str] = None
    json_path: Optional[str] = None


class DocumentDetail(DocumentSummary):
    nodes: list[Node] = Field(default_factory=list)


# ---- request bodies ----

class NodeUpdate(BaseModel):
    type: Optional[NodeType] = None
    text: Optional[str] = None


class ChunkRequest(BaseModel):
    max_tokens: int = 512
    overlap: int = 64


class Chunk(BaseModel):
    index: int
    text: str
    node_ids: list[str]
    page_span: list[int]
    token_estimate: int


class ChunkResponse(BaseModel):
    document_id: str
    chunk_count: int
    chunks: list[Chunk]


class IngestRequest(BaseModel):
    store: str = "local-preview"
    max_tokens: int = 512
    overlap: int = 64


class IngestResponse(BaseModel):
    document_id: str
    store: str
    chunks_ingested: int
    status: str
