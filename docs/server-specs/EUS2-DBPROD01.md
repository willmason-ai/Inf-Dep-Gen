# EUS2-DBPROD01 — Production Database Server

## Server Identity

| Field | Value |
|-------|-------|
| **Hostname** | EUS2-DBPROD01 |
| **Role** | Production Database |
| **OS** | RHEL-8 LVM Gen2 |
| **Region** | East US 2 |
| **Resource Group** | eus2-rg-prod-01 |

## Compute Configuration

| Field | Value |
|-------|-------|
| **Required SKU** | Standard_E16s_v5 |
| **OS Disk Type** | Premium_LRS |

## Tags

| Tag | Value |
|-----|-------|
| Environment | Prod |
| Owner | Infrastructure Team |
| Cost Center | IT |
| Application | Database |
| Data Classification | Confidential |
| Module | ProdDB |

## Volume Groups

### dbinstvg

| Field | Value |
|-------|-------|
| **Disk Type** | PremiumV2_LRS |
| **Number of Disks** | 1 |
| **IOPS** | 5000 |
| **Throughput** | 200 MB/s |
| **Size Per Disk** | 128 GB |

### dbdatavg

| Field | Value |
|-------|-------|
| **Disk Type** | PremiumV2_LRS |
| **Number of Disks** | 4 |
| **IOPS** | 5000 |
| **Throughput** | 200 MB/s |
| **Size Per Disk** | 256 GB |

### dbjrnvg

| Field | Value |
|-------|-------|
| **Disk Type** | PremiumV2_LRS |
| **Number of Disks** | 1 |
| **IOPS** | 5000 |
| **Throughput** | 200 MB/s |
| **Size Per Disk** | 64 GB |

## LVM Configuration Reference

```bash
# PV/VG creation for EUS2-DBPROD01
pvcreate /dev/sdc
vgcreate dbinstvg /dev/sdc

pvcreate /dev/sdd /dev/sde /dev/sdf /dev/sdg
vgcreate dbdatavg /dev/sdd /dev/sde /dev/sdf /dev/sdg

pvcreate /dev/sdh
vgcreate dbjrnvg /dev/sdh
```
