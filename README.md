# PacifiCan Parse Studio

A document parsing / OCR workbench built around the
[docling](https://github.com/docling-project/docling) engine.

Upload a document → docling parses it into structured, reading-ordered
elements (headings, text, tables, pictures, lists, formulas, captions) →
inspect and edit the structure in a three-panel studio → export the final
JSON. Originals and parsed JSON are persisted through a pluggable storage
backend: **filesystem locally**, **Azure Data Lake Storage Gen2 in production**.

```
┌──────────┬────────────────────────────────┬──────────────┐
│ Sidebar  │  Structure │  Document viewer   │  Properties  │
│ + engine │  tree      │  (dark canvas,     │  inspector / │
│ status   │  + filter  │   page rail,       │  chunk/ingest│
│          │            │   layer highlights)│  modules     │
└──────────┴────────────────────────────────┴──────────────┘
```

## Architecture

| Layer | Tech | Notes |
|-------|------|-------|
| Frontend | React 18 + Vite + TypeScript | Reproduces the Parse Studio design |
| Backend | FastAPI (Python 3.11+) | REST API |
| Engine | docling | PDF/DOCX/PPTX/XLSX/HTML/image → `DoclingDocument` |
| Storage | Local FS / ADLS Gen2 | Selected via `STORAGE_BACKEND` |

## Functional components (from the design)

- **Documents / New analysis** — upload + auto-parse, list, delete
- **Parse view** — structure tree, document viewer with per-node highlight
  regions, properties inspector
- **Layers** — toggle element types on/off, per-page counts
- **Node editing** — change type, edit extracted content (live sync),
  apply, delete; reading order recomputed
- **Export / Download JSON** — the final parsed JSON content
- **Re-run parse**
- **Chunking module** — segment into retrieval-ready chunks (size + overlap)
- **Ingest module** — embed/write chunks to a vector store (local-preview now,
  Azure AI Search-ready)
- **Engine status** — live docling availability + version

## Run locally

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # defaults to local filesystem storage
uvicorn app.main:app --reload --port 8000
```

API docs: http://127.0.0.1:8000/docs

> First parse downloads docling's layout/OCR models (one-time, ~minutes).

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173 (proxies /api → :8000)
```

Open http://localhost:5173, drop a PDF on the Documents view, and it parses.

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/api/health` | service + storage status |
| GET  | `/api/health/engine` | docling availability/version |
| GET  | `/api/documents` | list documents |
| POST | `/api/documents/upload-and-parse` | upload + parse (multipart) |
| GET  | `/api/documents/{id}` | document detail + nodes |
| POST | `/api/documents/{id}/parse` | (re)parse |
| PUT  | `/api/documents/{id}/nodes` | save edited nodes |
| GET  | `/api/documents/{id}/export` | download final JSON |
| DELETE | `/api/documents/{id}` | delete |
| POST | `/api/documents/{id}/chunk` | chunk |
| POST | `/api/documents/{id}/ingest` | ingest |

## Storage backends

Local (default): everything under `backend/data/store/<doc_id>/`.

ADLS Gen2 (production): set in `.env`

```
STORAGE_BACKEND=adls
ADLS_ACCOUNT_NAME=mystorageaccount      # uses managed identity, OR
# ADLS_CONNECTION_STRING=...
ADLS_FILESYSTEM=parse-studio
ADLS_ORIGINALS_PREFIX=originals         # original uploaded files container/prefix
ADLS_JSON_PREFIX=parsed                 # final JSON content container/prefix
```

See [docs/AZURE.md](docs/AZURE.md) for the full Azure deployment guide.
