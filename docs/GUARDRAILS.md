# Safety Guardrails

This document defines the hard rules that Infrastructure Deployment Generator enforces to prevent harm to the environment. These rules are non-negotiable and cannot be overridden by AI conversation or user actions without explicit multi-step approval.

## Guiding Principles

1. **Do no harm** — The system must never make a change that could cause an outage or data loss
2. **Least privilege** — Only the minimum required permissions are granted
3. **Human in the loop** — Destructive or high-impact changes require explicit human approval
4. **Full auditability** — Every action and decision is logged
5. **Fail closed** — If a guardrail cannot determine whether an action is safe, it blocks the action
6. **Spec-driven** — Every generated ARM template, LVM script, and NSG rule must trace back to an approved spec document

---

## Rule Categories

### Category 1: BLOCKED — Never Allowed

These operations are permanently blocked. The system will refuse to execute them regardless of who requests them.

| Rule ID | Rule | Reason |
|---------|------|--------|
| G-BLK-001 | **No VM deletion** | VMs must never be deleted through this application |
| G-BLK-002 | **No resource group deletion** | Resource groups must never be deleted |
| G-BLK-003 | **No disk deletion** | Managed disks must never be deleted |
| G-BLK-004 | **No VNet/subnet/NIC modification** | Network topology is managed externally |
| G-BLK-005 | **No identity/RBAC changes** | The app cannot modify service principals, role assignments, or AAD objects |
| G-BLK-006 | **No operations outside permitted RGs** | Only the allowlisted resource groups are accessible |
| G-BLK-007 | **No public IP creation** | Public IPs cannot be created or assigned |
| G-BLK-008 | **No storage account deletion** | Storage accounts cannot be deleted |
| G-BLK-009 | **No snapshot deletion** | VM snapshots cannot be deleted |
| G-BLK-010 | **No key vault operations** | Key Vault secrets, keys, and certificates cannot be modified |
| G-BLK-011 | **No disk size decrease** | Disks can never be shrunk |
| G-BLK-012 | **No LVM volume group removal** | Once created, VGs cannot be removed via this app |
| G-BLK-013 | **No OS disk public access** | OS disks must be set to deny all network access |

### Category 2: APPROVAL REQUIRED — Human Confirmation Mandatory

These operations are allowed but require explicit human approval before execution. The approval must include the user's identity and a reason.

| Rule ID | Rule | Approval Flow |
|---------|------|---------------|
| G-APR-001 | **VM resize (SKU change)** | Display current vs proposed SKU, estimated downtime, cost impact → require confirmation |
| G-APR-002 | **VM power off** | Display VM name, current state, dependent services → require confirmation |
| G-APR-003 | **Disk resize (increase)** | Display current vs proposed size, cost impact → require confirmation |
| G-APR-004 | **Disk type change** | Display current vs proposed type (Standard/Premium/Ultra), performance impact → require confirmation |
| G-APR-005 | **VM restart** | Display VM name, uptime, active connections → require confirmation |
| G-APR-006 | **Bulk operations (3+ VMs)** | List all affected VMs, require individual acknowledgment → require confirmation |
| G-APR-007 | **Add new data disk** | Must match spec, show VG assignment, LUN, IOPS/throughput/size → require confirmation |
| G-APR-008 | **ARM template generation** | Display full template diff, affected resources, cost impact → require confirmation before deployment |
| G-APR-009 | **LVM script execution** | Display script, target server, VG/LV changes → require confirmation |
| G-APR-010 | **NSG rule modification** | Display current vs proposed rules, affected ports/IPs → require confirmation |
| G-APR-011 | **Tag changes** | Display current vs proposed tags → require confirmation |

### Category 3: ALLOWED — Automatic Execution

These operations are safe to perform without additional approval.

| Rule ID | Rule |
|---------|------|
| G-ALW-001 | **Read VM properties** (SKU, status, disks, tags) |
| G-ALW-002 | **Read resource group properties** |
| G-ALW-003 | **List VMs across permitted resource groups** |
| G-ALW-004 | **Query audit logs** |
| G-ALW-005 | **Query AI chat history** |
| G-ALW-006 | **Read server specification documents** |
| G-ALW-007 | **VM power on** (starting a stopped VM) |
| G-ALW-008 | **Generate ARM template preview** (read-only, not deploy) |
| G-ALW-009 | **Generate LVM script preview** (read-only, not execute) |
| G-ALW-010 | **Run validation checks** (spec vs. actual state comparison) |
| G-ALW-011 | **Read NSG rules** |
| G-ALW-012 | **Read tags** |

---

## Guardrail Enforcement

### Pre-Execution Checks

Before any operation, the guardrails engine performs:

```
1. Is the target resource in a PERMITTED resource group?
   → NO: Block immediately (G-BLK-006)

2. Is the operation in the BLOCKED category?
   → YES: Block immediately, log the attempt

3. Does a spec document exist for this server?
   → NO: Block changes (read-only allowed)

4. Does the proposed change match the spec document?
   → NO: Block, display spec vs. proposed diff

5. Is the operation in the APPROVAL REQUIRED category?
   → YES: Pause execution, present details to user, await confirmation

6. Has the approval expired? (approvals are valid for 5 minutes)
   → YES: Request fresh approval

7. Execute the operation and log the result
```

### AI Conversation Guardrails

The AI chat interface has additional rules:

| Rule ID | Rule |
|---------|------|
| G-AI-001 | The AI cannot execute any operation without presenting it to the user first |
| G-AI-002 | The AI must explain the impact of a requested change before asking for approval |
| G-AI-003 | The AI cannot chain multiple destructive operations in a single request |
| G-AI-004 | The AI must refuse ambiguous requests ("resize all servers") and ask for clarification |
| G-AI-005 | The AI must display a summary of changes after every operation completes |
| G-AI-006 | The AI cannot suggest or perform operations outside its permitted scope |
| G-AI-007 | The AI rate limit: maximum 10 VM-modifying operations per hour |
| G-AI-008 | The AI must validate disk-to-VG mappings before generating add-disk ARM/LVM output |
| G-AI-009 | The AI must reference the spec document when answering configuration questions |
| G-AI-010 | The AI must warn if a requested change conflicts with a known deficiency |

---

## Resource Group Allowlist

The service principal is scoped to ONLY these resource groups:

```json
{
  "permittedResourceGroups": [
    "eus2-rg-epic-prod-01",
    "wus2-rg-epic-prod-01",
    "eus2-rg-net-epic-prod-01",
    "wus2-rg-net-epic-prod-01",
    "eus2-rg-esan-prod-01",
    "wus2-rg-esan-prod-01",
    "wus2-rg-avs-prod-01"
  ]
}
```

**Adding a new resource group requires:**
1. Updating the allowlist in configuration
2. Assigning the service principal the appropriate role on the new RG
3. A code/config deployment
4. An entry in the audit log documenting the change and who approved it

---

## SKU Guardrails

| Rule ID | Rule |
|---------|------|
| G-SKU-001 | VM can only be resized to SKUs listed in the server's spec document |
| G-SKU-002 | If no spec document exists for a VM, resize is BLOCKED |
| G-SKU-003 | SKU changes that increase monthly cost by >50% require additional justification |
| G-SKU-004 | SKU families cannot be changed (e.g., D-series to E-series) without explicit spec update |
| G-SKU-005 | Generated ARM templates must use the exact SKU from the spec (no fallbacks) |

## Disk Guardrails

| Rule ID | Rule |
|---------|------|
| G-DSK-001 | Disks can only be increased in size, never decreased |
| G-DSK-002 | Disk type changes must match the spec document |
| G-DSK-003 | Maximum disk size is capped at the value in the spec document |
| G-DSK-004 | Adding new data disks requires spec document approval |
| G-DSK-005 | Premium SSD v2 disks must have IOPS and throughput set per spec (not defaults) |
| G-DSK-006 | Disk-to-VG mapping must be maintained — every disk must tag its VolumeGroup |
| G-DSK-007 | LUN assignments must be sequential and not conflict with existing disks |
| G-DSK-008 | OS disks must deny public network access (see DEF-ODB-009) |
| G-DSK-009 | Snapshot quantities must match spec document |

## LVM Guardrails (Linux ODB Servers)

| Rule ID | Rule |
|---------|------|
| G-LVM-001 | VG names must exactly match the spec document (prdvg, prdjrnvg, epicvg, etc.) |
| G-LVM-002 | New disks added to a VG must match the existing disk specs (type, IOPS, throughput) |
| G-LVM-003 | LV names must follow the naming convention: `{purpose}lv` (e.g., prdlv, jrnlv, instlv) |
| G-LVM-004 | Generated LVM scripts must include validation checks (verify disks exist before pvcreate) |
| G-LVM-005 | LVM scripts must never format existing volumes or destroy existing data |
| G-LVM-006 | Adding a disk to a VG must extend the VG (vgextend), not recreate it |

## NSG Guardrails

| Rule ID | Rule |
|---------|------|
| G-NSG-001 | Every VM must have an NSG assigned (see DEF-ODB-008) |
| G-NSG-002 | NSG rules must be generated per server spec, not shared globally |
| G-NSG-003 | No inbound rules allowing 0.0.0.0/0 (any source) on management ports (SSH/RDP) |
| G-NSG-004 | Generated NSG rules must be reviewed before deployment |
| G-NSG-005 | Default outbound must not use Azure's default public IP (see DEF-ODB-011) |

## Tagging Guardrails

| Rule ID | Rule |
|---------|------|
| G-TAG-001 | All 6 required tags must be present: Environment, Owner, Cost Center, Epic Module, Data Classification, Application |
| G-TAG-002 | Data disks must have VolumeGroup, ServerName, and DiskIndex tags |
| G-TAG-003 | Tag values must match the spec document |
| G-TAG-004 | Generated ARM templates must embed all required tags |

---

## ARM Template Generation Guardrails

| Rule ID | Rule |
|---------|------|
| G-ARM-001 | ARM templates can only be generated for servers with a spec document |
| G-ARM-002 | Generated templates must include all disks, tags, and availability config from spec |
| G-ARM-003 | Templates must target the correct region (EUS2 or WUS2 per spec) |
| G-ARM-004 | Templates must use Premium SSD v2 with explicit IOPS/throughput where specified |
| G-ARM-005 | Templates must not include public IP addresses |
| G-ARM-006 | Templates must set OS disk network access to "deny all" |
| G-ARM-007 | Templates must be validated (`az deployment group validate`) before being marked ready |
| G-ARM-008 | Template output must include a human-readable summary of all resources created |

---

## Incident Response

If a guardrail is bypassed or a harmful action occurs:

1. The system logs the incident with full context
2. The service principal can be immediately disabled via Azure AD
3. All pending operations are cancelled
4. An alert is sent to the operations team

## Versioning

Changes to guardrail rules must be:
- Documented in this file
- Reviewed by at least one other team member
- Deployed through the standard CI/CD pipeline
- Logged in the audit trail with before/after state
