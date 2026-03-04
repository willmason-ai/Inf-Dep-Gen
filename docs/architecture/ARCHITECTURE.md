# Architecture Overview

## System Context

Infrastructure Deployment Generator is a web application deployed as an Azure App Service in the **East US 2** region within the **Infrastructure Deployment Generator** resource group. It consumes Epic's Azure Cloud Specifications and Presidio's delivery documentation to produce deployment-ready artifacts: ARM templates, LVM scripts, NSG rules, and tagging scripts.

### Operating Modes

The application operates in two modes depending on the state of the environment:

| Mode | When Used | What Happens |
|------|-----------|-------------|
| **Remediation** | Servers already exist but have deficiencies (wrong SKU, missing disks, no NSGs, etc.) | Generates targeted fix artifacts — resize ARM templates, missing disk ARM + LVM scripts, NSG rules, tag scripts |
| **Greenfield** | New servers need to be built from scratch (once hostnames are assigned) | Generates complete ARM templates, full LVM scripts, NSG rules, and tag scripts for brand-new deployments |

Both modes use the same spec documents as source of truth. The validator detects which mode applies per server.

### AI Engine — Claude (Anthropic API)

The AI chat interface is powered by **Claude Opus 4.6** via the Anthropic API. The API key is stored in the App Service configuration (backed by Key Vault). Claude has access to:
- All server spec documents
- Current deficiency state
- Guardrail rules
- The ability to invoke generators (ARM, LVM, NSG, Tag) as tool calls
- **Live Azure environment discovery** — query VNets, VMs, disks, NSGs, and NICs in real-time
- Audit log for context on recent changes

The AI is **environment-aware**: before planning any deployment, it discovers the current Azure state, compares it against specs, and identifies what needs to be built or fixed.

Example interactions:
- *"Can you add another disk to EUS2-EPPRDODB and make sure it's part of prdvg?"* → Claude looks up the spec, determines the next LUN, generates the ARM disk resource + LVM extend script
- *"What's wrong with the Reporting ODB?"* → Claude checks deficiencies and reports DEF-SKU-003, DEF-DSK-001
- *"Generate a complete ARM template for WUS2-ENCLR01"* → Claude produces the full template from spec
- *"Why is EUS2-ENTRNODB in the wrong region?"* → Claude explains DEF-REG-001 and what remediation looks like

### Primary Functions

1. **ARM Template Generation** — Produce per-server ARM templates from spec documents (greenfield or remediation delta)
2. **LVM Script Generation** — Produce volume group configuration scripts for Linux ODB servers
3. **NSG Rule Generation** — Produce per-server Network Security Group definitions
4. **Tag Script Generation** — Produce Azure tag assignment scripts
5. **Validation** — Compare actual Azure state against spec documents and flag deficiencies
6. **Dashboard** — Visual overview of all managed servers and their compliance
7. **AI Chat** — Natural language interface for querying specs and requesting changes (e.g., "add a disk to EUS2-EPPRDODB's prdvg")

## Managed Infrastructure

### Two Regions

| Region | Purpose | Resource Groups |
|--------|---------|-----------------|
| **East US 2** (Primary) | Production, Build, Training servers | eus2-rg-epic-prod-01, eus2-rg-net-epic-prod-01, eus2-rg-esan-prod-01 |
| **West US 2** (Alternate) | DR, Build servers | wus2-rg-epic-prod-01, wus2-rg-net-epic-prod-01, wus2-rg-esan-prod-01, wus2-rg-avs-prod-01 |

### Server Types

| Type | OS | Count | Key Feature |
|------|----|-------|-------------|
| Operational Database (ODB) | RHEL-8 | 6 named servers | LVM volume groups (prdvg, epicvg, etc.) with Premium SSD v2 |
| Relational Database (SQL) | Windows Server 2022 | 6 named servers | SQL Server data/log/stage disk groups, tempdb on ephemeral |
| Web & Service | Windows/Linux | 99+ per stamp | Presentation, Interconnect, MyChart, Care Everywhere, etc. |
| Cogito | TBD | 12 planned | Analytics workloads |

## Component Architecture

### Generation Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                     Generation Pipeline                          │
│                                                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────────┐  │
│  │ Server Spec   │───▶│  Generators   │───▶│  Output Artifacts  │  │
│  │ Documents     │    │              │    │                   │  │
│  │ (Cosmos DB)   │    │ - ARM Gen    │    │ - ARM Templates   │  │
│  │              │    │ - LVM Gen    │    │ - LVM Scripts     │  │
│  │ Sources:      │    │ - NSG Gen    │    │ - NSG Rules       │  │
│  │ - Excel BOM   │    │ - Tag Gen    │    │ - Tag Scripts     │  │
│  │ - Deficiency  │    │              │    │ - Validation Rpt  │  │
│  │ - Delivery    │    │ - Validator  │    │                   │  │
│  └──────────────┘    └──────┬───────┘    └───────────────────┘  │
│                             │                                     │
│                      ┌──────▼───────┐                            │
│                      │  Guardrails   │                            │
│                      │  Engine       │                            │
│                      └──────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

### ARM Template Generator

Input: Server spec document
Output: Deployable ARM JSON template

For each server, generates:
- VM resource (correct SKU, region, OS image, availability config)
- OS disk (correct type, deny public access)
- Data disks (Premium SSD v2 with per-disk IOPS, throughput, capacity)
- NIC reference (existing, not created)
- NSG reference
- All required tags embedded in every resource
- Disk-to-VG tag mapping for Linux servers

### LVM Script Generator (Linux ODB Servers Only)

Input: Server spec document + disk list
Output: Shell script for LVM configuration

Produces scripts that:
1. Identify attached Azure disks by LUN
2. Create Physical Volumes (`pvcreate`)
3. Create or extend Volume Groups (`vgcreate`/`vgextend`) with correct names
4. Create Logical Volumes (`lvcreate`)
5. Create filesystems and mount points
6. Include validation checks (disk existence, idempotency)

Example VG structures:
- **EUS2-EPPRDODB**: prdinstvg (1 disk), prdvg (12 disks), prdjrnvg (1 disk)
- **EUS2-ENSUPODB**: epicvg (1 disk), [env]vg (12 disks)
- **WUS2-EPPRDODB**: drinstvg (1 disk), drvg (12 disks), drjrnvg (1 disk)

### NSG Rule Generator

Input: Server spec document + Epic network requirements
Output: NSG rule JSON/Bicep

Each server gets its own NSG (per DEF-ODB-008 deficiency finding). Rules cover:
- Inbound: Only required application ports from known sources
- Outbound: Deny default public IP, allow only required destinations
- Management: No open SSH/RDP to 0.0.0.0/0

### Validator

Input: Server spec documents + live Azure state (via ARM API)
Output: Compliance report

Checks (derived from deficiency audit):
- SKU matches spec
- All spec'd disks exist with correct size/IOPS/throughput
- Disk labels match assigned server
- NSG exists per VM
- OS disk denies public access
- Correct OS admin user
- VM in correct region
- Required tags present with correct values
- Resource group follows naming convention
- No default outbound IP

### Frontend

```
┌──────────────────────────────────────────────────────────────┐
│                      Frontend SPA (React 19 + Vite)           │
│                                                               │
│  ┌────────────┐                                              │
│  │  Login      │  Single-user auth (admin)               │
│  │  Page       │  Bearer token in localStorage               │
│  └────────────┘                                              │
│                                                               │
│  ┌──────────────────┐  ┌──────────────────────────────────┐  │
│  │  Dashboard        │  │  AI Chat                         │  │
│  │                   │  │                                  │  │
│  │  - Server List    │  │  ┌──────────┐ ┌───────────────┐ │  │
│  │  - Spec Details   │  │  │ Chat     │ │ Message View  │ │  │
│  │  - Generator Btns │  │  │ History  │ │ + Tool Calls  │ │  │
│  │  - Import Specs   │  │  │ Sidebar  │ │ + Suggestions │ │  │
│  │  - Artifact View  │  │  └──────────┘ └───────────────┘ │  │
│  └──────────────────┘  └──────────────────────────────────┘  │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  Import Review Modal                                      ││
│  │  - Parse warnings, unmatched servers                      ││
│  │  - Field-by-field diff (current → new) per server         ││
│  │  - Select servers, confirm, apply to Cosmos DB            ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### Backend API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/login` | POST | Authenticate user, return Bearer token |
| `/api/auth/logout` | POST | Invalidate session token |
| `/api/auth/me` | GET | Check current token validity |
| `/api/servers` | GET | List all managed servers with spec + actual state |
| `/api/servers/:hostname` | GET | Get full server details (spec, disks, VGs, tags) |
| `/api/servers/:hostname/arm` | POST | Generate ARM template for a server |
| `/api/servers/:hostname/lvm` | POST | Generate LVM script for an ODB server |
| `/api/servers/:hostname/nsg` | POST | Generate NSG rules for a server |
| `/api/servers/:hostname/tags` | POST | Generate tag assignment script |
| `/api/servers/:hostname/validate` | GET | Run validation checks against live Azure |
| `/api/servers/:hostname/disks` | POST | Add a disk (generates ARM + LVM updates) |
| `/api/ai/chat` | POST | AI chat message |
| `/api/ai/history` | GET | List all chat sessions (with previews) |
| `/api/ai/history/:sessionId` | GET | Get full session messages |
| `/api/ai/history/:sessionId` | DELETE | Delete a chat session |
| `/api/import/preview` | POST | Upload .xlsx, parse, return diff report |
| `/api/import/apply` | POST | Apply confirmed spec changes to Cosmos DB |
| `/api/azure/resource-groups` | GET | List discoverable resource groups |
| `/api/azure/vnets` | GET | Discover VNets, subnets, peering, NSG associations |
| `/api/azure/vms` | GET | Discover VMs with power state, SKU, OS, disks |
| `/api/azure/disks` | GET | Discover managed disks with size, SKU, IOPS |
| `/api/azure/nsgs` | GET | Discover NSGs with rules and associations |
| `/api/azure/nics` | GET | Discover NICs with IP configs and subnet attachments |
| `/api/azure/snapshot` | GET | Full environment snapshot (all resource types) |
| `/api/logs/audit` | GET | Audit log query |
| `/api/validate/all` | GET | Run validation across all servers |

### Data Layer (Cosmos DB)

| Container | Partition Key | Purpose |
|-----------|--------------|---------|
| `serverSpecs` | `/hostname` | Server spec documents (SKU, disks, VGs, tags, NSG) |
| `generatedArtifacts` | `/hostname` | Generated ARM templates, LVM scripts, NSG rules |
| `auditLog` | `/timestamp` | Immutable change records |
| `chatHistory` | `/sessionId` | AI conversation logs |
| `deficiencies` | `/hostname` | Known deficiencies and remediation status |
| `guardrailRules` | `/ruleCategory` | Safety rule definitions |
| `appConfig` | `/configKey` | Application configuration |

### Middleware Pipeline

```
Request → Audit Log → Auth (Bearer Token) → Guardrails → Handler → Response
```

1. **Audit Log**: Record every API call to Cosmos DB (non-blocking, fires on `res.finish`)
2. **Authentication**: Validate Bearer token against Cosmos DB `appConfig` container (cached 5 min). Skips `/api/health` and `/api/auth/login`
3. **Guardrails Check**: Evaluate against safety rules (see GUARDRAILS.md)
4. **Handler**: Execute business logic (generate, validate, etc.)

## Infrastructure Topology

```
Azure Subscription
│
├── RG: Infrastructure Deployment Generator (East US 2)
│   ├── App Service Plan
│   ├── App Service (Web App) ← Infrastructure Deployment Generator
│   ├── Cosmos DB Account
│   │   └── Database: infDepGen
│   │       ├── serverSpecs        (12+ server definitions)
│   │       ├── generatedArtifacts (ARM/LVM/NSG output)
│   │       ├── auditLog           (change history)
│   │       ├── chatHistory        (AI conversations)
│   │       ├── deficiencies       (known issues)
│   │       ├── guardrailRules     (safety rules)
│   │       └── appConfig          (configuration)
│   └── Application Insights
│
├── RG: eus2-rg-epic-prod-01 (East US 2) — 72 resources
│   ├── EUS2-EPPRDODB  (Production ODB, M48bs_v3, RHEL-8)
│   ├── EUS2-ENSUPODB  (Support ODB, E16s_v5, RHEL-8)
│   ├── EUS2-EPRPTODB  (Reporting ODB, E16bs_v5, RHEL-8)
│   ├── EUS2-ENTSTODB  (Test ODB, D16s_v5, RHEL-8)
│   ├── EUS2-ENTRNODB  (Training ODB, E16s_v5, RHEL-8)
│   ├── EUS2-EPCLR01   (Clarity SQL, E32bds_v5, Win2022)
│   ├── EUS2-EPCAB01   (Caboodle SQL, E16bds_v5, Win2022)
│   ├── EUS2-EPCUB01   (Cube SQL, E8bds_v5, Win2022)
│   └── ... (Web & Service servers, Cogito, etc.)
│
├── RG: wus2-rg-epic-prod-01 (West US 2) — 41 resources
│   ├── WUS2-EPPRDODB  (DR ODB, M48bs_v3, RHEL-8)
│   ├── WUS2-ENCLR01   (Clarity Build, E8bds_v5, Win2022)
│   ├── WUS2-ENCAB01   (Caboodle Build, E16bds_v5, Win2022)
│   ├── WUS2-ENCUB01   (Cube Build, E8bds_v5, Win2022)
│   └── ... (Web & Service servers)
│
├── RG: eus2-rg-net-epic-prod-01 — Networking (6 resources)
├── RG: wus2-rg-net-epic-prod-01 — Networking (3 resources)
├── RG: eus2-rg-esan-prod-01 — Elastic SAN (5 resources)
├── RG: wus2-rg-esan-prod-01 — Elastic SAN (26 resources)
└── RG: wus2-rg-avs-prod-01 — AVS Private Cloud (18 resources)
```

## Security Boundaries

- Service Principal can ONLY access explicitly listed resource groups
- All operations filtered through the guardrails engine
- Destructive operations require human approval
- Generated ARM templates cannot include public IPs
- Generated NSG rules cannot open 0.0.0.0/0 on management ports
- All actions logged to append-only audit trail
- No direct VM access (SSH/RDP) — only Azure Resource Manager operations
- OS disks must deny public network access

## Epic AI — Agentic Deployment Engine

The "Epic AI" is the Claude-powered agent that lives inside the App Service. It is not just a chatbot — it is the **deployment engine** that:

1. **Ingests** server specs, disk layouts, VG mappings, and tag requirements into Cosmos DB
2. **Generates** ARM templates, LVM scripts, NSG rules, and tag scripts on demand
3. **Deploys** generated artifacts to Azure via the scoped Service Principal
4. **Validates** deployed state against spec and reports deficiencies
5. **Remediates** by generating targeted fix artifacts (add disk, resize VM, etc.)

### Epic AI Execution Flow

```
User Request (Chat UI or API)
    │
    ▼
┌────────────────────────────────────────────────────────┐
│ Epic AI (Claude Agent with Tool Calling)                │
│                                                         │
│  1. Parse intent ("add a disk to prdvg")                │
│  2. Look up server spec from Cosmos DB                  │
│  3. Check guardrails (is this allowed?)                 │
│  4. Generate artifact (ARM template / LVM script)       │
│  5. Present to user for approval                        │
│  6. Execute deployment (az deployment group create)     │
│  7. Execute LVM config (via SSH through Bastion)        │
│  8. Validate result against spec                        │
│  9. Log everything to audit trail                       │
└────────────────────────────────────────────────────────┘
```

### Epic AI Tool Capabilities

| Tool | What It Does | Guardrail Level |
|------|-------------|-----------------|
| `generate_arm_template` | Produces ARM JSON from server spec in Cosmos DB | Approval Required |
| `generate_lvm_script` | Produces LVM bash script from disk/VG spec | Approval Required |
| `generate_nsg_rules` | Produces NSG rule definitions per server | Approval Required |
| `generate_tag_script` | Produces Azure tag assignment PowerShell | Allowed |
| `deploy_arm_template` | Executes `az deployment group create` | Approval Required |
| `execute_lvm_script` | Runs LVM script on VM via SSH/Bastion | Approval Required |
| `validate_server` | Compares Azure state vs Cosmos DB spec | Allowed |
| `list_deficiencies` | Queries deficiency collection | Allowed |
| `get_server_spec` | Reads server spec from Cosmos DB | Allowed |
| `add_disk_to_server` | Generates add-disk ARM + LVM extend | Approval Required |
| `resize_vm` | Generates VM resize ARM template | Approval Required |
| `discover_vnets` | Query live VNets, subnets, peering, address spaces | Allowed |
| `discover_vms` | Query live VMs with power state, SKU, OS, disks | Allowed |
| `discover_disks` | Query live managed disks with size, SKU, IOPS | Allowed |
| `discover_nsgs` | Query live NSGs with rules and associations | Allowed |
| `discover_nics` | Query live NICs with IP configs and subnets | Allowed |
| `discover_full_environment` | Full snapshot of all Azure resources in parallel | Allowed |

### How Specs Get Into Cosmos DB

The server specs (currently in `docs/server-specs/*.md`) will be **ingested into Cosmos DB** as structured documents. The ingestion can happen:

1. **Bulk import** — Upload all spec files at app initialization
2. **Manual entry** — Dashboard UI for creating/editing server specs
3. **Excel import** — Parse the Epic Azure Cloud Specifications spreadsheet
4. **AI-assisted** — "Epic AI, add a new server EUS2-EPXYZ01 with 8 data disks in prdvg"

Once in Cosmos DB, the specs are the **live source of truth** that Epic AI reads from when generating artifacts.

### Lab vs Production

| Aspect | Lab (Current Phase) | Production (Future) |
|--------|---------------------|---------------------|
| App Service host | Lab subscription | Customer subscription |
| Cosmos DB | Lab subscription | Customer subscription |
| Service Principal scope | Lab RGs only | Customer RGs only |
| VM SKUs generated | D-series (lab cost) | M/E/D-series (per spec) |
| Disk type generated | StandardSSD_LRS | PremiumV2_LRS |
| Bastion | Lab bastion | Customer bastion |
| AI model | Claude via Anthropic API | Same |

The App Service code is **identical** between lab and production. Only the configuration (subscription, RGs, Service Principal, Cosmos DB connection) changes.

## Decision Log

| Decision | Rationale | Date |
|----------|-----------|------|
| Cosmos DB NoSQL | Flexible schema for varied server specs, built-in TTL for logs | 2026-03-01 |
| App Service (not AKS) | Simpler operational model, sufficient for this workload | 2026-03-01 |
| Bicep (not Terraform) | Native Azure IaC, no state file management | 2026-03-01 |
| East US 2 for app | Primary region for managed infrastructure | 2026-03-01 |
| Scoped Service Principal | Least-privilege access model | 2026-03-01 |
| ARM output (not Bicep) | ARM JSON is the deployment artifact; Bicep is for the app infra only | 2026-03-01 |
| Per-server NSGs | Deficiency audit showed shared/missing NSGs are a risk | 2026-03-01 |
| Premium SSD v2 with explicit IOPS | Epic spec requires per-disk IOPS/throughput control | 2026-03-01 |
| LVM scripts as output | ODB servers require specific VG/LV layout that can't be done via ARM alone | 2026-03-01 |
| **Claude (Anthropic API) for AI** | AI chat engine for agentic infrastructure operations — API key stored in App Service config via Key Vault | 2026-03-01 |
| **Dual mode (Remediation + Greenfield)** | Existing servers have deficiencies; new servers may need full builds once hostnames are assigned | 2026-03-01 |
| **Epic AI as deployment engine** | The App Service doesn't just generate files — it deploys them. Claude (Epic AI) orchestrates the full lifecycle: spec → generate → deploy → validate → log | 2026-03-01 |
| **Cosmos DB as live spec store** | Server specs are not static files — they live in Cosmos DB so Epic AI can read, update, and act on them programmatically | 2026-03-01 |
| **Azure Resource Discovery via ARM SDK** | AI queries live Azure state (VNets, VMs, disks, NSGs, NICs) before planning deployments — ensures environment-aware decision making | 2026-03-02 |
| **Lab VNet in rg-willmason-epic-vm** | All lab resources (VNet, NSGs, future VMs) in single RG for MVP simplicity — production will use dedicated networking RGs | 2026-03-02 |
| **SP custom role with VNet read** | Service principal can read VNets/subnets but not modify them — aligns with guardrail that networking modifications are blocked | 2026-03-02 |
| **Single-user auth with Cosmos DB sessions** | Simple `admin` login with password in App Service config, sessions persisted in `appConfig` container — survives app restarts | 2026-03-01 |
| **Excel import via `xlsx` package** | Parse Epic CSG Excel (Compute + Storage BOM sheets), diff against current specs, apply with audit trail — keeps Cosmos DB as live source of truth | 2026-03-01 |
| **Chat history sidebar with session management** | Collapsible sidebar showing past sessions with preview, message count, load/delete — stored in existing `chatHistory` container | 2026-03-01 |
| **Multer for file upload** | Memory storage, single file, max 10MB — contained to import router only, no disk writes | 2026-03-01 |
| **Dynamic version in health endpoint** | health.js reads version from package.json instead of hardcoding — ensures `/api/health` always reports the deployed version accurately | 2026-03-02 |
