# Known Deficiencies — Environment Audit

This document tracks deficiencies found during audits of managed Azure environments. These issues inform the validation rules that the Infrastructure Deployment Generator enforces.

---

## How to Use This Document

Add deficiency entries following the format below. Each entry should include:
- **Issue ID**: Unique identifier (e.g., DEF-SKU-001)
- **Category**: Wrong SKU, Missing Disks, Security, etc.
- **Hostname**: Affected server(s)
- **Description**: What's wrong
- **Priority**: P1 (critical), P2 (important), P3 (minor)
- **Status**: Open, In Progress, Resolved, Needs Clarification

## Deficiency Categories

| Category | Description |
|----------|-------------|
| Wrong SKU | VM deployed with incorrect SKU/size |
| Missing Disks | Required data disks not attached |
| Incorrect Disks | Wrong disk size, type, or count |
| Wrong Region | VM in unexpected Azure region |
| Missing Server | Server in spec but not built |
| Security | NSG, public access, admin user issues |
| Missing Backup | Required backup disks not configured |
| Data Entry Error | Specification has invalid/unclear values |

## Template

```
| Issue ID | Category | Hostname | Description | Priority | Status |
|----------|----------|----------|-------------|----------|--------|
| DEF-XXX-001 | Category | SERVER-01 | Description | P1 | Open |
```

---

## Active Deficiencies

*No deficiencies recorded. Run `compare_spec_vs_actual` via the AI assistant to discover drift.*
