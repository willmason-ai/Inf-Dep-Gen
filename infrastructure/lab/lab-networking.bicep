// ============================================================================
// Infrastructure Deployment Generator — Lab Networking Infrastructure
// ============================================================================
// Creates:
//   - 2 Resource Groups (EUS2 + WUS2 compute)
//   - 2 Resource Groups (EUS2 + WUS2 networking)
//   - 2 Virtual Networks with subnets
//   - Bidirectional VNet peering between regions
//   - Azure Bastion in EUS2
//   - NSGs for compute subnets
//
// Deploy at SUBSCRIPTION scope:
//   az deployment sub create --location eastus2 --template-file lab-networking.bicep
// ============================================================================

targetScope = 'subscription'

// ============================================================================
// Parameters
// ============================================================================

@description('Primary region for lab environment')
param primaryLocation string = 'eastus2'

@description('Secondary region for lab environment')
param secondaryLocation string = 'westus2'

@description('Tags applied to all resources')
param tags object = {
  Environment: 'Lab'
  Owner: 'Presidio'
  'Cost Center': 'IT'
  Application: 'Epic'
  'Data Classification': 'Non-PHI'
  Project: 'Infrastructure Deployment Generator Lab'
}

// ============================================================================
// Resource Groups
// ============================================================================

resource rgEus2Compute 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'lab-eus2-rg-epic-prod-01'
  location: primaryLocation
  tags: tags
}

resource rgWus2Compute 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'lab-wus2-rg-epic-prod-01'
  location: secondaryLocation
  tags: tags
}

resource rgEus2Network 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'lab-eus2-rg-net-epic-01'
  location: primaryLocation
  tags: tags
}

resource rgWus2Network 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'lab-wus2-rg-net-epic-01'
  location: secondaryLocation
  tags: tags
}

// ============================================================================
// EUS2 Networking (VNet + Subnets + Bastion + NSG)
// ============================================================================

module eus2Network 'modules/vnet-with-bastion.bicep' = {
  name: 'eus2-networking'
  scope: rgEus2Network
  params: {
    location: primaryLocation
    vnetName: 'lab-eus2-vnet-epic-01'
    vnetAddressPrefix: '10.100.0.0/23'
    computeSubnetName: 'lab-eus2-sn-epicinf-01'
    computeSubnetPrefix: '10.100.0.0/24'
    bastionSubnetPrefix: '10.100.1.0/26'
    deployBastion: true
    bastionName: 'lab-eus2-bastion-epic-01'
    nsgName: 'lab-eus2-nsg-epicinf-01'
    tags: tags
  }
}

// ============================================================================
// WUS2 Networking (VNet + Subnets + NSG, no Bastion)
// ============================================================================

module wus2Network 'modules/vnet-no-bastion.bicep' = {
  name: 'wus2-networking'
  scope: rgWus2Network
  params: {
    location: secondaryLocation
    vnetName: 'lab-wus2-vnet-epic-01'
    vnetAddressPrefix: '10.100.2.0/23'
    computeSubnetName: 'lab-wus2-sn-epicinf-01'
    computeSubnetPrefix: '10.100.2.0/24'
    nsgName: 'lab-wus2-nsg-epicinf-01'
    tags: tags
  }
}

// ============================================================================
// VNet Peering (Bidirectional: EUS2 ↔ WUS2)
// ============================================================================

module eus2ToWus2Peering 'modules/vnet-peering.bicep' = {
  name: 'eus2-to-wus2-peering'
  scope: rgEus2Network
  params: {
    localVnetName: 'lab-eus2-vnet-epic-01'
    remoteVnetId: wus2Network.outputs.vnetId
    peeringName: 'lab-eus2-to-wus2-peering'
  }
  dependsOn: [
    eus2Network
    wus2Network
  ]
}

module wus2ToEus2Peering 'modules/vnet-peering.bicep' = {
  name: 'wus2-to-eus2-peering'
  scope: rgWus2Network
  params: {
    localVnetName: 'lab-wus2-vnet-epic-01'
    remoteVnetId: eus2Network.outputs.vnetId
    peeringName: 'lab-wus2-to-eus2-peering'
  }
  dependsOn: [
    eus2Network
    wus2Network
  ]
}

// ============================================================================
// Outputs
// ============================================================================

output eus2VnetId string = eus2Network.outputs.vnetId
output eus2ComputeSubnetId string = eus2Network.outputs.computeSubnetId
output wus2VnetId string = wus2Network.outputs.vnetId
output wus2ComputeSubnetId string = wus2Network.outputs.computeSubnetId
output eus2ComputeRg string = rgEus2Compute.name
output wus2ComputeRg string = rgWus2Compute.name
output bastionName string = 'lab-eus2-bastion-epic-01'
