// PacifiCan Parse Studio — Azure infrastructure
// Deploy: az deployment group create -g <rg> -f infra/main.bicep -p @infra/main.parameters.json
//
// Creates:
//   • ADLS Gen2 storage account with two containers (originals / parsed-json)
//   • Azure Container Registry (Basic)
//   • App Service Plan (Linux B2) + Web App for Containers
//   • System-assigned managed identity on the web app
//   • RBAC: Storage Blob Data Contributor + AcrPull for the managed identity

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Short prefix used to name all resources (3-8 lowercase alphanum)')
param prefix string = 'pacifican'

@description('App Service SKU — B2 minimum for docling CPU workload')
param appServiceSku string = 'B2'

@description('Name of the ADLS container for original uploaded files')
param originalsContainer string = 'originals'

@description('Name of the ADLS container for parsed JSON content')
param jsonContainer string = 'parsed-json'

// ── Derived names ──────────────────────────────────────────────────────────
var saName   = '${replace(prefix, '-', '')}parse'
var acrName  = '${replace(prefix, '-', '')}acr'
var planName = '${prefix}-plan'
var appName  = '${prefix}-parse-studio'

// ── Storage Account (ADLS Gen2) ────────────────────────────────────────────
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: saName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    isHnsEnabled: true                // hierarchical namespace = ADLS Gen2
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}

// Container for original uploaded files
resource originalsFs 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  name: '${storageAccount.name}/default/${originalsContainer}'
  properties: { publicAccess: 'None' }
}

// Container for final parsed JSON content
resource jsonFs 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  name: '${storageAccount.name}/default/${jsonContainer}'
  properties: { publicAccess: 'None' }
}

// ── Azure Container Registry ───────────────────────────────────────────────
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

// ── App Service Plan ───────────────────────────────────────────────────────
resource plan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: planName
  location: location
  kind: 'Linux'
  sku: { name: appServiceSku }
  properties: { reserved: true }
}

// ── Web App for Containers ─────────────────────────────────────────────────
resource webApp 'Microsoft.Web/sites@2023-01-01' = {
  name: appName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOCKER|mcr.microsoft.com/appsvc/staticsite:latest'  // overwritten by CI
      acrUseManagedIdentityCreds: true
      alwaysOn: true   // keep the worker warm so background parse tasks survive
      appSettings: [
        { name: 'STORAGE_BACKEND',               value: 'adls' }
        { name: 'ADLS_ACCOUNT_NAME',             value: storageAccount.name }
        { name: 'ADLS_ORIGINALS_FILESYSTEM',     value: originalsContainer }
        { name: 'ADLS_JSON_FILESYSTEM',          value: jsonContainer }
        { name: 'DOCLING_DO_OCR',                value: 'true' }
        { name: 'DOCLING_DO_TABLE_STRUCTURE',    value: 'true' }
        { name: 'DOCLING_OCR_MODE',              value: 'auto' }
        { name: 'ENVIRONMENT',                   value: 'azure' }
        { name: 'WEBSITES_PORT',                 value: '8000' }
        { name: 'CORS_ORIGINS',                  value: 'https://${appName}.azurewebsites.net' }
      ]
    }
  }
}

// ── Role assignments for managed identity ─────────────────────────────────
var storageBlobContributor = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
var acrPull = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')

resource storageRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, webApp.id, storageBlobContributor)
  scope: storageAccount
  properties: {
    roleDefinitionId: storageBlobContributor
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource acrRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, webApp.id, acrPull)
  scope: acr
  properties: {
    roleDefinitionId: acrPull
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ── Outputs ────────────────────────────────────────────────────────────────
output webAppUrl        string = 'https://${webApp.properties.defaultHostName}'
output acrLoginServer   string = acr.properties.loginServer
output storageAccount   string = storageAccount.name
output appName          string = webApp.name
output resourceGroup    string = resourceGroup().name
