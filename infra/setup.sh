#!/usr/bin/env bash
# =============================================================================
# PacifiCan Parse Studio — Azure infrastructure provisioning
#
# Run once to create all resources. Re-running is safe (most az commands are
# idempotent). Requires: Azure CLI (az), logged in with Owner or Contributor
# on the target subscription.
#
# Usage:
#   chmod +x infra/setup.sh
#   ./infra/setup.sh          # uses defaults below
#   LOCATION=canadaeast ./infra/setup.sh
# =============================================================================
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
LOCATION="${LOCATION:-canadacentral}"
RG="${RG:-pacifican-parse-rg}"
SA="${SA:-pacificanparse}"           # storage account (3-24 lowercase alphanum)
ACR="${ACR:-pacificanacr}"           # container registry name
PLAN="${PLAN:-pacifican-plan}"
APP="${APP:-pacifican-parse-studio}"

ORIGINALS_CONTAINER="originalfiles"
JSON_CONTAINER="parsedjsons"

GITHUB_ORG="${GITHUB_ORG:-rahulpyne}"
GITHUB_REPO="${GITHUB_REPO:-PacifiCanOCR}"

# ── Colour helpers ────────────────────────────────────────────────────────────
bold=$(tput bold 2>/dev/null || true)
reset=$(tput sgr0 2>/dev/null || true)
info()  { echo "${bold}[setup]${reset} $*"; }
ok()    { echo "${bold}[  ok ]${reset} $*"; }
warn()  { echo "${bold}[ warn]${reset} $*"; }

# ── 1. Resource group ─────────────────────────────────────────────────────────
info "Creating resource group $RG in $LOCATION..."
az group create --name "$RG" --location "$LOCATION" --output none
ok "Resource group: $RG"

# ── 2. ADLS Gen2 storage account ──────────────────────────────────────────────
info "Creating ADLS Gen2 storage account $SA..."
az storage account create \
  --name "$SA" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --kind StorageV2 \
  --hns true \
  --min-tls-version TLS1_2 \
  --allow-blob-public-access false \
  --output none
ok "Storage account: $SA (hierarchical namespace = ADLS Gen2)"

# Create the two containers (ADLS filesystems)
for CONTAINER in "$ORIGINALS_CONTAINER" "$JSON_CONTAINER"; do
  info "Creating ADLS container: $CONTAINER..."
  az storage fs create \
    --name "$CONTAINER" \
    --account-name "$SA" \
    --auth-mode login \
    --output none 2>/dev/null || warn "$CONTAINER already exists, skipping"
  ok "Container: $CONTAINER"
done

# ── 3. Azure Container Registry ───────────────────────────────────────────────
info "Creating container registry $ACR..."
az acr create \
  --name "$ACR" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --sku Basic \
  --admin-enabled false \
  --output none
ok "Registry: $ACR.azurecr.io"

# ── 4. App Service Plan (Linux, B2 for docling CPU) ───────────────────────────
info "Creating App Service plan $PLAN (B2)..."
az appservice plan create \
  --name "$PLAN" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --is-linux \
  --sku B2 \
  --output none
ok "Plan: $PLAN (B2)"

# ── 5. Web App for Containers ─────────────────────────────────────────────────
info "Creating Web App $APP..."
# Use a placeholder image until the first GitHub Actions deploy
az webapp create \
  --name "$APP" \
  --resource-group "$RG" \
  --plan "$PLAN" \
  --deployment-container-image-name "mcr.microsoft.com/appsvc/staticsite:latest" \
  --output none
ok "Web App: https://$APP.azurewebsites.net"

# ── 6. Managed Identity for the Web App ───────────────────────────────────────
info "Assigning system-managed identity to $APP..."
az webapp identity assign \
  --name "$APP" \
  --resource-group "$RG" \
  --output none
PRINCIPAL_ID=$(az webapp identity show \
  --name "$APP" \
  --resource-group "$RG" \
  --query principalId --output tsv)
ok "Principal ID: $PRINCIPAL_ID"

# ── 7. RBAC: Web App → ADLS (Storage Blob Data Contributor) ───────────────────
SA_SCOPE=$(az storage account show \
  --name "$SA" \
  --resource-group "$RG" \
  --query id --output tsv)
info "Granting Storage Blob Data Contributor on storage account..."
az role assignment create \
  --assignee "$PRINCIPAL_ID" \
  --role "Storage Blob Data Contributor" \
  --scope "$SA_SCOPE" \
  --output none
ok "RBAC: $APP → $SA (Storage Blob Data Contributor)"

# ── 8. RBAC: Web App → ACR (AcrPull) ──────────────────────────────────────────
ACR_SCOPE=$(az acr show \
  --name "$ACR" \
  --resource-group "$RG" \
  --query id --output tsv)
info "Granting AcrPull on container registry..."
az role assignment create \
  --assignee "$PRINCIPAL_ID" \
  --role "AcrPull" \
  --scope "$ACR_SCOPE" \
  --output none
ok "RBAC: $APP → $ACR (AcrPull)"

# Configure App Service to pull from ACR using managed identity
az webapp config container set \
  --name "$APP" \
  --resource-group "$RG" \
  --container-registry-url "https://$ACR.azurecr.io" \
  --container-registry-user "" \
  --container-registry-password "" \
  --output none 2>/dev/null || true

az resource update \
  --ids "$(az webapp show --name "$APP" --resource-group "$RG" --query id --output tsv)/config/web" \
  --set properties.acrUseManagedIdentityCreds=true \
  --output none 2>/dev/null || true

# ── 9. App Service settings ────────────────────────────────────────────────────
info "Configuring app settings..."
az webapp config appsettings set \
  --name "$APP" \
  --resource-group "$RG" \
  --output none \
  --settings \
    STORAGE_BACKEND=adls \
    ADLS_ACCOUNT_NAME="$SA" \
    ADLS_ORIGINALS_FILESYSTEM="$ORIGINALS_CONTAINER" \
    ADLS_JSON_FILESYSTEM="$JSON_CONTAINER" \
    DOCLING_DO_OCR=true \
    DOCLING_DO_TABLE_STRUCTURE=true \
    ENVIRONMENT=azure \
    CORS_ORIGINS="https://$APP.azurewebsites.net" \
    WEBSITES_PORT=8000
ok "App settings configured"

# ── 10. GitHub Actions OIDC federated identity ────────────────────────────────
info "Setting up OIDC federated credentials for GitHub Actions..."
SUBSCRIPTION_ID=$(az account show --query id --output tsv)
TENANT_ID=$(az account show --query tenantId --output tsv)

# Service principal for GitHub Actions (deploy-only, Contributor on RG + AcrPush)
SP_NAME="pacifican-github-actions"
SP_APP_ID=$(az ad app list --display-name "$SP_NAME" --query "[0].appId" --output tsv)

if [[ -z "$SP_APP_ID" || "$SP_APP_ID" == "None" ]]; then
  info "Creating service principal $SP_NAME..."
  SP_APP_ID=$(az ad app create --display-name "$SP_NAME" --query appId --output tsv)
  az ad sp create --id "$SP_APP_ID" --output none
fi
ok "Service principal app ID: $SP_APP_ID"

# Assign roles
RG_SCOPE="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RG"
for ROLE in "Contributor" "AcrPush"; do
  az role assignment create \
    --assignee "$SP_APP_ID" \
    --role "$ROLE" \
    --scope "$RG_SCOPE" \
    --output none 2>/dev/null || true
done
ok "Roles assigned: Contributor + AcrPush on $RG"

# Federated credential for main branch pushes
SP_OBJECT_ID=$(az ad sp show --id "$SP_APP_ID" --query id --output tsv)
SUBJECT="repo:$GITHUB_ORG/$GITHUB_REPO:ref:refs/heads/main"
EXISTING=$(az ad app federated-credential list --id "$SP_APP_ID" --query "[?subject=='$SUBJECT'].id" --output tsv)
if [[ -z "$EXISTING" ]]; then
  az ad app federated-credential create \
    --id "$SP_APP_ID" \
    --parameters "{
      \"name\": \"github-main\",
      \"issuer\": \"https://token.actions.githubusercontent.com\",
      \"subject\": \"$SUBJECT\",
      \"audiences\": [\"api://AzureADTokenExchange\"]
    }" \
    --output none
  ok "Federated credential created for branch: main"
else
  ok "Federated credential already exists"
fi

# ── 11. Summary: GitHub Secrets to add ────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Add these secrets to:"
echo " https://github.com/$GITHUB_ORG/$GITHUB_REPO/settings/secrets/actions"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " AZURE_CLIENT_ID       = $SP_APP_ID"
echo " AZURE_TENANT_ID       = $TENANT_ID"
echo " AZURE_SUBSCRIPTION_ID = $SUBSCRIPTION_ID"
echo " ACR_NAME              = $ACR"
echo " APP_NAME              = $APP"
echo " RESOURCE_GROUP        = $RG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
ok "Setup complete. Push to main to trigger the first deployment."
