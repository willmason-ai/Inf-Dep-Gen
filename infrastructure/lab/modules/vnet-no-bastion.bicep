// ============================================================================
// VNet without Bastion Module
// Creates: NSG, VNet (compute subnet only)
// ============================================================================

param location string
param vnetName string
param vnetAddressPrefix string
param computeSubnetName string
param computeSubnetPrefix string
param nsgName string
param tags object

// ============================================================================
// NSG for Compute Subnet
// ============================================================================

resource computeNsg 'Microsoft.Network/networkSecurityGroups@2024-01-01' = {
  name: nsgName
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'AllowVnetInbound'
        properties: {
          priority: 200
          direction: 'Inbound'
          access: 'Allow'
          protocol: '*'
          sourceAddressPrefix: 'VirtualNetwork'
          sourcePortRange: '*'
          destinationAddressPrefix: 'VirtualNetwork'
          destinationPortRange: '*'
          description: 'Allow all intra-VNet and peered VNet traffic'
        }
      }
      {
        name: 'DenyAllInbound'
        properties: {
          priority: 4096
          direction: 'Inbound'
          access: 'Deny'
          protocol: '*'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '*'
          description: 'Deny all other inbound traffic'
        }
      }
    ]
  }
}

// ============================================================================
// Virtual Network
// ============================================================================

resource vnet 'Microsoft.Network/virtualNetworks@2024-01-01' = {
  name: vnetName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        vnetAddressPrefix
      ]
    }
    subnets: [
      {
        name: computeSubnetName
        properties: {
          addressPrefix: computeSubnetPrefix
          networkSecurityGroup: {
            id: computeNsg.id
          }
          privateEndpointNetworkPolicies: 'Enabled'
        }
      }
    ]
  }
}

// ============================================================================
// Outputs
// ============================================================================

output vnetId string = vnet.id
output vnetName string = vnet.name
output computeSubnetId string = vnet.properties.subnets[0].id
