# Infrastructure Deployment Generator — Context Management Plan

## Purpose

This project spans multiple knowledge domains, Azure regions, server types, and tooling layers. As the scope grows, maintaining coherent context across conversations, documents, and generated artifacts is critical. This plan defines how project knowledge is organized, where authoritative data lives, and how to navigate the project without losing track.

---

## 1. Knowledge Domains

The project is organized into **7 distinct knowledge domains**. Each domain has a single source of truth and clear boundaries.

| # | Domain | Source of Truth | Key Files | Changes By |
|---|--------|----------------|-----------|------------|
| 1 | **Server Specifications** | `docs/server-specs/*.md` | One file per named server (12 total) + `WEB-SERVICE-SERVERS.md` | Manual update from Epic spreadsheet |
| 2 | **Deficiency Tracking** | `docs/DEFICIENCIES.md` | Deficiency IDs (DEF-*), remediation priorities | Updated when audit runs or fixes are applied |
| 3 | **ARM Template Generation** | `lab-arm-templates/` (lab) or `templates/` (prod) | Per-server `.json` ARM files | Regenerated from server specs |
| 4 | **LVM Script Generation** | `lab-bash-scripts/` (lab) or `scripts/` (prod) | Per-server `-lvm-setup.sh` files | Regenerated from server specs |
| 5 | **Networking & Infrastructure** | `infrastructure/lab/` and `infrastructure/prod/` | Bicep/ARM for VNets, Bastion, peering, RGs | Manual / planned changes |
| 6 | **Application (Infrastructure Deployment Generator)** | `src/frontend/` + `src/backend/` | App Service, Cosmos DB, API, AI chat | Development sprints |
| 7 | **Security & Governance** | `docs/GUARDRAILS.md`, `docs/RBAC.md`, `docs/TAGGING.md` | Rules, roles, tag requirements | Policy changes |

---

## 2. Document Hierarchy

```
CLAUDE.md                          ← AI context anchor (always loaded)
├── docs/
│   ├── architecture/ARCHITECTURE.md   ← System design (how it all fits)
│   ├── DEFICIENCIES.md                ← What's wrong (spec vs actual)
│   ├── GUARDRAILS.md                  ← What's forbidden/allowed
│   ├── RBAC.md                        ← Who can do what
│   ├── TAGGING.md                     ← Required Azure tags
│   ├── LOGGING.md                     ← Audit trail design
│   ├── CONTEXT-MANAGEMENT.md          ← This file (how to navigate)
│   ├── server-specs/                  ← Per-server ground truth
│   │   ├── EUS2-EPPRDODB.md
│   │   ├── EUS2-ENSUPODB.md
│   │   ├── EUS2-EPRPTODB.md
│   │   ├── WUS2-EPPRDODB.md
│   │   ├── EUS2-ENTSTODB.md
│   │   ├── EUS2-ENTRNODB.md
│   │   ├── EUS2-EPCLR01.md
│   │   ├── EUS2-EPCAB01.md
│   │   ├── EUS2-EPCUB01.md
│   │   ├── WUS2-ENCLR01.md
│   │   ├── WUS2-ENCAB01.md
│   │   └── WUS2-ENCUB01.md
│   └── runbooks/
│       └── INCIDENT-RESPONSE.md
├── infrastructure/
│   ├── lab/                           ← Lab deployment artifacts
│   │   ├── lab-networking.bicep
│   │   ├── lab-deploy.sh
│   │   └── lab-parameters.json
│   └── prod/                          ← Production Bicep (future)
├── Customer Linux Arms And Build/
│   ├── lab-config.json                ← Lab SKU mapping
│   ├── lab-arm-templates/             ← 12 generated lab ARM templates
│   ├── lab-bash-scripts/              ← 6 generated lab LVM scripts
│   ├── arm-templates/                 ← Original first-build (reference only)
│   ├── bash-scripts/                  ← Original first-build (reference only)
│   └── all_servers.json               ← Original server data (HAS ERRORS)
└── Templates-As-built-02-22-2026/     ← Customer RG exports (reference only)
    ├── eus2-rg-epic-01.json
    ├── eus2-rg-net-epic-01.json
    └── wus2-rg-net-epic-01.json
```

---

## 3. Naming Conventions

### Server Hostnames
```
{REGION}-{STAMP}{ROLE}{NN}
```
- **Region**: `EUS2` (East US 2) or `WUS2` (West US 2)
- **Stamp**: `EP` (Production), `EN` (Non-Production/Build), `ET` (Training)
- **Role**: `PRDODB` (Prod ODB), `SUPODB` (Support ODB), `RPTODB` (Report ODB), `TRNODB` (Training ODB), `TSTODB` (Test ODB), `CLR` (Clarity), `CAB` (Caboodle), `CUB` (Cube)
- **NN**: Instance number (01, 02, etc.)

### Azure Resources (Lab)
```
lab-{region}-{resource-type}-epic-{stamp}-{nn}
```
Examples:
- `lab-eus2-rg-epic-prod-01` (resource group)
- `lab-eus2-vnet-epic-01` (virtual network)
- `lab-eus2-bastion-epic-01` (bastion)

### Generated Files
```
{hostname}.json                    ← ARM template
{hostname}-lvm-setup.sh           ← LVM script
```

---

## 4. Data Flow & Dependencies

```
Epic Spreadsheet (xlsx)
    │
    ▼
docs/server-specs/*.md  ◄──────── Source of truth for each server
    │
    ├──► ARM Template Generator ──► lab-arm-templates/*.json
    │                                     │
    ├──► LVM Script Generator ──► lab-bash-scripts/*-lvm-setup.sh
    │                                     │
    ├──► NSG Rule Generator ──► (future)  │
    │                                     │
    └──► Tag Script Generator ──► (future)│
                                          │
                                          ▼
                              Azure Deployment (az deployment group create)
                                          │
                                          ▼
                              LVM Configuration (ssh + sudo bash)
```

**Key dependency**: If a server spec changes, ALL downstream artifacts (ARM template, LVM script, NSG rules, tags) must be regenerated.

---

## 5. Environment Matrix

| Aspect | Lab | Production |
|--------|-----|------------|
| **Subscription** | Will Mason / Presidio Lab | Customer |
| **RGs (Compute)** | `lab-eus2-rg-epic-prod-01`, `lab-wus2-rg-epic-prod-01` | `eus2-rg-epic-prod-01`, `wus2-rg-epic-prod-01` |
| **RGs (Network)** | `lab-eus2-rg-net-epic-01`, `lab-wus2-rg-net-epic-01` | `eus2-rg-net-epic-prod-01`, `wus2-rg-net-epic-prod-01` |
| **VM SKUs** | D-series (D2s_v5 through D16s_v5) | M-series, E-series, D-series (per spec) |
| **Disk Type** | StandardSSD_LRS | PremiumV2_LRS |
| **Disk Sizes** | 4 GB (all) | Per spec (60 GB - 1500 GB) |
| **IOPS/Throughput** | N/A (Standard SSD) | Per spec (3000-6000 IOPS) |
| **Availability Zones** | Not used | Required (zones 1-3) |
| **VNet Addresses** | 10.100.0.0/23 (EUS2), 10.100.2.0/23 (WUS2) | 10.240.150.0/23 (EUS2), 10.241.150.0/23 (WUS2) |
| **Bastion** | Yes (EUS2 only) | Yes (EUS2 only) |
| **VNet Peering** | Direct (lab-eus2 ↔ lab-wus2) | Via hub VNets |
| **Purpose** | Validate ARM templates + LVM layouts | Customer infrastructure |

---

## 6. Conversation Context Strategy

### Problem
This project will span many AI conversations. Each conversation has limited context. We need a strategy to maintain continuity.

### Approach: File-Based Context Anchoring

1. **CLAUDE.md** is always loaded. It contains the master inventory of servers, RGs, rules, and project structure. Keep it updated as the canonical reference.

2. **Per-domain deep dives**: When working on a specific server, read its spec file. When working on deficiencies, read DEFICIENCIES.md. Don't try to load everything at once.

3. **Generated artifacts are disposable**: ARM templates and LVM scripts can always be regenerated from server specs. The specs are the source of truth, not the generated files.

4. **Reference files are read-only**: The `Templates-As-built-02-22-2026/` folder and `all_servers.json` are historical references. Never modify them. They document what was built (with errors) and help validate corrections.

### Context Loading Priority

When starting a new conversation, load files in this order based on the task:

| Task | Files to Load |
|------|--------------|
| **General project work** | `CLAUDE.md` only (it has the summary) |
| **Fix a specific server** | `CLAUDE.md` + `docs/server-specs/{hostname}.md` + the generated ARM template |
| **Review deficiencies** | `CLAUDE.md` + `docs/DEFICIENCIES.md` |
| **Lab deployment** | `CLAUDE.md` + `lab-config.json` + `infrastructure/lab/` |
| **App development** | `CLAUDE.md` + `docs/architecture/ARCHITECTURE.md` |
| **Security review** | `CLAUDE.md` + `docs/GUARDRAILS.md` + `docs/RBAC.md` |
| **Networking** | `CLAUDE.md` + `infrastructure/lab/lab-networking.bicep` |

### Cross-Conversation Handoff Protocol

When ending a conversation that has unfinished work:
1. Update `CLAUDE.md` if any servers, RGs, or rules changed
2. Update the relevant server spec if disk/SKU info changed
3. Note any pending items in a `TODO.md` at project root
4. Generated artifacts should be committed or saved — they represent validated state

---

## 7. Server Quick Reference

### Linux ODB Servers (RHEL-8, LVM)

| Hostname | Role | Region | VGs | Disk Count |
|----------|------|--------|-----|------------|
| EUS2-EPPRDODB | Production ODB | EUS2 | prdinstvg(1), prdvg(12), prdjrnvg(1) | 14 |
| EUS2-ENSUPODB | Support ODB | EUS2 | epicvg(1), [env]vg(12) | 13 |
| EUS2-EPRPTODB | Reporting ODB | EUS2 | rptinstvg(4), rptvg(12), rptjrnvg(1) | 17 |
| WUS2-EPPRDODB | DR ODB | WUS2 | drinstvg(1), drvg(12), drjrnvg(1) | 14 |
| EUS2-ENTSTODB | Test ODB | EUS2 | epicvg(1), [env]vg(5) | 6 |
| EUS2-ENTRNODB | Training ODB | EUS2 | epicvg(1), [env]vg(10) | 11 |

### Windows SQL Servers (Windows Server 2022)

| Hostname | Role | Region | Disk Groups | Disk Count |
|----------|------|--------|-------------|------------|
| EUS2-EPCLR01 | Clarity Prod | EUS2 | Report(8), Stage(2), Log(3) | 13 |
| EUS2-EPCAB01 | Caboodle Prod | EUS2 | Report(8), Stage(4), Log(3), SlicerDicer(1) | 16 |
| EUS2-EPCUB01 | Cube Prod | EUS2 | Database(1) | 1 |
| WUS2-ENCLR01 | Clarity Build | WUS2 | Report(8), Stage(2), Log(3), Test(1) | 14 |
| WUS2-ENCAB01 | Caboodle Build | WUS2 | Report(8), Stage(4), Log(3), SlicerDicer(1), Test(1) | 17 |
| WUS2-ENCUB01 | Cube Build | WUS2 | Database(1) | 1 |

---

## 8. Known Data Quality Issues

These are documented errors in source data that affect downstream artifacts:

| Issue | Location | Status | Impact |
|-------|----------|--------|--------|
| `all_servers.json` has wrong VG names for WUS2-EPPRDODB | `all_servers.json` line 74-99 | Documented, corrected in lab templates | rpt* VGs should be dr* VGs |
| `all_servers.json` has wrong VG names for EUS2-ENTSTODB | `all_servers.json` line 102-148 | Documented, corrected in lab templates | Has DR VGs, should have test VGs |
| EUS2-EPCAB01 Log disk count shows "Log-" in Excel | Excel Storage BOM | Assumed 3 disks | Pending clarification from Epic |
| EUS2-EPRPTODB shows no volumes in `all_servers.json` | `all_servers.json` line 60-67 | Corrected in lab templates | Should have 17 disks across 3 VGs |
| Disk size swaps (prdvg 1500 vs spec 1300, prdjrnvg 1200 vs spec 1500) | `all_servers.json` vs Excel | Corrected in lab templates | Swapped capacity values |
| IOPS value "epic" for EUS2-ENTSTODB epicvg | `all_servers.json` line 137 | Corrected to 3000 in lab | Typo in source data |

---

## 9. Project Phases

| Phase | Description | Status | Key Deliverables |
|-------|-------------|--------|-----------------|
| **Phase 0: Planning** | Document everything, build context | **Active** | CLAUDE.md, server specs, deficiencies, this plan |
| **Phase 1: Lab Build** | Deploy lab infra + all 12 VMs | **Active** | Lab ARM templates, LVM scripts, lab networking |
| **Phase 2: Lab Validate** | Run LVM scripts, verify disk layouts | Pending | Validation reports, fixes |
| **Phase 3: App Scaffold** | Build Infrastructure Deployment Generator app skeleton | Pending | App Service, Cosmos DB, basic UI |
| **Phase 4: Generators** | ARM, LVM, NSG, Tag generators in the app | Pending | Working generators fed by Cosmos DB |
| **Phase 5: AI Integration** | Claude-powered chat with tool calling | Pending | Agentic disk/VM operations |
| **Phase 6: Production Prep** | Generate production templates from corrected specs | Pending | Production ARM templates, deployment plan |
| **Phase 7: Remediation** | Fix deficient customer VMs | Pending | Change requests, executed remediations |

---

## 10. Critical Reminders

1. **Server specs are the source of truth** — not `all_servers.json`, not the Excel, not the customer RG exports. If there's a conflict, the spec file wins (after verification).

2. **Lab templates use different settings than production** — Standard SSD vs Premium SSD v2, D-series vs production SKUs, no zones, 4 GB disks. The structural layout (VG names, disk counts, LUN assignments) is identical.

3. **The first-build artifacts have errors** — They are in `Customer Linux Arms And Build/arm-templates/` and `bash-scripts/`. Do not deploy them. Use the corrected `lab-arm-templates/` and `lab-bash-scripts/` instead.

4. **EUS2-ENTRNODB is in the wrong region** — It's currently deployed in WUS2 but spec says EUS2. The lab templates generate it in EUS2 (correct). This is tracked as DEF-REG-001.

5. **Hostname prefix is EUS2/WUS2** — Not USE2/USW2. Some existing Azure resources use the USE2/USW2 prefix (from the first build). The correct convention is EUS2/WUS2.

6. **6 tags are mandatory on every resource** — Environment, Owner, Cost Center, Epic Module, Data Classification, Application. The lab templates include all 6.
