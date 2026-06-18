# syntax=docker/dockerfile:1

# ---- Stage 1: build the React frontend ----
FROM node:20-slim AS frontend
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build          # -> /web/dist

# ---- Stage 2: backend + static assets ----
FROM python:3.11-slim AS runtime
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

# System deps docling may need for OCR/image handling
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/app ./app
# Built SPA served as static files by FastAPI
COPY --from=frontend /web/dist ./static

# Pre-download docling models into the image so the first parse request
# does not have to fetch ~500MB from HuggingFace at runtime (which blows
# past Azure App Service's 230s request timeout on cold start).
RUN python -c "from docling.utils.model_downloader import download_models; download_models()"

EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
