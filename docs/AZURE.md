# Azure deployment guide

Hosts the app on **Azure App Service (Web App for Containers)** and stores data
in **Azure Data Lake Storage Gen2** across **two separate containers**:

| Container | Holds |
|-----------|-------|
| `originals` | the original uploaded files |
| `parsed-json` | the downloadable parsed JSON content + document metadata records |

The storage backend is selected with one env var (`STORAGE_BACKEND=adls`) — no
code changes between local and Azure.

---

## Why App Service (Web App for Containers)

Single Linux container, managed TLS/HTTPS, system-managed identity, and a
first-class GitHub Actions deploy path. No Kubernetes overhead. **B2** tier is
the practical minimum because docling's layout models are CPU-bound.

---

## Option 1 — Provision manually (Portal), connection-string auth

This matches a "create resources in the Portal, paste connection strings"
workflow.

### Resources to create

1. **Resource group** — e.g. `pacifican-parse-rg`, region *Canada Central*.
2. **Storage account (ADLS Gen2)** — Standard / LRS, and in the **Advanced**
   tab toggle **Enable hierarchical namespace** ✅ (this is what makes it Gen2).
3. **Two containers** inside it: `originals` and `parsed-json`.
4. **Azure Container Registry** — SKU *Basic*; enable **Admin user** under
   *Access keys*.
5. **Web App for Containers** — Publish = *Container*, OS = *Linux*, Plan = *B2*.

### Configure the Web App

Web App → *Settings → Environment variables → App settings*, add:

| Name | Value |
|------|-------|
| `STORAGE_BACKEND` | `adls` |
| `ADLS_CONNECTION_STRING` | *(paste the storage account connection string)* |
| `ADLS_ORIGINALS_FILESYSTEM` | `originals` |
| `ADLS_JSON_FILESYSTEM` | `parsed-json` |
| `DOCLING_DO_OCR` | `true` |
| `DOCLING_DO_TABLE_STRUCTURE` | `true` |
| `ENVIRONMENT` | `azure` |
| `WEBSITES_PORT` | `8000` |
| `CORS_ORIGINS` | `https://<your-app>.azurewebsites.net` |

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

- **Cold start / models:** docling downloads layout + OCR models on first parse.
  The `Dockerfile` has a commented line to warm them at build time — uncomment
  it to bake models into the image and avoid the first-request delay.
- **Long parses:** for large documents, move parsing to a background worker
  (Container Apps job or queue + worker) and poll document status
  (`uploaded → parsing → parsed`). The status field already exists.
- **Vector ingest (production):** wire `backend/app/routers/ingest.py` to Azure
  AI Search to make the Ingest module write real embeddings.
