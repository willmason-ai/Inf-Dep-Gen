# WUS2-DBDR01 — DR Database Server

## Server Identity

| Field | Value |
|-------|-------|
| **Hostname** | WUS2-DBDR01 |
| **Role** | DR Database |
| **OS** | RHEL-8 LVM Gen2 |
| **Region** | West US 2 |
| **Resource Group** | wus2-rg-prod-01 |

## Compute Configuration

| Field | Value |
|-------|-------|
| **Required SKU** | Standard_E16s_v5 |
| **OS Disk Type** | Premium_LRS |

## Tags

| Tag | Value |
|-----|-------|
| Environment | DR |
| Owner | Infrastructure Team |
| Cost Center | IT |
| Application | Database |
| Data Classification | Confidential |
| Module | DRDB |

## Volume Groups

### drinstvg

| Field | Value |
|-------|-------|
| **Disk Type** | PremiumV2_LRS |
| **Number of Disks** | 1 |
| **IOPS** | 5000 |
| **Throughput** | 200 MB/s |
| **Size Per Disk** | 128 GB |

### drdatavg

| Field | Value |
|-------|-------|
| **Disk Type** | PremiumV2_LRS |
| **Number of Disks** | 4 |
| **IOPS** | 5000 |
| **Throughput** | 200 MB/s |
| **Size Per Disk** | 256 GB |

### drjrnvg

| Field | Value |
|-------|-------|
| **Disk Type** | PremiumV2_LRS |
| **Number of Disks** | 1 |
| **IOPS** | 5000 |
| **Throughput** | 200 MB/s |
| **Size Per Disk** | 64 GB |

## LVM Configuration Reference

```bash
# PV/VG creation for WUS2-DBDR01
pvcreate /dev/sdc
vgcreate drinstvg /dev/sdc

pvcreate /dev/sdd /dev/sde /dev/sdf /dev/sdg
vgcreate drdatavg /dev/sdd /dev/sde /dev/sdf /dev/sdg

pvcreate /dev/sdh
vgcreate drjrnvg /dev/sdh
```
