# Service Principal & RBAC Configuration

## Overview

Infrastructure Deployment Generator uses an Azure AD Service Principal to interact with Azure resources. The service principal follows the principle of least privilege — it only has access to explicitly listed resource groups and only the permissions necessary to read and modify VM configurations.

## Service Principal Setup

### 1. Create the Service Principal

```bash
az ad sp create-for-rbac \
  --name "sp-inf-dep-gen" \
  --skip-assignment
```

> **Important**: Use `--skip-assignment` to create the SP without any default permissions. All permissions are explicitly assigned below.

### 2. Store Credentials

Store the following in Azure Key Vault (never in application config or code):

- `appId` (Client ID)
- `password` (Client Secret) — or use certificate-based authentication
- `tenant` (Tenant ID)

### 3. Managed Identity Alternative

For production, consider using a **System-Assigned Managed Identity** on the App Service instead of a Service Principal with a client secret. This eliminates credential management entirely.

```bash
az webapp identity assign \
  --name inf-dep-gen-app \
  --resource-group "Infrastructure Deployment Generator"
```

---

## Role Assignments

### Per Permitted Resource Group

For each resource group that Infrastructure Deployment Generator should manage, assign the following custom role:

```json
{
  "Name": "Infrastructure Deployment Generator VM Manager",
  "Description": "Allows Infrastructure Deployment Generator to read and modify VM configurations within the assigned resource group",
  "Actions": [
    "Microsoft.Compute/virtualMachines/read",
    "Microsoft.Compute/virtualMachines/write",
    "Microsoft.Compute/virtualMachines/start/action",
    "Microsoft.Compute/virtualMachines/powerOff/action",
    "Microsoft.Compute/virtualMachines/restart/action",
    "Microsoft.Compute/virtualMachines/deallocate/action",
    "Microsoft.Compute/virtualMachines/instanceView/read",
    "Microsoft.Compute/disks/read",
    "Microsoft.Compute/disks/write",
    "Microsoft.Compute/snapshots/read",
    "Microsoft.Network/networkSecurityGroups/read",
    "Microsoft.Network/networkInterfaces/read",
    "Microsoft.Network/virtualNetworks/read",
    "Microsoft.Network/virtualNetworks/subnets/read",
    "Microsoft.Resources/subscriptions/resourceGroups/read",
    "Microsoft.Resources/deployments/read",
    "Microsoft.Resources/deployments/write",
    "Microsoft.Resources/deployments/validate/action",
    "Microsoft.Resources/deployments/operationstatuses/read"
  ],
  "NotActions": [
    "Microsoft.Compute/virtualMachines/delete",
    "Microsoft.Compute/disks/delete",
    "Microsoft.Compute/snapshots/delete",
    "Microsoft.Compute/virtualMachines/extensions/*",
    "Microsoft.Compute/virtualMachines/runCommand/*",
    "Microsoft.Network/virtualNetworks/write",
    "Microsoft.Network/virtualNetworks/delete",
    "Microsoft.Network/virtualNetworks/subnets/write",
    "Microsoft.Network/virtualNetworks/subnets/delete",
    "Microsoft.Network/networkInterfaces/delete",
    "Microsoft.Network/networkSecurityGroups/delete",
    "Microsoft.Network/networkSecurityGroups/write",
    "Microsoft.Authorization/*"
  ],
  "AssignableScopes": [
    "/subscriptions/{subscription-id}/resourceGroups/eus2-rg-epic-prod-01",
    "/subscriptions/{subscription-id}/resourceGroups/wus2-rg-epic-prod-01",
    "/subscriptions/{subscription-id}/resourceGroups/eus2-rg-net-epic-prod-01",
    "/subscriptions/{subscription-id}/resourceGroups/wus2-rg-net-epic-prod-01",
    "/subscriptions/{subscription-id}/resourceGroups/eus2-rg-esan-prod-01",
    "/subscriptions/{subscription-id}/resourceGroups/wus2-rg-esan-prod-01",
    "/subscriptions/{subscription-id}/resourceGroups/wus2-rg-avs-prod-01"
  ]
}
```

### Assign the Role

```bash
# Assign to each permitted resource group
for rg in eus2-rg-epic-prod-01 wus2-rg-epic-prod-01 eus2-rg-net-epic-prod-01 wus2-rg-net-epic-prod-01 eus2-rg-esan-prod-01 wus2-rg-esan-prod-01 wus2-rg-avs-prod-01; do
  az role assignment create \
    --assignee {service-principal-app-id} \
    --role "Infrastructure Deployment Generator VM Manager" \
    --scope "/subscriptions/{sub-id}/resourceGroups/$rg"
done
```

### Infrastructure Deployment Generator Resource Group

The service principal needs additional permissions on its own resource group for Cosmos DB access:

```bash
az role assignment create \
  --assignee {service-principal-app-id} \
  --role "Cosmos DB Account Reader Role" \
  --scope "/subscriptions/{sub-id}/resourceGroups/Infrastructure Deployment Generator"
```

> **Note**: Application-level Cosmos DB access is handled via connection strings stored in Key Vault, not RBAC data-plane access. The Reader role above is for control-plane operations only.

---

## Permission Boundaries

### What the Service Principal CAN Do

| Action | Scope |
|--------|-------|
| Read VM properties | Permitted RGs only |
| Resize VMs (change SKU) | Permitted RGs only |
| Start / Stop / Restart VMs | Permitted RGs only |
| Read disk properties | Permitted RGs only |
| Resize disks (increase) | Permitted RGs only |
| Change disk type | Permitted RGs only |
| Read NSG rules | Permitted RGs only |
| Read NIC properties | Permitted RGs only |
| Read VNet / subnet properties | Permitted RGs only |
| Read VM instance view (power state) | Permitted RGs only |
| Read snapshots | Permitted RGs only |
| Deploy ARM templates (validate + write) | Permitted RGs only |
| Read resource group metadata | Permitted RGs only |

### What the Service Principal CANNOT Do

| Action | Enforcement |
|--------|-------------|
| Delete any resource | NotActions in custom role |
| Modify networking (VNet write/delete, NSG write, NIC delete) | Explicitly denied in NotActions |
| Access Key Vault secrets | Not included in Actions |
| Modify RBAC / role assignments | Not included in Actions |
| Run commands on VMs | Explicitly denied in NotActions |
| Install VM extensions | Explicitly denied in NotActions |
| Access storage accounts | Not included in Actions |
| Create new resources | Not included in Actions |
| Access resources outside permitted RGs | Scoped assignment |

---

## Adding a New Resource Group

To extend Infrastructure Deployment Generator's access to a new resource group:

1. **Document the request** — who approved it and why
2. **Create the role assignment**:
   ```bash
   az role assignment create \
     --assignee {service-principal-app-id} \
     --role "Infrastructure Deployment Generator VM Manager" \
     --scope "/subscriptions/{sub-id}/resourceGroups/{new-rg-name}"
   ```
3. **Update the application allowlist** in `appConfig`
4. **Deploy the configuration change**
5. **Record in audit log**

## Removing a Resource Group

1. **Remove the role assignment**:
   ```bash
   az role assignment delete \
     --assignee {service-principal-app-id} \
     --role "Infrastructure Deployment Generator VM Manager" \
     --scope "/subscriptions/{sub-id}/resourceGroups/{rg-name}"
   ```
2. **Remove from application allowlist**
3. **Deploy the configuration change**
4. **Record in audit log**

---

## Security Review Checklist

- [ ] Service principal has no subscription-level roles
- [ ] Custom role uses explicit `Actions` (not wildcards)
- [ ] `NotActions` explicitly deny destructive operations
- [ ] Credentials stored in Key Vault (or Managed Identity used)
- [ ] Client secret rotation schedule defined (if not using Managed Identity)
- [ ] Each permitted RG has been individually approved
- [ ] No `*/delete` permissions anywhere in the role definition
- [ ] No `Microsoft.Authorization/*` permissions (cannot modify RBAC)
