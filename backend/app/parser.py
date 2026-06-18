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
    # Extract embedded picture bitmaps so they can be rendered in the UI.
    # Without this docling emits a "image not available" placeholder instead.
    pipeline_options.generate_picture_images = True
    pipeline_options.images_scale = s.docling_image_scale
    # Render a full bitmap of each page so the UI can show the original layout
    # with bounding-box overlays (docling-Studio style).
    pipeline_options.generate_page_images = True
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


def _page_data_uri(page: Any) -> str | None:
    """Base64 PNG data URI of a full page bitmap, or None."""
    img = getattr(page, "image", None)
    pil = getattr(img, "pil_image", None) if img is not None else None
    if pil is None:
        return None
    try:
        import base64
        import io as _io

        buf = _io.BytesIO()
        pil.save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception:
        return None


def _build_pages(doc: Any) -> tuple[list[dict[str, Any]], dict[int, float]]:
    """Return (page metadata list, {page_no: height}) for layout rendering.

    Each page entry carries its point dimensions and a rendered bitmap so the
    frontend can overlay bounding boxes (expressed in the same point space).
    """
    pages: list[dict[str, Any]] = []
    heights: dict[int, float] = {}
    raw = getattr(doc, "pages", None) or {}
    items = raw.items() if hasattr(raw, "items") else enumerate(raw, start=1)
    for pno, page in items:
        size = getattr(page, "size", None)
        w = float(getattr(size, "width", 0.0) or 0.0)
        h = float(getattr(size, "height", 0.0) or 0.0)
        heights[int(pno)] = h
        pages.append(
            {
                "page_no": int(pno),
                "width": round(w, 1),
                "height": round(h, 1),
                "image": _page_data_uri(page),
            }
        )
    pages.sort(key=lambda p: p["page_no"])
    return pages, heights


def _extract_bbox(item: Any, page_heights: dict[int, float]) -> tuple[int, BBox | None]:
    """Return (page_no, bbox) with the bbox normalized to TOP-LEFT origin.

    docling provenance bboxes for PDFs are usually BOTTOM-LEFT (y grows upward).
    The UI overlays boxes on a top-down page image, so we flip y using the page
    height. Output x/y is the top-left corner in the page's point coordinates.
    """
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
        right = float(getattr(bb, "r", 0.0))
        t = float(getattr(bb, "t", 0.0))
        b = float(getattr(bb, "b", 0.0))
        origin = str(getattr(getattr(bb, "coord_origin", ""), "value", getattr(bb, "coord_origin", ""))).upper()
        ph = page_heights.get(page_no)
        if "BOTTOM" in origin and ph:
            top, bottom = ph - t, ph - b
        else:
            top, bottom = t, b
        return page_no, BBox(
            x=round(min(left, right), 1),
            y=round(min(top, bottom), 1),
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


def _picture_caption(item: Any, doc: Any) -> str:
    """Caption text for a picture, or empty — never the markdown placeholder."""
    cap = getattr(item, "caption_text", None)
    if callable(cap):
        for args in ((doc,), ()):
            try:
                val = cap(*args)
                if isinstance(val, str) and val.strip():
                    return val.strip()
            except Exception:
                continue
    elif isinstance(cap, str) and cap.strip():
        return cap.strip()
    txt = getattr(item, "text", None)
    return txt.strip() if isinstance(txt, str) and txt.strip() else ""


def _picture_image(item: Any, doc: Any) -> str | None:
    """Return a base64 PNG data URI for a picture item, or None.

    Requires ``generate_picture_images=True`` on the pipeline so docling actually
    decodes the bitmap. If the image is missing we return None and the UI shows a
    placeholder box instead of docling's raw HTML comment.
    """
    try:
        get_image = getattr(item, "get_image", None)
        img = get_image(doc) if callable(get_image) else getattr(getattr(item, "image", None), "pil_image", None)
        if img is None:
            return None
        import base64
        import io as _io

        buf = _io.BytesIO()
        img.save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception:
        return None


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

    Returns a dict: {nodes: list[Node], pages: int, page_images: list[dict]}.
    """
    from docling.datamodel.document import DocumentStream
    import io

    # Ask docling to record per-stage timings (layout, OCR, table-structure, …).
    try:
        from docling.datamodel.settings import settings as docling_settings

        docling_settings.debug.profile_pipeline_timings = True
    except Exception:
        pass

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

    # Per-stage breakdown (only present when profiling is supported/enabled).
    try:
        timings = getattr(result, "timings", None) or {}
        for name, item in sorted(
            timings.items(), key=lambda kv: sum(getattr(kv[1], "times", []) or []), reverse=True
        ):
            times = getattr(item, "times", None) or []
            if times:
                logger.info(
                    "[docling] stage %-22s total=%6.1fs calls=%d", name, sum(times), len(times)
                )
    except Exception:
        pass

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

    page_images, page_heights = _build_pages(doc)

    nodes: list[Node] = []
    order = 0
    for item, _level in doc.iterate_items():
        label = getattr(item, "label", None)
        if label is None:
            continue
        ntype = _label_to_type(label)
        # Pictures: use only the caption as text (never the markdown placeholder),
        # and carry the extracted bitmap as a data URI.
        if ntype == "picture":
            text = _picture_caption(item, doc)
            image = _picture_image(item, doc)
            table_html = None
        else:
            text = _item_text(item, doc)
            image = None
            table_html = _table_html(item, doc) if ntype == "table" else None
        if not text and ntype not in ("picture", "table"):
            continue
        page_no, bbox = _extract_bbox(item, page_heights)
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
                image=image,
            )
        )

    try:
        pages = doc.num_pages()
    except Exception:
        pages = max((n.page for n in nodes), default=1)

    logger.info(
        "[docling] done pages=%d nodes=%d page_images=%d elapsed=%.1fs",
        pages, len(nodes), sum(1 for p in page_images if p.get("image")), time.monotonic() - t0,
    )
    return {"nodes": nodes, "pages": int(pages or 1), "page_images": page_images}
