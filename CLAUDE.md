# Infrastructure Deployment Generator — Project Context

## What This Project Is
Infrastructure Deployment Generator (Inf-Dep-Gen) is an Azure App Service + Cosmos DB application for generating and managing Azure VM deployments. It generates ARM templates, LVM configuration scripts, NSG rules, and tagging scripts from server specification documents. It has a dashboard for visibility and an AI chat page for agentic infrastructure operations.

This project is a general-purpose tool — it can be configured for any customer/environment via environment variables and server spec files.

## Key Constraints
- **App Resource Group**: Configurable via env vars
- **Database**: Azure Cosmos DB (NoSQL API)
- **AI Engine**: Claude (Anthropic API) — API key via env var or Key Vault
- **Identity**: Service Principal scoped to specific resource groups only
- **Safety**: All operations pass through a guardrails engine (see docs/GUARDRAILS.md)
- **Logging**: Every AI chat message and every infrastructure change is logged to Cosmos DB
- **Source of Truth**: Server spec markdown files in `docs/server-specs/`

## Configuration
All environment-specific values are driven by environment variables:
- `APP_ENVIRONMENT` — Environment name (default: "lab")
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — Login credentials
- `PERMITTED_RESOURCE_GROUPS` — Comma-separated list of allowed RGs
- `AZURE_RG_*` — Named resource groups (e.g., `AZURE_RG_COMPUTE=my-rg`)
- `AZURE_VNET_PRIMARY`, `AZURE_SUBNET_PRIMARY` — Network defaults
- `SERVER_SPECS_DIR` — Path to server spec files (default: `docs/server-specs/`)
- `COSMOS_DB_DATABASE` — Database name (default: "infDepGen")

## Server Types
- **ODB** (RHEL-8 Linux): Database servers with LVM volume groups. Support ARM templates AND LVM scripts.
- **SQL** (Windows Server 2022): SQL Server instances with disk groups. Support ARM templates but NOT LVM scripts.

## What The App Generates
1. **ARM Templates** — Per-server with SKU, disks (Premium SSD v2 + IOPS/throughput), tags, NSG ref
2. **LVM Scripts** — For Linux ODB servers: PV/VG/LV creation from attached Azure disks
3. **NSG Rules** — Per-server Network Security Group definitions
4. **Tag Scripts** — Apply required tags to VM and all resources
5. **Validation Reports** — Spec vs. actual state diffs

## App Features
- **Login** — Single-user auth, credentials from env vars
- **Dashboard** — Server overview with spec details, generator buttons (ARM/LVM/NSG/Tags), Import Specs button
- **Excel Import** — Upload `.xlsx`, parse Compute + Storage BOM sheets, diff against Cosmos DB specs
- **AI Chat** — Claude with tool calling, environment-aware planning, collapsible chat history sidebar
- **Azure Discovery** — Live resource discovery (VNets, VMs, disks, NSGs, NICs) via ARM SDK

## Hard Rules
- Never delete VMs, disks, resource groups, or any Azure resource
- Never modify networking (VNets, subnets, NICs) — NSG *generation* is allowed but not direct modification
- Never modify RBAC or identity configurations
- Never execute operations outside permitted resource groups
- All destructive operations require human approval
- VM resizes must match the server's spec document
- Generated ARM templates must not include public IPs
- OS disks must deny public network access
- Every VM must have its own NSG
- Disk sizes can never decrease
- LVM scripts must never destroy existing data

## Project Structure
- `src/frontend/` — React 19 + Vite + Tailwind CSS
  - `src/frontend/src/pages/` — Login.jsx, Dashboard.jsx, AiChat.jsx
  - `src/frontend/src/components/` — ChatSidebar.jsx, ChatMessage.jsx, ImportReview.jsx, ServerDetail.jsx, ArtifactViewer.jsx
  - `src/frontend/src/lib/api.js` — API client with auth token management
- `src/backend/` — Express.js (ES modules)
  - `src/backend/api/` — Route handlers: auth.js, servers.js, ai.js, azure.js, import.js
  - `src/backend/services/` — Business logic: excel-parser.js, spec-comparator.js, spec-parser.js, azure-discovery.js, arm-generator.js, lvm-generator.js, nsg-generator.js, tag-generator.js
  - `src/backend/services/ai/` — Claude integration: chat-service.js, system-prompt.js, tool-definitions.js, tool-executor.js
  - `src/backend/middleware/` — auth.js (Bearer token), audit-logger.js, guardrails.js, error-handler.js
  - `src/backend/config/` — index.js (env vars), cosmos.js (Cosmos DB client)
- `infrastructure/` — Bicep templates for the app itself, deployment scripts
- `docs/` — Architecture, guardrails, logging, RBAC, tagging
- `docs/server-specs/` — One spec file per managed server + SPEC-TEMPLATE.md
- `templates/` — Generated ARM template output
- `scripts/` — Generated LVM/NSG/tag scripts
- `tests/` — Unit and integration tests

## When Making Changes
- Always check guardrail rules before implementing VM operations
- Log every action to the audit trail
- Follow the server spec documents for allowed SKU/disk configurations
- Never store secrets in code — use Key Vault or Managed Identity
- Validate disk-to-VG mappings before generating add-disk output
