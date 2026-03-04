# WUS2-SQLDR01 — DR SQL Server

## Server Identity

| Field | Value |
|-------|-------|
| **Hostname** | WUS2-SQLDR01 |
| **Role** | DR SQL Server |
| **OS** | Windows Server 2022 |
| **Region** | West US 2 |
| **Resource Group** | wus2-rg-prod-01 |

## Compute Configuration

| Field | Value |
|-------|-------|
| **Required SKU** | Standard_E8bds_v5 |
| **OS** | Windows Server 2022 |
| **OS Disk Type** | Premium_LRS |

## Tags

| Tag | Value |
|-----|-------|
| Environment | DR |
| Owner | Infrastructure Team |
| Cost Center | IT |
| Application | SQL Server |
| Data Classification | Confidential |
| Module | DRSQL |

## Data Disk Configuration

### Database

| Field | Value |
|-------|-------|
| **Disk Type** | PremiumV2_LRS |
| **Quantity** | 2 |
| **IOPS** | 5000 |
| **Throughput** | 200 MB/s |
| **Capacity (Per Disk)** | 256 GB |

### Log Files

| Field | Value |
|-------|-------|
| **Disk Type** | PremiumV2_LRS |
| **Quantity** | 1 |
| **IOPS** | 3000 |
| **Throughput** | 125 MB/s |
| **Capacity (Per Disk)** | 128 GB |

## Notes

- DR replica for EUS2-SQLPROD01
