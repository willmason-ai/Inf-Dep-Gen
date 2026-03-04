// ============================================================================
// Infrastructure Deployment Generator — NSG Rule Generator
// ============================================================================
// Generates Network Security Group ARM fragments per server.
// Rules: Deny public inbound, allow VNet, server-type-specific ports.
// ============================================================================

// ---------------------------------------------------------------------------
// Server-type-specific port rules
// ---------------------------------------------------------------------------
const serverPortRules = {
  odb: [
    { name: 'Allow-SSH-VNet', port: 22, protocol: 'Tcp', description: 'SSH access from VNet' },
    { name: 'Allow-Oracle-VNet', port: '1521-1525', protocol: 'Tcp', description: 'Oracle Net Listener from VNet' },
    { name: 'Allow-Oracle-EM-VNet', port: 5500, protocol: 'Tcp', description: 'Oracle Enterprise Manager from VNet' },
  ],
  sql: [
    { name: 'Allow-RDP-VNet', port: 3389, protocol: 'Tcp', description: 'RDP access from VNet' },
    { name: 'Allow-SQL-VNet', port: 1433, protocol: 'Tcp', description: 'SQL Server from VNet' },
    { name: 'Allow-SQL-Browser-VNet', port: 1434, protocol: 'Udp', description: 'SQL Browser from VNet' },
  ],
};

// ---------------------------------------------------------------------------
// Common baseline rules (applied to all servers)
// ---------------------------------------------------------------------------
const baselineRules = [
  {
    name: 'Deny-All-Inbound-Public',
    priority: 4096,
    direction: 'Inbound',
    access: 'Deny',
    protocol: '*',
    sourceAddressPrefix: 'Internet',
    sourcePortRange: '*',
    destinationAddressPrefix: '*',
    destinationPortRange: '*',
    description: 'Deny all inbound traffic from the internet',
  },
  {
    name: 'Allow-VNet-Inbound',
    priority: 100,
    direction: 'Inbound',
    access: 'Allow',
    protocol: '*',
    sourceAddressPrefix: 'VirtualNetwork',
    sourcePortRange: '*',
    destinationAddressPrefix: 'VirtualNetwork',
    destinationPortRange: '*',
    description: 'Allow all inbound traffic within VNet',
  },
  {
    name: 'Allow-AzureLoadBalancer-Inbound',
    priority: 200,
    direction: 'Inbound',
    access: 'Allow',
    protocol: '*',
    sourceAddressPrefix: 'AzureLoadBalancer',
    sourcePortRange: '*',
    destinationAddressPrefix: '*',
    destinationPortRange: '*',
    description: 'Allow Azure Load Balancer health probes',
  },
];

// ---------------------------------------------------------------------------
// Build security rules array
// ---------------------------------------------------------------------------
function buildSecurityRules(spec) {
  const rules = [];
  let priority = 300; // Start after baseline rules

  // Add server-type-specific port rules
  const portRules = serverPortRules[spec.serverType] || [];
  for (const rule of portRules) {
    rules.push({
      name: rule.name,
      properties: {
        priority,
        direction: 'Inbound',
        access: 'Allow',
        protocol: rule.protocol,
        sourceAddressPrefix: 'VirtualNetwork',
        sourcePortRange: '*',
        destinationAddressPrefix: '*',
        destinationPortRange: String(rule.port),
        description: rule.description,
      },
    });
    priority += 100;
  }

  // Add baseline rules
  for (const rule of baselineRules) {
    rules.push({
      name: rule.name,
      properties: {
        priority: rule.priority,
        direction: rule.direction,
        access: rule.access,
        protocol: rule.protocol,
        sourceAddressPrefix: rule.sourceAddressPrefix,
        sourcePortRange: rule.sourcePortRange,
        destinationAddressPrefix: rule.destinationAddressPrefix,
        destinationPortRange: rule.destinationPortRange,
        description: rule.description,
      },
    });
  }

  return rules;
}

// ---------------------------------------------------------------------------
// Main generator: produce NSG ARM fragment from a server spec
// ---------------------------------------------------------------------------
export function generateNsgRules(spec) {
  const nsgName = `${spec.hostname}-nsg`;
  const regionDefault = spec.regionCode === 'wus2' ? 'westus2' : 'eastus2';
  const securityRules = buildSecurityRules(spec);

  const standardTags = {
    Environment: spec.tags?.Environment || 'Prod',
    Owner: spec.tags?.Owner || 'MISSING-TAG-VALUE',
    'Cost Center': spec.tags?.['Cost Center'] || 'MISSING-TAG-VALUE',
    Application: spec.tags?.Application || 'MISSING-TAG-VALUE',
    ...(spec.tags || {}),
  };

  // ARM template fragment for the NSG
  const template = {
    $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
    contentVersion: '1.0.0.0',
    parameters: {
      location: {
        type: 'string',
        defaultValue: regionDefault,
      },
    },
    resources: [
      {
        type: 'Microsoft.Network/networkSecurityGroups',
        apiVersion: '2023-09-01',
        name: nsgName,
        location: '[parameters(\'location\')]',
        properties: {
          securityRules,
        },
        tags: {
          ...standardTags,
          ServerName: spec.hostname,
        },
      },
    ],
    outputs: {
      nsgId: {
        type: 'string',
        value: `[resourceId('Microsoft.Network/networkSecurityGroups', '${nsgName}')]`,
      },
      nsgName: {
        type: 'string',
        value: nsgName,
      },
    },
  };

  const summary = {
    hostname: spec.hostname,
    nsgName,
    region: regionDefault,
    serverType: spec.serverType,
    ruleCount: securityRules.length,
    rules: securityRules.map(r => ({
      name: r.name,
      priority: r.properties.priority,
      access: r.properties.access,
      port: r.properties.destinationPortRange,
      description: r.properties.description,
    })),
  };

  return { template, summary };
}

export default { generateNsgRules };
