# Azure deployment guide

This app is designed to run on **Azure App Service** or **Azure Web App for
Containers**, with originals and final JSON stored in **Azure Data Lake Storage
Gen2 (ADLS)** containers. The storage backend is swapped with a single env var
— no code changes between local and Azure.

## 1. Provision storage (ADLS Gen2)

```bash
RG=pacifican-rg
LOC=canadacentral
SA=pacificanparse$RANDOM   # storage account name (globally unique, lowercase)

az group create -n $RG -l $LOC

# Storage account WITH hierarchical namespace = ADLS Gen2
az storage account create -n $SA -g $RG -l $LOC \
  --sku Standard_LRS --kind StorageV2 --hns true

# One filesystem (container); the app uses prefixes inside it
az storage fs create -n parse-studio --account-name $SA --auth-mode login
```

The app writes:

```
parse-studio/
  originals/<doc_id>/<filename>     # original uploaded files
  parsed/<doc_id>/parsed.json        # final JSON content
  records/<doc_id>.json              # document metadata
```

## 2. Build the container image

A multi-stage `Dockerfile` (repo root) builds the React frontend and serves it
plus the FastAPI API from one image.

```bash
ACR=pacificanacr
az acr create -n $ACR -g $RG --sku Basic --admin-enabled true
az acr build -t parse-studio:latest -r $ACR .
```

## 3. Deploy (Web App for Containers)

```bash
PLAN=pacifican-plan
APP=pacifican-parse-studio

az appservice plan create -g $RG -n $PLAN --is-linux --sku B2
az webapp create -g $RG -p $PLAN -n $APP \
  --deployment-container-image-name $ACR.azurecr.io/parse-studio:latest

# Use managed identity to reach ADLS (no secrets in config)
az webapp identity assign -g $RG -n $APP
PRINCIPAL=$(az webapp identity show -g $RG -n $APP --query principalId -o tsv)
SCOPE=$(az storage account show -n $SA -g $RG --query id -o tsv)
az role assignment create --assignee $PRINCIPAL \
  --role "Storage Blob Data Contributor" --scope $SCOPE
```

## 4. Configure app settings

```bash
az webapp config appsettings set -g $RG -n $APP --settings \
  STORAGE_BACKEND=adls \
  ADLS_ACCOUNT_NAME=$SA \
  ADLS_FILESYSTEM=parse-studio \
  ADLS_ORIGINALS_PREFIX=originals \
  ADLS_JSON_PREFIX=parsed \
  ENVIRONMENT=azure \
  CORS_ORIGINS=https://$APP.azurewebsites.net \
  WEBSITES_PORT=8000
```

`ADLS_ACCOUNT_NAME` + managed identity is the recommended auth path
(`DefaultAzureCredential`). For local-to-cloud testing you can instead set
`ADLS_CONNECTION_STRING`.

## 5. Notes

- **Model cache / cold start:** docling downloads layout + OCR models on first
  use. Bake them into the image (warm the converter at build time) or mount a
  persistent volume so restarts don't re-download. The B2+ tier is recommended
  for the CPU-bound layout models.
- **Large files / long parses:** for big documents, move parsing to a background
  worker (Azure Container Apps job or a queue + worker) and have the UI poll
  document status (`uploaded → parsing → parsed`). The status field already
  exists in the model.
- **Vector ingest (production):** wire `routers/ingest.py` to Azure AI Search to
  make the Ingest module write real embeddings.
