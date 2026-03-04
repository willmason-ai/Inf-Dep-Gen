// ============================================================================
// Infrastructure Deployment Generator — App Service + Cosmos DB
// ============================================================================
// Deploys:
//   - App Service Plan (Linux, B1 for lab)
//   - App Service (Node.js 20 LTS)
//   - Cosmos DB account + database + containers
//   - Application Insights
//   - Optional: Private Endpoint for App Service (public/private toggle)
//
// Deploy to resource group:
//   az deployment group create -g rg-willmason-epic-vm \
//     --template-file app-service.bicep \
//     --parameters publicAccess=true
//
// To flip from public to private:
//   az deployment group create -g rg-willmason-epic-vm \
//     --template-file app-service.bicep \
//     --parameters publicAccess=false
// ============================================================================

param location string = resourceGroup().location

@description('Toggle public network access. Set to false to restrict to private endpoint only.')
param publicAccess bool = true

@description('VNet resource ID for private endpoint (required when publicAccess=false)')
param vnetId string = ''

@description('Subnet resource ID for private endpoint (required when publicAccess=false)')
param privateEndpointSubnetId string = ''

@description('App Service Plan SKU. F1 (free) for quota-limited subs, B1 for lab, S1+ for production.')
@allowed([
  'F1'
  'B1'
  'B2'
  'S1'
  'S2'
  'P1v3'
  'P2v3'
])
param appServiceSku string = 'B1'

@description('Cosmos DB throughput mode')
@allowed([
  'Serverless'
  'Provisioned'
])
param cosmosDbMode string = 'Serverless'

@secure()
@description('Anthropic API key for Claude')
param anthropicApiKey string = ''

@description('Service Principal Client ID for Azure operations')
param spClientId string = ''

@secure()
@description('Service Principal Client Secret')
param spClientSecret string = ''

param tags object = {
  Environment: 'Lab'
  Owner: 'Presidio'
  'Cost Center': 'IT'
  Application: 'Epic Orchestrator'
}

// ============================================================================
// Variables
// ============================================================================

var appName = 'inf-dep-gen-lab'
var cosmosAccountName = 'cosmos-inf-dep-gen-lab'
var appInsightsName = 'ai-inf-dep-gen-lab'
var appServicePlanName = 'asp-inf-dep-gen-lab'
var cosmosDbName = 'infDepGen'

// ============================================================================
// App Service Plan
// ============================================================================

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  tags: tags
  kind: 'linux'
  sku: {
    name: appServiceSku
  }
  properties: {
    reserved: true // Required for Linux
  }
}

// ============================================================================
// App Service
// ============================================================================

resource appService 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  tags: tags
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    publicNetworkAccess: publicAccess ? 'Enabled' : 'Disabled'
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      alwaysOn: appServiceSku != 'B1' && appServiceSku != 'F1' // Free and Basic don't support alwaysOn
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      appSettings: [
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~20'
        }
        {
          name: 'COSMOS_DB_ENDPOINT'
          value: cosmosAccount.properties.documentEndpoint
        }
        {
          name: 'COSMOS_DB_KEY'
          value: cosmosAccount.listKeys().primaryMasterKey
        }
        {
          name: 'COSMOS_DB_DATABASE'
          value: cosmosDbName
        }
        {
          name: 'ANTHROPIC_API_KEY'
          value: anthropicApiKey
        }
        {
          name: 'CLAUDE_MODEL'
          value: 'claude-opus-4-6'
        }
        {
          name: 'AZURE_TENANT_ID'
          value: tenant().tenantId
        }
        {
          name: 'AZURE_CLIENT_ID'
          value: spClientId
        }
        {
          name: 'AZURE_CLIENT_SECRET'
          value: spClientSecret
        }
        {
          name: 'AZURE_SUBSCRIPTION_ID'
          value: subscription().subscriptionId
        }
        {
          name: 'APP_ENVIRONMENT'
          value: 'lab'
        }
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: appInsights.properties.InstrumentationKey
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
      ]
    }
  }
}

// ============================================================================
// Private Endpoint (only when publicAccess=false)
// ============================================================================

resource privateEndpoint 'Microsoft.Network/privateEndpoints@2024-01-01' = if (!publicAccess && privateEndpointSubnetId != '') {
  name: '${appName}-pe'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: '${appName}-plsc'
        properties: {
          privateLinkServiceId: appService.id
          groupIds: [
            'sites'
          ]
        }
      }
    ]
  }
}

// ============================================================================
// Cosmos DB Account
// ============================================================================

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-02-15-preview' = {
  name: cosmosAccountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: cosmosDbMode == 'Serverless' ? [
      {
        name: 'EnableServerless'
      }
    ] : []
    publicNetworkAccess: publicAccess ? 'Enabled' : 'Disabled'
  }
}

// ============================================================================
// Cosmos DB Database
// ============================================================================

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-02-15-preview' = {
  parent: cosmosAccount
  name: cosmosDbName
  properties: {
    resource: {
      id: cosmosDbName
    }
  }
}

// ============================================================================
// Cosmos DB Containers
// ============================================================================

var containers = [
  { name: 'serverSpecs', partitionKey: '/hostname' }
  { name: 'generatedArtifacts', partitionKey: '/hostname' }
  { name: 'auditLog', partitionKey: '/timestamp' }
  { name: 'chatHistory', partitionKey: '/sessionId' }
  { name: 'deficiencies', partitionKey: '/hostname' }
  { name: 'guardrailRules', partitionKey: '/ruleCategory' }
  { name: 'appConfig', partitionKey: '/configKey' }
]

resource cosmosContainers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-02-15-preview' = [for container in containers: {
  parent: cosmosDatabase
  name: container.name
  properties: {
    resource: {
      id: container.name
      partitionKey: {
        paths: [
          container.partitionKey
        ]
        kind: 'Hash'
      }
      defaultTtl: container.name == 'chatHistory' ? 31536000 : -1 // Chat: 1 year TTL, others: no expiry
    }
  }
}]

// ============================================================================
// Application Insights
// ============================================================================

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    RetentionInDays: 30
  }
}

// ============================================================================
// Outputs
// ============================================================================

output appServiceUrl string = 'https://${appService.properties.defaultHostName}'
output appServiceName string = appService.name
output cosmosDbEndpoint string = cosmosAccount.properties.documentEndpoint
output cosmosDbName string = cosmosDbName
output appInsightsKey string = appInsights.properties.InstrumentationKey
output publicAccessEnabled bool = publicAccess
output privateEndpointId string = (!publicAccess && privateEndpointSubnetId != '') ? privateEndpoint.id : 'N/A - public access enabled'
