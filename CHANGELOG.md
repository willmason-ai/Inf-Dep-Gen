# Changelog

All notable changes to Inf-Dep-Gen are documented here.

Format: [Semantic Versioning](https://semver.org/) — MAJOR.MINOR.PATCH

---

## [0.3.0] — 2026-03-18

### Added — AVS Section, Compute Enhancements, Excel Intelligence

**AVS (Azure VMware Solution) — 6 new files**
- `src/backend/services/avs-config.js` — AVS config CRUD, /22 validation (cross-references networking IP plan), vSAN capacity math (AV36/AV36P/AV52/AV64)
- `src/backend/services/avs-bicep-generator.js` — Bicep + ARM JSON for Microsoft.AVS/privateClouds, ER authorizations, hub connections, Global Reach
- `src/backend/api/avs.js` — REST API: config CRUD, validate, capacity calc, generate bicep/arm
- `src/frontend/src/components/AvsConfig.jsx` — 5-tab AVS component: Private Cloud, NSX-T Segments, HCX, Connectivity, Templates
- `src/frontend/src/components/avs/ClusterSizer.jsx` — Cluster sizing card with SKU selector, node count, live capacity display
- `src/frontend/src/components/avs/SegmentEditor.jsx` — NSX-T segment row editor with CIDR validation, DHCP, T1 gateway
- `src/frontend/src/components/avs/HcxConfig.jsx` — HCX service mesh config, migration wave management with VM→segment mapping

**Compute Enhancements — 2 new files**
- `src/backend/services/companion-vm.js` — Companion VM service: CRUD, subnet integration from networking config, dependency graph
- `src/frontend/src/components/CompanionVMForm.jsx` — Modal form for creating jumpbox/DNS/backup VMs with subnet picker
- New `companion` server type alongside ODB/SQL
- Batch ARM generation endpoint (`POST /servers/batch/arm`)
- Server creation (`POST /servers`) and update (`PUT /servers/:hostname`) endpoints
- Subnet assignment (`POST /servers/:hostname/subnet`)

**Excel Intelligence — 2 new files**
- `src/backend/services/excel-sheet-detector.js` — Header-based auto-detection of sheet types (compute-bom, storage-bom, ip-plan, migration-wave, host-sizing)
- `src/backend/services/ip-plan-comparator.js` — Compare imported IP plans against networking config with merge support

**AI Tools — 4 new tools**
- `update_avs_config` — Populate AVS config from natural language
- `get_avs_capacity` — Calculate vSAN capacity for given SKU/node count
- `create_companion_vm` — Create companion VM specs via chat
- `list_available_subnets` — List networking config subnets available for VM deployment

**Dashboard**
- Replaced AVS "Coming Soon" placeholder with live `<AvsConfig />` component
- Companion VM subsection in Compute with "+ Companion VM" button
- Companion VM counts in section subtitle

### Cross-Section Data Flow
- AVS /22 block auto-syncs to networking config's IP plan on save
- AVS validation cross-references all networking ranges for overlap detection
- Companion VMs can be assigned to subnets from the networking config
- Excel sheet detector enables future multi-type import (IP plan, migration waves, host sizing)

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
