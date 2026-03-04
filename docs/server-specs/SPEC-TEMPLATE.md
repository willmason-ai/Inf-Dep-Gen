# Server Specification Template

> Copy this file for each server that the Infrastructure Deployment Generator will manage.
> Filename convention: `{vm-name}.md` (e.g., `EPIC-APP-01.md`)

---

## Server Identity

| Field | Value |
|-------|-------|
| **VM Name** | |
| **Resource Group** | |
| **Azure Resource ID** | |
| **Environment** | Production / Staging / Dev / DR |
| **Application** | (e.g., Database, Web Server, App Server) |
| **Owner** | |
| **Last Updated** | |
| **Updated By** | |

---

## Compute Configuration

### Current State

| Field | Value |
|-------|-------|
| **VM SKU** | (e.g., Standard_D4s_v3) |
| **vCPUs** | |
| **RAM (GB)** | |
| **VM Generation** | Gen1 / Gen2 |
| **Availability Zone** | |
| **Availability Set** | |

### Permitted SKU Changes

List the SKUs this VM is allowed to be resized to. The guardrails engine will block any resize to an unlisted SKU.

| Permitted SKU | vCPUs | RAM (GB) | Notes |
|--------------|-------|----------|-------|
| | | | |
| | | | |
| | | | |

### SKU Restrictions

| Restriction | Value |
|------------|-------|
| **Minimum SKU** | (e.g., Standard_D2s_v3) |
| **Maximum SKU** | (e.g., Standard_D16s_v3) |
| **Allowed SKU Family** | (e.g., Dsv3 only) |
| **Max Monthly Cost** | (optional cost cap) |

---

## Disk Configuration

### OS Disk

| Field | Value |
|-------|-------|
| **Disk Name** | |
| **Disk Type** | Premium_LRS / StandardSSD_LRS / Standard_LRS / UltraSSD_LRS |
| **Current Size (GB)** | |
| **Maximum Size (GB)** | |
| **Caching** | ReadOnly / ReadWrite / None |
| **Encryption** | Platform-managed / Customer-managed |

### Data Disks

| Disk Name | LUN | Type | Current Size (GB) | Max Size (GB) | Caching | Purpose |
|-----------|-----|------|-------------------|---------------|---------|---------|
| | | | | | | |
| | | | | | | |
| | | | | | | |

### Disk Rules

| Rule | Value |
|------|-------|
| **Max Total Data Disks** | |
| **Allowed Disk Types** | (e.g., Premium_LRS only) |
| **Max Single Disk Size** | |
| **Can Add New Disks** | Yes / No |

---

## Operating System

| Field | Value |
|-------|-------|
| **OS** | Windows Server 2019 / 2022 / Ubuntu 20.04 / etc. |
| **OS Disk Image** | |
| **License Type** | Azure Hybrid Benefit / PAYG |

---

## Network (Read-Only Reference)

> These fields are for reference only. The Infrastructure Deployment Generator cannot modify network settings.

| Field | Value |
|-------|-------|
| **VNet** | |
| **Subnet** | |
| **Private IP** | |
| **NIC** | |
| **NSG** | |

---

## Maintenance Windows

| Field | Value |
|-------|-------|
| **Preferred Maintenance Window** | (e.g., Sunday 02:00-06:00 EST) |
| **Blackout Periods** | (e.g., Month-end, go-live dates) |
| **Restart Allowed** | During maintenance window only / Anytime / Never without approval |

---

## Change History

| Date | Change | Previous Value | New Value | Changed By | Approved By |
|------|--------|---------------|-----------|------------|-------------|
| | | | | | |

---

## Notes

<!-- Any additional context, dependencies, or special considerations -->
