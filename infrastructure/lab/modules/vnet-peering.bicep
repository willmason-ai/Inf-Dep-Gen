// ============================================================================
// VNet Peering Module
// Creates a single peering direction (call twice for bidirectional)
// ============================================================================

param localVnetName string
param remoteVnetId string
param peeringName string

// ============================================================================
// VNet Peering
// ============================================================================

resource localVnet 'Microsoft.Network/virtualNetworks@2024-01-01' existing = {
  name: localVnetName
}

resource peering 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings@2024-01-01' = {
  parent: localVnet
  name: peeringName
  properties: {
    remoteVirtualNetwork: {
      id: remoteVnetId
    }
    allowVirtualNetworkAccess: true
    allowForwardedTraffic: true
    allowGatewayTransit: false
    useRemoteGateways: false
  }
}
