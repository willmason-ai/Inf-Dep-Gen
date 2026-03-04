# Infrastructure Deployment Generator

A general-purpose Azure infrastructure deployment tool that generates ARM templates, LVM configuration scripts, NSG rules, and tagging scripts from server specification documents — with a dashboard for visibility and an AI chat interface for agentic infrastructure operations.

## Overview

Infrastructure Deployment Generator (Inf-Dep-Gen) consumes server specification documents (markdown or Excel) to produce deployment-ready artifacts: ARM templates for VMs and disks, shell scripts for Linux LVM volume group configuration, NSG rule definitions, and Azure tagging scripts. It also provides an AI conversation interface powered by Claude that can answer questions, generate templates, compare spec vs. actual state, and execute approved operations.

## What It Produces

| Output | Description |
|--------|-------------|
| **ARM Templates** | Per-server JSON templates with correct SKU, OS disk, data disks (Premium SSD v2 with IOPS/throughput/size), availability config |
| **LVM Scripts** | Shell scripts for Linux ODB servers to create PVs, VGs, and LVs from attached Azure disks |
| **NSG Rules** | Per-server Network Security Group definitions |
| **Tag Scripts** | PowerShell scripts applying configurable tags to VMs and all related resources |
| **Validation Reports** | Diff current Azure state vs. spec — catches drift and deficiencies |

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    Azure (Configurable Regions)                    │
│                                                                   │
│  ┌─────────────────┐    ┌──────────────────────────────┐         │
│  │   App Service    │───▶│    Azure Cosmos DB (NoSQL)    │         │
│  │                  │    │    - Server Spec Documents     │         │
│  │  ┌────────────┐  │    │    - ARM Template History      │         │
│  │  │ Dashboard   │  │    │    - Audit Logs               │         │
│  │  │ - VM Status │  │    │    - AI Chat History           │         │
│  │  │ - Spec Diff │  │    └──────────────────────────────┘         │
│  │  │ - ARM Gen   │  │                                              │
│  │  └────────────┘  │    ┌──────────────────────────────┐         │
│  │  ┌────────────┐  │    │  ARM Template Generator       │         │
│  │  │ AI Chat     │  │───▶│  LVM Script Generator          │         │
│  │  │ - Query     │  │    │  NSG Rule Generator            │         │
│  │  │ - Validate  │  │    │  Tag Script Generator          │         │
│  │  └────────────┘  │    └──────────────────────────────┘         │
│  └──────┬───────────┘                                              │
│         │  Service Principal (Scoped RBAC)                         │
│         │                                                          │
│  ┌──────▼────────────────────────────────────────────────────┐    │
│  │  Permitted Resource Groups (configured via env vars)       │    │
│  └───────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Clone
git clone https://github.com/iswandulla/Inf-Dep-Gen.git
cd Inf-Dep-Gen

# Install
npm install

# Configure
cp .env.example .env
# Edit .env with your Azure credentials and settings

# Add server specs
# Place your server spec .md files in docs/server-specs/
# See docs/server-specs/SPEC-TEMPLATE.md for the expected format

# Run
npm run dev

# Test
npm test
```

## Configuration

All environment-specific values are driven by environment variables. See `.env.example` for a complete list.

Key variables:
- `APP_ENVIRONMENT` — Environment name (default: "lab")
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — Login credentials
- `PERMITTED_RESOURCE_GROUPS` — Comma-separated list of allowed Azure resource groups
- `AZURE_RG_*` — Named resource groups
- `COSMOS_DB_DATABASE` — Database name (default: "infDepGen")
- `ANTHROPIC_API_KEY` — Claude API key for AI features

## Project Structure

```
inf-dep-gen/
├── src/
│   ├── frontend/                    # Dashboard and AI Chat UI (React + Vite + Tailwind)
│   │   └── src/pages/              # Login, Dashboard, AiChat
│   ├── backend/
│   │   ├── api/                     # REST API routes
│   │   ├── services/               # Generators, parsers, Azure discovery
│   │   │   └── ai/                 # Claude integration (chat, tools, guardrails)
│   │   ├── middleware/             # Auth, guardrails, audit logging
│   │   └── config/                 # App config, Cosmos DB client
├── infrastructure/                  # Bicep templates, deployment scripts
├── docs/
│   ├── server-specs/               # Per-server specification files
│   ├── GUARDRAILS.md               # Safety rules
│   └── ...                         # Architecture, logging, RBAC, etc.
├── templates/                       # Generated ARM template output
├── scripts/                         # Generated LVM/NSG/tag scripts
└── tests/                          # Unit and integration tests
```

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture/ARCHITECTURE.md) | System design, components, data flow |
| [Guardrails](docs/GUARDRAILS.md) | Safety rules preventing harmful operations |
| [Logging](docs/LOGGING.md) | AI chat and infrastructure change audit |
| [RBAC](docs/RBAC.md) | Service principal, custom roles, permitted RGs |
| [Tagging](docs/TAGGING.md) | Azure tag standards |
| [Deficiencies](docs/DEFICIENCIES.md) | Deficiency tracking template |
| [Server Specs](docs/server-specs/) | Per-server specifications |
| [Contributing](docs/CONTRIBUTING.md) | Development setup and conventions |

## License

UNLICENSED — Private repository
