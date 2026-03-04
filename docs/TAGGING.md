# Azure Tagging Standards

All resources managed by Infrastructure Deployment Generator must have the following tags applied. Tags are enforced by the application and validated during ARM template generation.

## Required Tags

| Tag Key | Description | Example Values |
|---------|-------------|----------------|
| `Environment` | Deployment environment | `Prod`, `Build`, `Training`, `DR` |
| `Owner` | Responsible team or person | `Will Mason`, `Customer IT` |
| `Cost Center` | Billing/cost allocation code | `IT` |
| `Epic Module` | Epic tier or functional area | `ProdDB`, `ReportDB`, `ClaritySQL`, `CaboodleSQL`, `CubeSQL`, `WebService`, `Presentation`, `Cogito` |
| `Data Classification` | Data sensitivity level | `PHI`, `Internal`, `Public` |
| `Application` | Parent application | `Epic` |

## Tag Values by Server Type

### Operational Database Servers

| Hostname | Environment | Epic Module | Data Classification |
|----------|-------------|-------------|---------------------|
| EUS2-EPPRDODB | Prod | ProdDB | PHI |
| EUS2-ENSUPODB | Prod | SupportDB | PHI |
| EUS2-EPRPTODB | Prod | ReportDB | PHI |
| WUS2-EPPRDODB | DR | ProdDB | PHI |
| EUS2-ENTSTODB | Build | TestDB | PHI |
| EUS2-ENTRNODB | Training | TrainingDB | PHI |

### Relational Database Servers

| Hostname | Environment | Epic Module | Data Classification |
|----------|-------------|-------------|---------------------|
| EUS2-EPCLR01 | Prod | ClaritySQL | PHI |
| EUS2-EPCAB01 | Prod | CaboodleSQL | PHI |
| EUS2-EPCUB01 | Prod | CubeSQL | PHI |
| WUS2-ENCLR01 | Build | ClaritySQL | PHI |
| WUS2-ENCAB01 | Build | CaboodleSQL | PHI |
| WUS2-ENCUB01 | Build | CubeSQL | PHI |

## Disk-Level Tags

Data disks must also be tagged with the volume group or purpose they belong to:

| Tag Key | Description | Example Values |
|---------|-------------|----------------|
| `VolumeGroup` | LVM volume group name (Linux) or disk purpose (Windows) | `prdvg`, `prdjrnvg`, `prdinstvg`, `ReportDB`, `StageDB`, `LogFiles` |
| `ServerName` | The VM this disk is attached to | `EUS2-EPPRDODB` |
| `DiskIndex` | Sequential index within the volume group | `1`, `2`, `3` ... |

### Example: EUS2-EPPRDODB Disk Tags

```
Disk: EUS2-EPPRDODB-prdvg-01
Tags:
  Application: Epic
  Environment: Prod
  Epic Module: ProdDB
  VolumeGroup: prdvg
  ServerName: EUS2-EPPRDODB
  DiskIndex: 1
  Data Classification: PHI
```

## Tag Application

Tags are applied through:
1. **ARM templates** — Tags are embedded in the resource definition at generation time
2. **PowerShell remediation** — For existing resources missing tags (based on `Epic Tags.ps1` pattern)
3. **Azure Policy** — Deny deployment of resources without required tags (future enforcement)

## Validation

The Infrastructure Deployment Generator validator checks:
- All required tags are present on every managed resource
- Tag values match the server spec document
- Disk tags correctly reference their volume group and parent server
- No orphaned disks (disks without a ServerName tag)

## Reference Script

The tagging pattern from the existing `Epic Tags.ps1`:

```powershell
$tags = @{
    "Environment"         = "Prod"
    "Owner"               = "Will Mason"
    "Cost Center"         = "IT"
    "Epic Module"         = "ProdDB"
    "Data Classification" = "PHI"
    "Application"         = "Epic"
}
```

Infrastructure Deployment Generator generates this per-server with the correct values from the spec documents.
