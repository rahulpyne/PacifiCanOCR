"""Docling integration.

Converts an uploaded document into a flat, reading-ordered list of ``Node``
objects that the Parse Studio UI consumes. Uses docling's ``DocumentConverter``
to produce a ``DoclingDocument`` and maps its items to our node schema.

The DocumentConverter is created lazily and cached because model loading is
expensive (first call downloads/initialises layout + OCR models).
"""
from __future__ import annotations

import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Any

from .config import get_settings
from .models import BBox, Node

# docling DocItemLabel -> our NodeType
_LABEL_MAP: dict[str, str] = {
    "title": "section_header",
    "section_header": "section_header",
    "subtitle": "section_header",
    "text": "text",
    "paragraph": "text",
    "footnote": "text",
    "page_header": "page_header",
    "page_footer": "page_header",
    "list_item": "list",
    "list": "list",
    "table": "table",
    "picture": "picture",
    "figure": "picture",
    "caption": "caption",
    "formula": "formula",
    "code": "text",
    "checkbox_selected": "text",
    "checkbox_unselected": "text",
    "document_index": "list",
}


@lru_cache
def _converter():
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption

    s = get_settings()
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = s.docling_do_ocr
    pipeline_options.do_table_structure = s.docling_do_table_structure

    return DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
        }
    )


def _label_to_type(label: Any) -> str:
    raw = getattr(label, "value", label)
    return _LABEL_MAP.get(str(raw).lower(), "text")


def _extract_bbox(item: Any) -> tuple[int, BBox | None]:
    """Return (page_no, bbox) from an item's first provenance entry."""
    prov = getattr(item, "prov", None)
    if not prov:
        return 1, None
    p = prov[0]
    page_no = int(getattr(p, "page_no", 1) or 1)
    bb = getattr(p, "bbox", None)
    if bb is None:
        return page_no, None
    try:
        left = float(getattr(bb, "l", 0.0))
        top = float(getattr(bb, "t", 0.0))
        right = float(getattr(bb, "r", 0.0))
        bottom = float(getattr(bb, "b", 0.0))
        return page_no, BBox(
            x=round(left, 1),
            y=round(top, 1),
            width=round(abs(right - left), 1),
            height=round(abs(bottom - top), 1),
        )
    except Exception:
        return page_no, None


def _item_text(item: Any) -> str:
    for attr in ("text", "caption_text", "orig"):
        val = getattr(item, attr, None)
        if isinstance(val, str) and val.strip():
            return val.strip()
    # tables expose their content via export helpers
    export = getattr(item, "export_to_markdown", None)
    if callable(export):
        try:
            return export().strip()
        except Exception:
            pass
    return ""


def parse_document(data: bytes, filename: str) -> dict[str, Any]:
    """Run docling on raw bytes and return parse results.

    Returns a dict: {nodes: list[Node], pages: int}.
    """
    from docling.datamodel.document import DocumentStream
    import io

    converter = _converter()
    suffix = Path(filename).suffix or ".pdf"

    # Prefer the in-memory stream API; fall back to a temp file if unavailable.
    try:
        source = DocumentStream(name=filename, stream=io.BytesIO(data))
        result = converter.convert(source)
    except Exception:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        result = converter.convert(tmp_path)

    doc = result.document

    # overall confidence (0..1) used as a per-node default
    default_conf = 0.95
    try:
        conf = getattr(result, "confidence", None)
        score = getattr(conf, "mean_grade", None) or getattr(conf, "overall_score", None)
        if isinstance(score, (int, float)):
            default_conf = float(score) if score <= 1 else float(score) / 100.0
    except Exception:
        pass

    nodes: list[Node] = []
    order = 0
    for item, _level in doc.iterate_items():
        label = getattr(item, "label", None)
        if label is None:
            continue
        text = _item_text(item)
        ntype = _label_to_type(label)
        if not text and ntype not in ("picture", "table"):
            continue
        page_no, bbox = _extract_bbox(item)
        order += 1
        nodes.append(
            Node(
                id=f"n{order}",
                reading_order=order,
                page=page_no,
                type=ntype,  # type: ignore[arg-type]
                text=text or f"[{ntype}]",
                confidence=round(default_conf, 3),
                bbox=bbox,
            )
        )

    try:
        pages = doc.num_pages()
    except Exception:
        pages = max((n.page for n in nodes), default=1)

    return {"nodes": nodes, "pages": int(pages or 1)}
