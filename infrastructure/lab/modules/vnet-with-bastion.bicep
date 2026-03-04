// ============================================================================
// VNet with Bastion Module
// Creates: NSG, VNet (compute subnet + AzureBastionSubnet), Bastion, Public IP
// ============================================================================

param location string
param vnetName string
param vnetAddressPrefix string
param computeSubnetName string
param computeSubnetPrefix string
param bastionSubnetPrefix string
param deployBastion bool = true
param bastionName string
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
        name: 'AllowBastionInbound'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: bastionSubnetPrefix
          sourcePortRange: '*'
          destinationAddressPrefix: computeSubnetPrefix
          destinationPortRanges: [
            '22'
            '3389'
          ]
          description: 'Allow SSH and RDP from Bastion subnet'
        }
      }
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
      {
        name: 'AzureBastionSubnet'
        properties: {
          addressPrefix: bastionSubnetPrefix
          // Bastion subnet must NOT have an NSG with custom rules that block its traffic
        }
      }
    ]
  }
}

// ============================================================================
// Bastion Public IP
// ============================================================================

resource bastionPip 'Microsoft.Network/publicIPAddresses@2024-01-01' = if (deployBastion) {
  name: '${bastionName}-pip'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
  }
  properties: {
    publicIPAllocationMethod: 'Static'
    publicIPAddressVersion: 'IPv4'
  }
}

// ============================================================================
// Azure Bastion
// ============================================================================

resource bastion 'Microsoft.Network/bastionHosts@2024-01-01' = if (deployBastion) {
  name: bastionName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    ipConfigurations: [
      {
        name: 'IpConf'
        properties: {
          subnet: {
            id: vnet.properties.subnets[1].id
          }
          publicIPAddress: {
            id: bastionPip.id
          }
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
output bastionSubnetId string = vnet.properties.subnets[1].id
