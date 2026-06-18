# Azure deployment guide

Hosts the app on **Azure App Service (Web App for Containers)** and stores data
in **Azure Data Lake Storage Gen2** across **two separate containers**:

| Container | Holds |
|-----------|-------|
| `originalfiles` | the original uploaded files |
| `parsedjsons` | the downloadable parsed JSON content + document metadata records |

The storage backend is selected with one env var (`STORAGE_BACKEND=adls`) — no
code changes between local and Azure.

---

## Why App Service (Web App for Containers)

Single Linux container, managed TLS/HTTPS, system-managed identity, and a
first-class GitHub Actions deploy path. No Kubernetes overhead. docling's layout
models are CPU-bound, so SKU drives parse speed: **B2** (2 burstable vCPU) is the
bare minimum; **P2v3** (4 dedicated vCPU, 16 GB) is recommended and roughly halves
layout time. Scale an existing plan in place:

```bash
az appservice plan update -g <rg> -n <plan> --sku P2V3
az webapp config appsettings set -g <rg> -n <app> --settings OMP_NUM_THREADS=4
```

---

## Option 1 — Provision manually (Portal), connection-string auth

This matches a "create resources in the Portal, paste connection strings"
workflow.

### Resources to create

1. **Resource group** — e.g. `pacifican-parse-rg`, region *Canada Central*.
2. **Storage account (ADLS Gen2)** — Standard / LRS, and in the **Advanced**
   tab toggle **Enable hierarchical namespace** ✅ (this is what makes it Gen2).
3. **Two containers** inside it: `originalfiles` and `parsedjsons`.
4. **Azure Container Registry** — SKU *Basic*; enable **Admin user** under
   *Access keys*.
5. **Web App for Containers** — Publish = *Container*, OS = *Linux*, Plan = *B2*.

### Configure the Web App

Web App → *Settings → Environment variables → App settings*, add:

| Name | Value |
|------|-------|
| `STORAGE_BACKEND` | `adls` |
| `ADLS_CONNECTION_STRING` | *(paste the storage account connection string)* |
| `ADLS_ORIGINALS_FILESYSTEM` | `originalfiles` |
| `ADLS_JSON_FILESYSTEM` | `parsedjsons` |
| `DOCLING_DO_OCR` | `true` |
| `DOCLING_DO_TABLE_STRUCTURE` | `true` |
| `DOCLING_OCR_MODE` | `auto` |
| `ENVIRONMENT` | `azure` |
| `WEBSITES_PORT` | `8000` |
| `CORS_ORIGINS` | `https://<your-app>.azurewebsites.net` |

> Enable **Always On** so background parse tasks survive idle periods:
> `az webapp config set -g <rg> -n <app> --always-on true`
> (`DOCLING_ARTIFACTS_PATH` is baked into the image — no app setting needed.)

> Prefer **managed identity** over a connection string in production: drop
> `ADLS_CONNECTION_STRING`, set `ADLS_ACCOUNT_NAME=<account>`, and grant the
> Web App's identity the **Storage Blob Data Contributor** role on the storage
> account. The code uses `DefaultAzureCredential` automatically.

### Deploy from GitHub

Add these repo secrets (Settings → Secrets and variables → Actions):

| Secret | From |
|--------|------|
| `ACR_LOGIN_SERVER` | ACR → Overview (e.g. `pacificanacr.azurecr.io`) |
| `ACR_USERNAME` | ACR → Access keys |
| `ACR_PASSWORD` | ACR → Access keys |
| `AZURE_WEBAPP_NAME` | your Web App name |
| `AZURE_WEBAPP_PUBLISH_PROFILE` | Web App → Overview → **Download publish profile** (paste file contents) |

Then push to `main` — [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)
builds the image, pushes it to ACR, and deploys it to the Web App.

---

## Option 2 — Provision as code

### Bicep (declarative, recommended)

```bash
az group create -n pacifican-parse-rg -l canadacentral
az deployment group create \
  -g pacifican-parse-rg \
  -f infra/main.bicep \
  -p @infra/main.parameters.json
```

Creates the storage account + both containers, ACR, plan, and Web App with a
managed identity already granted Storage Blob Data Contributor + AcrPull.
See [`infra/main.bicep`](../infra/main.bicep).

### Shell script (imperative, also sets up OIDC for CI)

```bash
chmod +x infra/setup.sh
./infra/setup.sh
```

Provisions everything plus a GitHub Actions OIDC federated identity, and prints
the secret values to add. See [`infra/setup.sh`](../infra/setup.sh).

---

## Notes

- **Cold start / models:** the `Dockerfile` pre-downloads docling's layout, table,
  and EasyOCR models to `/opt/docling-models` (`DOCLING_ARTIFACTS_PATH`) at build
  time, so no models are fetched at runtime.
- **OCR:** `DOCLING_OCR_MODE=auto` skips OCR on born-digital PDFs (those with a
  text layer) and only runs it on scans — much faster. Force with `on`/`off`.
- **Original-layout preview:** docling renders each page to a bitmap
  (`generate_page_images`) and extracts picture bitmaps (`generate_picture_images`);
  the UI overlays labeled bounding boxes on the page image. Page/picture images are
  stored inline (base64) in the parsed JSON, so `DOCLING_IMAGE_SCALE` trades preview
  sharpness against JSON size. The downloadable JSON export omits page images.
- **Long parses:** parsing runs in a background task; `POST /upload-and-parse`
  returns immediately with status `parsing` and the client polls `GET /{id}`
  until `parsed`/`error`. Keep **Always On** enabled so the worker isn't recycled
  mid-parse.
- **Vector ingest (production):** wire `backend/app/routers/ingest.py` to Azure
  AI Search to make the Ingest module write real embeddings.
