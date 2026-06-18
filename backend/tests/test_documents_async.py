"""Async upload/parse flow: the request returns immediately and parsing runs
in a background task. Starlette's TestClient executes background tasks before
returning, so after POST the GET reflects the terminal state.
"""
from __future__ import annotations

import pytest

from app.models import Node

PDF = b"%PDF-1.4 fake content"


def _fake_nodes():
    return {
        "nodes": [
            Node(id="n1", reading_order=1, page=1, type="section_header", text="Hello"),
            Node(
                id="n2",
                reading_order=2,
                page=1,
                type="table",
                text="| a | b |",
                table_html="<table><tr><td>a</td><td>b</td></tr></table>",
            ),
        ],
        "pages": 1,
    }


def test_upload_and_parse_runs_in_background(client, monkeypatch):
    monkeypatch.setattr("app.service.parse_document", lambda data, fn: _fake_nodes())

    res = client.post(
        "/api/documents/upload-and-parse",
        files={"file": ("test.pdf", PDF, "application/pdf")},
    )
    assert res.status_code == 201
    body = res.json()
    # Endpoint returns immediately with the "parsing" placeholder.
    assert body["status"] == "parsing"
    assert body["nodes"] == []
    doc_id = body["id"]

    # Background task already ran → GET shows the parsed result.
    detail = client.get(f"/api/documents/{doc_id}").json()
    assert detail["status"] == "parsed"
    assert detail["pages"] == 1
    assert detail["node_count"] == 2


def test_table_html_round_trips(client, monkeypatch):
    monkeypatch.setattr("app.service.parse_document", lambda data, fn: _fake_nodes())

    doc_id = client.post(
        "/api/documents/upload-and-parse",
        files={"file": ("t.pdf", PDF, "application/pdf")},
    ).json()["id"]

    nodes = client.get(f"/api/documents/{doc_id}").json()["nodes"]
    table = next(n for n in nodes if n["type"] == "table")
    assert table["table_html"] == "<table><tr><td>a</td><td>b</td></tr></table>"


def test_parse_failure_records_error(client, monkeypatch):
    def boom(data, fn):
        raise RuntimeError("docling exploded")

    monkeypatch.setattr("app.service.parse_document", boom)

    doc_id = client.post(
        "/api/documents/upload-and-parse",
        files={"file": ("bad.pdf", PDF, "application/pdf")},
    ).json()["id"]

    detail = client.get(f"/api/documents/{doc_id}").json()
    assert detail["status"] == "error"
    assert "docling exploded" in (detail["error"] or "")


def test_empty_file_rejected(client):
    res = client.post(
        "/api/documents/upload-and-parse",
        files={"file": ("empty.pdf", b"", "application/pdf")},
    )
    assert res.status_code == 400
