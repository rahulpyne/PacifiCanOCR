"""Docling integration.

Converts an uploaded document into a flat, reading-ordered list of ``Node``
objects that the Parse Studio UI consumes. Uses docling's ``DocumentConverter``
to produce a ``DoclingDocument`` and maps its items to our node schema.

The DocumentConverter is created lazily and cached because model loading is
expensive (first call downloads/initialises layout + OCR models).
"""
from __future__ import annotations

import logging
import tempfile
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

from .config import get_settings
from .models import BBox, Node

logger = logging.getLogger(__name__)

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
def _converter(do_ocr: bool):
    from pathlib import Path as _Path

    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption

    s = get_settings()
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = do_ocr
    pipeline_options.do_table_structure = s.docling_do_table_structure
    # Point docling (incl. EasyOCR) at the models baked into the image so it
    # never fetches from HuggingFace at runtime.
    if s.docling_artifacts_path:
        pipeline_options.artifacts_path = _Path(s.docling_artifacts_path)

    return DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
        }
    )


def _has_text_layer(data: bytes, max_pages: int = 5, min_chars: int = 40) -> bool:
    """Heuristic: does this PDF already carry an extractable text layer?

    Born-digital PDFs do; scans do not. Used to skip OCR when unnecessary.
    Falls back to True (assume text) only if extraction itself errors, so we
    don't needlessly OCR a doc we simply failed to inspect — except we return
    False on a clean "no text found" so scans still get OCR'd.
    """
    try:
        import pypdfium2 as pdfium

        pdf = pdfium.PdfDocument(data)
        try:
            chars = 0
            for i in range(min(len(pdf), max_pages)):
                page = pdf[i]
                textpage = page.get_textpage()
                chars += len(textpage.get_text_range().strip())
                textpage.close()
                page.close()
                if chars >= min_chars:
                    return True
            return chars >= min_chars
        finally:
            pdf.close()
    except Exception:
        # Couldn't inspect — assume there IS a text layer so we don't pay the
        # OCR cost on an unreadable probe. Scans that error here are rare.
        return True


def _resolve_do_ocr(data: bytes, filename: str) -> bool:
    """Decide whether to run OCR for this document per the configured mode."""
    mode = get_settings().docling_ocr_mode
    if mode == "on":
        return True
    if mode == "off":
        return False
    # auto: OCR only when there's no text layer. Non-PDF inputs (images) always OCR.
    if Path(filename).suffix.lower() != ".pdf":
        return True
    return not _has_text_layer(data)


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


def _item_text(item: Any, doc: Any = None) -> str:
    for attr in ("text", "caption_text", "orig"):
        val = getattr(item, attr, None)
        if isinstance(val, str) and val.strip():
            return val.strip()
    # tables expose their content via export helpers
    export = getattr(item, "export_to_markdown", None)
    if callable(export):
        for args in ((doc,), ()):
            try:
                return export(*[a for a in args if a is not None]).strip()
            except Exception:
                continue
    return ""


def _table_html(item: Any, doc: Any) -> str | None:
    """Structured HTML for a table item, for rich rendering in the UI."""
    export = getattr(item, "export_to_html", None)
    if not callable(export):
        return None
    for args in ((doc,), ()):
        try:
            html = export(*[a for a in args if a is not None])
            if isinstance(html, str) and html.strip():
                return html.strip()
        except Exception:
            continue
    return None


def parse_document(data: bytes, filename: str) -> dict[str, Any]:
    """Run docling on raw bytes and return parse results.

    Returns a dict: {nodes: list[Node], pages: int}.
    """
    from docling.datamodel.document import DocumentStream
    import io

    t0 = time.monotonic()
    do_ocr = _resolve_do_ocr(data, filename)
    logger.info("[docling] filename=%s size=%d bytes do_ocr=%s", filename, len(data), do_ocr)

    converter = _converter(do_ocr)
    logger.info("[docling] converter ready elapsed=%.1fs", time.monotonic() - t0)

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

    logger.info("[docling] convert done elapsed=%.1fs", time.monotonic() - t0)

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
        text = _item_text(item, doc)
        ntype = _label_to_type(label)
        if not text and ntype not in ("picture", "table"):
            continue
        table_html = _table_html(item, doc) if ntype == "table" else None
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
                table_html=table_html,
            )
        )

    try:
        pages = doc.num_pages()
    except Exception:
        pages = max((n.page for n in nodes), default=1)

    logger.info("[docling] done pages=%d nodes=%d elapsed=%.1fs", pages, len(nodes), time.monotonic() - t0)
    return {"nodes": nodes, "pages": int(pages or 1)}
