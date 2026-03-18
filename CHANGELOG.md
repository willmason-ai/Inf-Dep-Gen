# Changelog

All notable changes to Inf-Dep-Gen are documented here.

Format: [Semantic Versioning](https://semver.org/) — MAJOR.MINOR.PATCH

---

## [0.2.0] — 2026-03-18

### Added — Networking Section
Full networking topology planner for the Networking subscription (hub VNet, ExpressRoute, Bastion, Firewall).

**Backend (4 new files)**
- `src/backend/services/cidr-utils.js` — Pure JS CIDR math engine: parse, overlap detection, containment, alignment, IP plan validation, utilization calculation
- `src/backend/services/networking-config.js` — Networking config CRUD (Cosmos DB `appConfig`), topology validation, ARM export import, default config generation
- `src/backend/services/bicep-generator.js` — Generates Bicep and ARM JSON templates for the full networking stack (VNet, subnets, NSGs, route tables, Bastion, ER Gateway, Firewall)
- `src/backend/api/networking.js` — REST API: GET/POST config, validate, generate bicep/arm, import ARM export, reset

**Frontend (4 new files)**
- `src/frontend/src/components/NetworkingConfig.jsx` — Main networking component with 4 tabs: Topology, IP Plan, Connectivity, Templates
- `src/frontend/src/components/networking/CidrInput.jsx` — Reusable CIDR input with client-side validation, color feedback, and tooltip
- `src/frontend/src/components/networking/SubnetEditor.jsx` — Subnet row editor: purpose, name, CIDR, NSG/RT toggles, enabled toggle
- `src/frontend/src/components/networking/ConnectivityCard.jsx` — Reusable toggle+config card for connectivity components

**AI Integration**
- `update_networking_config` tool — AI chat can populate networking config from natural language descriptions

**Dashboard**
- Replaced Networking "Coming Soon" placeholder with live `<NetworkingConfig />` component
- Version badge added to nav bar (top left)

### Features
- Hub VNet with address space management
- Subnets: GatewaySubnet, AzureBastionSubnet, AzureFirewallSubnet (fixed-name), plus custom subnets
- CIDR validation: format, alignment, prefix sizing, overlap, VNet containment
- Address space utilization bar
- ExpressRoute Gateway (ErGw1AZ–UltraPerformance), Connection, Circuit planning
- ExpressRoute Global Reach (on-prem + AVS circuit IDs)
- Azure Bastion (Basic/Standard)
- Azure Firewall (Standard/Premium) with policy and threat intel mode
- IP Address Plan: AVS /22 block, on-prem ranges, workload ranges, reserved ranges
- Overlap validation matrix (visual grid)
- Bicep + ARM JSON template generation with code preview, download, and copy
- ARM export import: upload `az group export` JSON to seed config
- Versioning introduced (semver)

---

## [0.1.0] — 2026-03-14

### Initial Release
- Dashboard with collapsible sections (Naming, Networking placeholder, Compute, AVS placeholder, Excel)
- Naming Convention engine with templates, component editor, live preview, reference table
- Compute section: ODB (RHEL-8) and SQL (Windows 2022) server management
- ARM template, LVM script, NSG rule, and tag script generation per server
- Excel import with preview and diff
- AI Chat with Claude tool calling (server queries, artifact generation, Azure discovery, spec comparison)
- Azure SDK discovery (VNets, VMs, disks, NSGs, NICs)
- Guardrails engine preventing destructive operations
- Audit logging to Cosmos DB
- Single-user auth (env var credentials)
