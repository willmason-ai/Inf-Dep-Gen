// ============================================================================
// Infrastructure Deployment Generator — Claude Tool Definitions
// ============================================================================
// Defines the tools available to Claude for agentic infrastructure operations.
// These map to backend service functions.
// ============================================================================

export const tools = [
  // ==========================================================================
  // Read-Only: Server Specs & Validation
  // ==========================================================================
  {
    name: 'list_all_servers',
    description: 'List all managed servers with their hostname, role, server type, SKU, region, disk count, and deficiency status. Use this to get an overview of the environment.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_server_spec',
    description: 'Get the full specification for a specific server by hostname. Returns compute config, tags, volume groups (ODB) or disk groups (SQL), and known deficiencies.',
    input_schema: {
      type: 'object',
      properties: {
        hostname: {
          type: 'string',
          description: 'The server hostname (e.g., "SERVER-01", "DB-PROD-01")',
        },
      },
      required: ['hostname'],
    },
  },
  {
    name: 'validate_server',
    description: 'Compare a server\'s spec against known deficiencies and flag any issues. Returns a validation report showing what matches spec and what is deficient. This is an offline check (spec-only, no Azure query).',
    input_schema: {
      type: 'object',
      properties: {
        hostname: {
          type: 'string',
          description: 'The server hostname to validate',
        },
      },
      required: ['hostname'],
    },
  },
  {
    name: 'validate_all_servers',
    description: 'Run spec-based validation across all managed servers at once. Returns a summary of compliant vs deficient servers with their issues.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_deficiencies',
    description: 'List all known deficiencies in the environment, optionally filtered by hostname or category. Returns issue IDs, descriptions, affected servers, priority, and status.',
    input_schema: {
      type: 'object',
      properties: {
        hostname: {
          type: 'string',
          description: 'Optional: filter deficiencies to a specific server hostname',
        },
        category: {
          type: 'string',
          description: 'Optional: filter by category (e.g., "Wrong SKU", "Missing Disks", "Security")',
        },
      },
      required: [],
    },
  },

  // ==========================================================================
  // Read-Only: Artifact Generation (preview only — no execution)
  // ==========================================================================
  {
    name: 'generate_arm_template',
    description: 'Generate an ARM (Azure Resource Manager) JSON template for a specific server. The template includes the VM, NIC, and all data disks with correct SKUs, sizes, IOPS, throughput, and tags. Returns warnings for any TBD/unresolved values. Does NOT deploy — use deploy_arm_template for that.',
    input_schema: {
      type: 'object',
      properties: {
        hostname: {
          type: 'string',
          description: 'The server hostname to generate the ARM template for',
        },
      },
      required: ['hostname'],
    },
  },
  {
    name: 'generate_lvm_script',
    description: 'Generate an LVM (Logical Volume Manager) configuration bash script for an ODB (Linux) server. Creates PVs and VGs from attached Azure data disks. Only works for ODB servers — will error for SQL servers. Returns warnings for any TBD/invalid values.',
    input_schema: {
      type: 'object',
      properties: {
        hostname: {
          type: 'string',
          description: 'The ODB server hostname to generate the LVM script for',
        },
      },
      required: ['hostname'],
    },
  },
  {
    name: 'generate_nsg_rules',
    description: 'Generate NSG (Network Security Group) ARM template fragment for a specific server. Includes server-type-specific port rules (SSH/Oracle for ODB, RDP/SQL for SQL servers) plus baseline deny/allow rules.',
    input_schema: {
      type: 'object',
      properties: {
        hostname: {
          type: 'string',
          description: 'The server hostname to generate NSG rules for',
        },
      },
      required: ['hostname'],
    },
  },
  {
    name: 'generate_tag_script',
    description: 'Generate a PowerShell script to apply required tags to a server\'s VM, NIC, OS disk, and all data disks. Uses Update-AzTag -Operation Merge for non-destructive tagging. Returns warnings for TBD disk groups.',
    input_schema: {
      type: 'object',
      properties: {
        hostname: {
          type: 'string',
          description: 'The server hostname to generate the tag script for',
        },
      },
      required: ['hostname'],
    },
  },

  // ==========================================================================
  // Azure Environment Discovery Tools (live queries)
  // ==========================================================================
  {
    name: 'discover_vnets',
    description: 'Query the live Azure environment to discover all Virtual Networks (VNets) and their subnets, peering status, NSG associations, and address spaces across all permitted resource groups.',
    input_schema: {
      type: 'object',
      properties: {
        resource_group: {
          type: 'string',
          description: 'Optional: limit discovery to a specific resource group. Must be in the permitted list.',
        },
      },
      required: [],
    },
  },
  {
    name: 'discover_vms',
    description: 'Query the live Azure environment to discover all Virtual Machines with their power state, SKU, OS type, attached disks, NICs, tags, and provisioning state.',
    input_schema: {
      type: 'object',
      properties: {
        resource_group: {
          type: 'string',
          description: 'Optional: limit discovery to a specific resource group.',
        },
      },
      required: [],
    },
  },
  {
    name: 'discover_disks',
    description: 'Query the live Azure environment to discover all managed disks with their size, SKU, IOPS, throughput, attachment status, and tags.',
    input_schema: {
      type: 'object',
      properties: {
        resource_group: {
          type: 'string',
          description: 'Optional: limit discovery to a specific resource group.',
        },
      },
      required: [],
    },
  },
  {
    name: 'discover_nsgs',
    description: 'Query the live Azure environment to discover all Network Security Groups with their inbound/outbound rules, associated subnets, and associated NICs.',
    input_schema: {
      type: 'object',
      properties: {
        resource_group: {
          type: 'string',
          description: 'Optional: limit discovery to a specific resource group.',
        },
      },
      required: [],
    },
  },
  {
    name: 'discover_nics',
    description: 'Query the live Azure environment to discover all Network Interface Cards (NICs) with their IP configurations, subnet attachments, NSG associations, and which VMs they belong to.',
    input_schema: {
      type: 'object',
      properties: {
        resource_group: {
          type: 'string',
          description: 'Optional: limit discovery to a specific resource group.',
        },
      },
      required: [],
    },
  },
  {
    name: 'discover_full_environment',
    description: 'Run a comprehensive discovery of the entire Azure environment — VNets, VMs, disks, NSGs, and NICs in all permitted resource groups. Returns a full snapshot with summary counts.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  // ==========================================================================
  // Spec vs. Actual Comparison (live Azure query + spec comparison)
  // ==========================================================================
  {
    name: 'compare_spec_vs_actual',
    description: 'Compare a server\'s specification against its LIVE Azure state. Discovers the VM, disks, NIC, NSG from Azure and compares field-by-field: SKU, disk counts/sizes/IOPS, tags, NSG presence, OS disk public access. Returns a structured diff report showing matches and mismatches. This is the primary tool for finding drift.',
    input_schema: {
      type: 'object',
      properties: {
        hostname: {
          type: 'string',
          description: 'The server hostname to compare (e.g., "SERVER-01")',
        },
      },
      required: ['hostname'],
    },
  },

  // ==========================================================================
  // Execution Tools (require human approval before execution)
  // ==========================================================================
  {
    name: 'deploy_arm_template',
    description: 'Deploy a generated ARM template for a server to Azure. This creates an APPROVAL REQUEST — the template is NOT deployed immediately. The user must approve or reject before execution occurs. Uses Incremental deployment mode (never Complete).',
    input_schema: {
      type: 'object',
      properties: {
        hostname: {
          type: 'string',
          description: 'The server hostname to deploy the ARM template for',
        },
      },
      required: ['hostname'],
    },
  },
  {
    name: 'apply_tags_to_server',
    description: 'Apply the required tags to a server\'s VM and resources in Azure. Creates an APPROVAL REQUEST — tags are NOT applied immediately. The user must approve first.',
    input_schema: {
      type: 'object',
      properties: {
        hostname: {
          type: 'string',
          description: 'The server hostname to apply tags to',
        },
      },
      required: ['hostname'],
    },
  },
  {
    name: 'confirm_approval',
    description: 'Check status of, approve, or reject a pending approval request. Use action "approve" to execute the operation, "reject" to cancel it, or "status" to check its current state.',
    input_schema: {
      type: 'object',
      properties: {
        approval_id: {
          type: 'string',
          description: 'The approval request ID (e.g., "apr-a1b2c3d4")',
        },
        action: {
          type: 'string',
          enum: ['approve', 'reject', 'status'],
          description: 'Action to take: "approve" (execute), "reject" (cancel), or "status" (check)',
        },
      },
      required: ['approval_id', 'action'],
    },
  },

  // ==========================================================================
  // Networking Configuration
  // ==========================================================================
  {
    name: 'update_networking_config',
    description: 'Update the networking configuration with information about existing or planned infrastructure. Use when the user describes their current network topology, provides resource IDs, CIDR ranges, or wants to set up networking for an AVS deployment. Accepts partial config — only provided fields are merged into the existing saved config.',
    input_schema: {
      type: 'object',
      properties: {
        region: {
          type: 'string',
          description: 'Azure region (e.g., "eastus2", "westus2")',
        },
        resourceGroupName: {
          type: 'string',
          description: 'Resource group name for networking resources',
        },
        hubVnet: {
          type: 'object',
          description: 'Hub VNet configuration',
          properties: {
            name: { type: 'string', description: 'VNet name' },
            addressSpaces: {
              type: 'array',
              items: { type: 'string' },
              description: 'VNet address spaces in CIDR notation (e.g., ["10.0.0.0/16"])',
            },
          },
        },
        subnets: {
          type: 'array',
          description: 'Subnet definitions. Each must have purpose, name, and cidr.',
          items: {
            type: 'object',
            properties: {
              purpose: {
                type: 'string',
                enum: ['gateway', 'bastion', 'firewall', 'compute', 'management', 'custom'],
              },
              name: { type: 'string' },
              cidr: { type: 'string' },
              nsg: { type: 'boolean' },
              routeTable: { type: 'boolean' },
            },
            required: ['purpose', 'cidr'],
          },
        },
        connectivity: {
          type: 'object',
          description: 'Connectivity settings (ExpressRoute, Bastion, Firewall)',
          properties: {
            expressRouteGateway: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                sku: { type: 'string', enum: ['ErGw1AZ', 'ErGw2AZ', 'ErGw3AZ', 'UltraPerformance'] },
              },
            },
            expressRouteConnection: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                circuitResourceId: { type: 'string' },
                authorizationKey: { type: 'string' },
              },
            },
            globalReach: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                onPremCircuitResourceId: { type: 'string' },
                avsCircuitResourceId: { type: 'string' },
              },
            },
            bastion: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                sku: { type: 'string', enum: ['Basic', 'Standard'] },
              },
            },
            firewall: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                sku: { type: 'string', enum: ['Standard', 'Premium'] },
                threatIntelMode: { type: 'string', enum: ['Off', 'Alert', 'Deny'] },
              },
            },
          },
        },
        ipAddressPlan: {
          type: 'object',
          description: 'IP address plan for overlap validation',
          properties: {
            avsBlock: { type: 'string', description: 'AVS /22 CIDR block' },
            onPremRanges: { type: 'array', items: { type: 'string' } },
            workloadVnetRanges: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      required: [],
    },
  },

  // ==========================================================================
  // Cache Management
  // ==========================================================================
  {
    name: 'refresh_specs',
    description: 'Clear all cached server specs and deficiency data, forcing a fresh reload from source files and Cosmos DB. Use this after importing new specs or when data seems stale.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

export default tools;
