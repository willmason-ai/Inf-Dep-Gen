// ============================================================================
// Infrastructure Deployment Generator — ARM Template Generator
// ============================================================================
// Generates Azure Resource Manager (ARM) JSON templates from server specs.
// Supports both ODB (Linux) and SQL (Windows) server types.
// ============================================================================

import config from '../config/index.js';
import { getDiskPurposeSlug } from '../models/server-spec.js';

// ---------------------------------------------------------------------------
// Build standard tags object for a server spec
// ---------------------------------------------------------------------------
function buildStandardTags(spec) {
  return {
    Environment: spec.tags?.Environment || 'Prod',
    Owner: spec.tags?.Owner || 'MISSING-TAG-VALUE',
    'Cost Center': spec.tags?.['Cost Center'] || 'MISSING-TAG-VALUE',
    Application: spec.tags?.Application || 'MISSING-TAG-VALUE',
    ...(spec.tags || {}),
  };
}

// ---------------------------------------------------------------------------
// Determine disk storage profile based on environment
// ---------------------------------------------------------------------------
function getDiskStorageProfile(spec, diskSpec) {
  const isLab = config.environment === 'lab';

  if (isLab) {
    return {
      sku: { name: 'StandardSSD_LRS' },
      diskSizeGB: 4, // lab placeholder
    };
  }

  // Production — Premium SSD v2 with IOPS/throughput
  return {
    sku: { name: 'PremiumV2_LRS' },
    diskSizeGB: diskSpec.sizeGB,
    diskIOPSReadWrite: diskSpec.iops,
    diskMBpsReadWrite: diskSpec.throughputMBs,
  };
}

// ---------------------------------------------------------------------------
// Get VM size based on environment
// ---------------------------------------------------------------------------
function getVmSize(spec) {
  if (config.environment === 'lab') {
    return 'Standard_D8s_v5'; // lab uses a smaller common SKU
  }
  return spec.sku;
}

// ---------------------------------------------------------------------------
// Get OS disk config
// ---------------------------------------------------------------------------
function getOsDiskConfig(spec) {
  const isLinux = spec.serverType === 'odb';
  const isLab = config.environment === 'lab';

  return {
    createOption: 'FromImage',
    managedDisk: {
      storageAccountType: isLab ? 'StandardSSD_LRS' : 'Premium_LRS',
    },
    diskSizeGB: isLinux ? 64 : 128,
    caching: 'ReadWrite',
  };
}

// ---------------------------------------------------------------------------
// Get OS image reference
// ---------------------------------------------------------------------------
function getImageReference(spec) {
  if (spec.serverType === 'odb') {
    return {
      publisher: 'RedHat',
      offer: 'RHEL',
      sku: '8-lvm-gen2',
      version: 'latest',
    };
  }
  return {
    publisher: 'MicrosoftWindowsServer',
    offer: 'WindowsServer',
    sku: '2022-datacenter-g2',
    version: 'latest',
  };
}

// ---------------------------------------------------------------------------
// Build disk resources and data disk attachments
// Returns { diskResources, dataDisks, warnings }
// ---------------------------------------------------------------------------
function buildDiskResources(spec, standardTags) {
  const diskResources = [];
  const dataDisks = [];
  const warnings = [];
  let lun = 0;

  if (spec.serverType === 'odb' && spec.volumeGroups) {
    for (const vg of spec.volumeGroups) {
      const count = typeof vg.diskCount === 'number' ? vg.diskCount : 0;
      if (typeof vg.diskCount !== 'number') {
        warnings.push(`VolumeGroup "${vg.name}": diskCount is "${vg.diskCount}" (not a number) — skipping disk generation. Resolve TBD values in spec before deploying.`);
        continue;
      }

      for (let i = 0; i < count; i++) {
        const diskIndex = i + 1;
        const diskName = `${spec.hostname}-${vg.name}-disk${diskIndex}`;
        const storageProfile = getDiskStorageProfile(spec, vg);

        const diskResource = {
          type: 'Microsoft.Compute/disks',
          apiVersion: '2023-10-02',
          name: diskName,
          location: '[parameters(\'location\')]',
          sku: storageProfile.sku,
          properties: {
            creationData: { createOption: 'Empty' },
            diskSizeGB: storageProfile.diskSizeGB,
          },
          tags: {
            ...standardTags,
            VolumeGroup: vg.name,
            ServerName: spec.hostname,
            DiskIndex: String(diskIndex),
            LUN: String(lun),
          },
        };

        // Add IOPS/throughput for production Premium SSD v2
        if (storageProfile.diskIOPSReadWrite) {
          diskResource.properties.diskIOPSReadWrite = storageProfile.diskIOPSReadWrite;
          diskResource.properties.diskMBpsReadWrite = storageProfile.diskMBpsReadWrite;
        }

        diskResources.push(diskResource);

        dataDisks.push({
          lun,
          name: diskName,
          createOption: 'Attach',
          caching: 'None',
          managedDisk: {
            id: `[resourceId('Microsoft.Compute/disks', '${diskName}')]`,
          },
        });

        lun++;
      }
    }
  }

  if (spec.serverType === 'sql' && spec.diskGroups) {
    for (const dg of spec.diskGroups) {
      if (typeof dg.diskCount !== 'number') {
        warnings.push(`DiskGroup "${dg.purpose}": diskCount is "${dg.diskCount}" (not a number) — skipping disk generation. Resolve TBD values in spec before deploying.`);
        continue;
      }
      const count = dg.diskCount;
      const purposeSlug = getDiskPurposeSlug(dg.purpose);

      for (let i = 0; i < count; i++) {
        const diskIndex = i + 1;
        const diskName = `${spec.hostname}-${purposeSlug}-disk${diskIndex}`;
        const storageProfile = getDiskStorageProfile(spec, dg);

        const diskResource = {
          type: 'Microsoft.Compute/disks',
          apiVersion: '2023-10-02',
          name: diskName,
          location: '[parameters(\'location\')]',
          sku: storageProfile.sku,
          properties: {
            creationData: { createOption: 'Empty' },
            diskSizeGB: storageProfile.diskSizeGB,
          },
          tags: {
            ...standardTags,
            DiskPurpose: dg.purpose,
            ServerName: spec.hostname,
            DiskIndex: String(diskIndex),
            LUN: String(lun),
          },
        };

        if (storageProfile.diskIOPSReadWrite) {
          diskResource.properties.diskIOPSReadWrite = storageProfile.diskIOPSReadWrite;
          diskResource.properties.diskMBpsReadWrite = storageProfile.diskMBpsReadWrite;
        }

        diskResources.push(diskResource);

        dataDisks.push({
          lun,
          name: diskName,
          createOption: 'Attach',
          caching: 'None',
          managedDisk: {
            id: `[resourceId('Microsoft.Compute/disks', '${diskName}')]`,
          },
        });

        lun++;
      }
    }
  }

  return { diskResources, dataDisks, warnings };
}

// ---------------------------------------------------------------------------
// Main generator: produce ARM template JSON from a server spec
// Options: { nsgId } — optional NSG resource ID to associate with the NIC
// ---------------------------------------------------------------------------
export function generateArmTemplate(spec, options = {}) {
  const vmName = spec.hostname;
  const nicName = `${vmName}-nic`;
  const isLinux = spec.serverType === 'odb';
  const standardTags = buildStandardTags(spec);
  const regionDefault = spec.regionCode === 'wus2' ? 'westus2' : 'eastus2';

  // Build parameters
  const parameters = {
    location: {
      type: 'string',
      defaultValue: regionDefault,
    },
    vnetName: {
      type: 'string',
      metadata: { description: 'Name of the existing VNet' },
    },
    subnetName: {
      type: 'string',
      metadata: { description: 'Name of the existing subnet' },
    },
    vnetResourceGroup: {
      type: 'string',
      metadata: { description: 'Resource group containing the VNet' },
    },
    adminUsername: {
      type: 'string',
      defaultValue: config.auth?.adminUsername || 'admin',
    },
    adminPasswordOrKey: {
      type: 'securestring',
      metadata: {
        description: isLinux
          ? 'SSH public key or password for the admin user'
          : 'Admin password for the VM',
      },
    },
  };

  // Optional NSG ID parameter
  if (options.nsgId) {
    parameters.nsgId = {
      type: 'string',
      defaultValue: options.nsgId,
      metadata: { description: 'Resource ID of the NSG to associate with the NIC' },
    };
  }

  // Linux also gets authenticationType parameter
  if (isLinux) {
    parameters.authenticationType = {
      type: 'string',
      defaultValue: 'sshPublicKey',
      allowedValues: ['sshPublicKey', 'password'],
    };
  }

  // Build variables
  const variables = {
    vmName,
    vmSize: getVmSize(spec),
    nicName,
    subnetId: "[resourceId(parameters('vnetResourceGroup'), 'Microsoft.Network/virtualNetworks/subnets', parameters('vnetName'), parameters('subnetName'))]",
  };

  if (isLinux) {
    variables.linuxConfiguration = {
      disablePasswordAuthentication: true,
      ssh: {
        publicKeys: [
          {
            path: "[concat('/home/', parameters('adminUsername'), '/.ssh/authorized_keys')]",
            keyData: "[parameters('adminPasswordOrKey')]",
          },
        ],
      },
    };
  }

  // Build disk resources and data disk attachments
  const { diskResources, dataDisks, warnings } = buildDiskResources(spec, standardTags);

  // NIC resource
  const nicProperties = {
    ipConfigurations: [
      {
        name: 'ipconfig1',
        properties: {
          privateIPAllocationMethod: 'Dynamic',
          subnet: {
            id: '[variables(\'subnetId\')]',
          },
        },
      },
    ],
    enableAcceleratedNetworking: true,
  };

  // Attach NSG to NIC if provided
  if (options.nsgId) {
    nicProperties.networkSecurityGroup = {
      id: '[parameters(\'nsgId\')]',
    };
  }

  const nicResource = {
    type: 'Microsoft.Network/networkInterfaces',
    apiVersion: '2023-09-01',
    name: nicName,
    location: '[parameters(\'location\')]',
    properties: nicProperties,
    tags: standardTags,
  };

  // VM resource
  const vmDependsOn = [
    `[resourceId('Microsoft.Network/networkInterfaces', '${nicName}')]`,
    ...diskResources.map(d => `[resourceId('Microsoft.Compute/disks', '${d.name}')]`),
  ];

  const osProfile = {
    computerName: '[variables(\'vmName\')]',
    adminUsername: '[parameters(\'adminUsername\')]',
  };

  if (isLinux) {
    osProfile.adminPassword = "[if(equals(parameters('authenticationType'), 'password'), parameters('adminPasswordOrKey'), null())]";
    osProfile.linuxConfiguration = "[if(equals(parameters('authenticationType'), 'sshPublicKey'), variables('linuxConfiguration'), null())]";
  } else {
    osProfile.adminPassword = '[parameters(\'adminPasswordOrKey\')]';
  }

  const vmResource = {
    type: 'Microsoft.Compute/virtualMachines',
    apiVersion: '2023-09-01',
    name: '[variables(\'vmName\')]',
    location: '[parameters(\'location\')]',
    dependsOn: vmDependsOn,
    properties: {
      hardwareProfile: {
        vmSize: '[variables(\'vmSize\')]',
      },
      storageProfile: {
        imageReference: getImageReference(spec),
        osDisk: getOsDiskConfig(spec),
        dataDisks,
      },
      osProfile,
      networkProfile: {
        networkInterfaces: [
          {
            id: `[resourceId('Microsoft.Network/networkInterfaces', '${nicName}')]`,
          },
        ],
      },
      diagnosticsProfile: {
        bootDiagnostics: {
          enabled: true,
        },
      },
    },
    tags: standardTags,
  };

  // Assemble full template
  const template = {
    $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
    contentVersion: '1.0.0.0',
    parameters,
    variables,
    resources: [nicResource, ...diskResources, vmResource],
    outputs: {
      vmName: { type: 'string', value: '[variables(\'vmName\')]' },
      vmId: { type: 'string', value: `[resourceId('Microsoft.Compute/virtualMachines', variables('vmName'))]` },
      nicId: { type: 'string', value: `[resourceId('Microsoft.Network/networkInterfaces', '${nicName}')]` },
    },
  };

  // Generate summary
  const summary = {
    hostname: spec.hostname,
    serverType: spec.serverType,
    vmSize: getVmSize(spec),
    region: regionDefault,
    os: isLinux ? 'RHEL 8 LVM Gen2' : 'Windows Server 2022 Gen2',
    totalDataDisks: dataDisks.length,
    diskBreakdown: isLinux
      ? (spec.volumeGroups || []).map(vg => `${vg.name}: ${typeof vg.diskCount === 'number' ? vg.diskCount : 'TBD'} disk(s)`)
      : (spec.diskGroups || []).map(dg => `${dg.purpose}: ${typeof dg.diskCount === 'number' ? dg.diskCount : 'TBD'} disk(s)`),
    tags: standardTags,
    environment: config.environment,
    warnings: warnings.length > 0 ? warnings : undefined,
    hasNsgReference: !!options.nsgId,
  };

  return { template, summary, warnings };
}

export default { generateArmTemplate };
