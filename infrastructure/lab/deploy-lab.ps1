# ============================================================================
# Infrastructure Deployment Generator Lab — Full Deployment Script
# ============================================================================
# Deploys in order:
#   1. Networking (RGs, VNets, Bastion, Peering)
#   2. EUS2 VMs (8 servers)
#   3. WUS2 VMs (4 servers)
#   4. LVM scripts on Linux VMs
#
# Prerequisites:
#   - Azure CLI (az) or Azure PowerShell (Az module)
#   - Logged in: az login / Connect-AzAccount
#   - Correct subscription selected
# ============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$AdminUsername = "admin",

    [Parameter(Mandatory=$true)]
    [securestring]$AdminPassword,

    [Parameter(Mandatory=$false)]
    [ValidateSet("NetworkOnly", "VMsOnly", "LVMOnly", "Full")]
    [string]$DeploymentScope = "Full",

    [Parameter(Mandatory=$false)]
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"
$labRoot = Split-Path -Parent $PSScriptRoot
$armTemplateDir = Join-Path $labRoot "generated-templates\lab-arm-templates"
$lvmScriptDir = Join-Path $labRoot "generated-templates\lab-bash-scripts"

Write-Host "=============================================="  -ForegroundColor Cyan
Write-Host " Infrastructure Deployment Generator Lab Deployment"              -ForegroundColor Cyan
Write-Host "=============================================="  -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# Step 1: Deploy Networking
# ============================================================================

if ($DeploymentScope -in "NetworkOnly", "Full") {
    Write-Host "[1/4] Deploying networking infrastructure..." -ForegroundColor Yellow

    $networkingTemplate = Join-Path $PSScriptRoot "lab-networking.bicep"

    if ($WhatIf) {
        Write-Host "  WHAT-IF: Would deploy $networkingTemplate at subscription scope" -ForegroundColor DarkGray
    } else {
        az deployment sub create `
            --location eastus2 `
            --template-file $networkingTemplate `
            --name "lab-networking-$(Get-Date -Format 'yyyyMMdd-HHmmss')" `
            --verbose

        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ERROR: Networking deployment failed!" -ForegroundColor Red
            exit 1
        }
        Write-Host "  Networking deployed successfully." -ForegroundColor Green
    }
    Write-Host ""
}

# ============================================================================
# Step 2: Deploy EUS2 VMs
# ============================================================================

$eus2Servers = @(
    "EUS2-EPPRDODB",
    "EUS2-ENSUPODB",
    "EUS2-EPRPTODB",
    "EUS2-ENTSTODB",
    "EUS2-ENTRNODB",
    "EUS2-EPCLR01",
    "EUS2-EPCAB01",
    "EUS2-EPCUB01"
)

$wus2Servers = @(
    "WUS2-EPPRDODB",
    "WUS2-ENCLR01",
    "WUS2-ENCAB01",
    "WUS2-ENCUB01"
)

$plainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($AdminPassword)
)

if ($DeploymentScope -in "VMsOnly", "Full") {
    Write-Host "[2/4] Deploying EUS2 VMs..." -ForegroundColor Yellow

    foreach ($server in $eus2Servers) {
        $templateFile = Join-Path $armTemplateDir "$server.json"
        if (-not (Test-Path $templateFile)) {
            Write-Host "  SKIP: Template not found for $server" -ForegroundColor DarkYellow
            continue
        }

        Write-Host "  Deploying $server..." -ForegroundColor White

        if ($WhatIf) {
            Write-Host "    WHAT-IF: Would deploy $templateFile to lab-eus2-rg-epic-prod-01" -ForegroundColor DarkGray
        } else {
            az deployment group create `
                --resource-group "lab-eus2-rg-epic-prod-01" `
                --template-file $templateFile `
                --parameters `
                    vnetName="lab-eus2-vnet-epic-01" `
                    subnetName="lab-eus2-sn-epicinf-01" `
                    vnetResourceGroup="lab-eus2-rg-net-epic-01" `
                    adminUsername=$AdminUsername `
                    adminPasswordOrKey=$plainPassword `
                --name "$server-$(Get-Date -Format 'yyyyMMdd-HHmmss')" `
                --no-wait

            if ($LASTEXITCODE -ne 0) {
                Write-Host "    ERROR: $server deployment failed to start!" -ForegroundColor Red
            } else {
                Write-Host "    Started deployment for $server" -ForegroundColor Green
            }
        }
    }

    # ============================================================================
    # Step 3: Deploy WUS2 VMs
    # ============================================================================

    Write-Host ""
    Write-Host "[3/4] Deploying WUS2 VMs..." -ForegroundColor Yellow

    foreach ($server in $wus2Servers) {
        $templateFile = Join-Path $armTemplateDir "$server.json"
        if (-not (Test-Path $templateFile)) {
            Write-Host "  SKIP: Template not found for $server" -ForegroundColor DarkYellow
            continue
        }

        Write-Host "  Deploying $server..." -ForegroundColor White

        if ($WhatIf) {
            Write-Host "    WHAT-IF: Would deploy $templateFile to lab-wus2-rg-epic-prod-01" -ForegroundColor DarkGray
        } else {
            az deployment group create `
                --resource-group "lab-wus2-rg-epic-prod-01" `
                --template-file $templateFile `
                --parameters `
                    vnetName="lab-wus2-vnet-epic-01" `
                    subnetName="lab-wus2-sn-epicinf-01" `
                    vnetResourceGroup="lab-wus2-rg-net-epic-01" `
                    adminUsername=$AdminUsername `
                    adminPasswordOrKey=$plainPassword `
                --name "$server-$(Get-Date -Format 'yyyyMMdd-HHmmss')" `
                --no-wait

            if ($LASTEXITCODE -ne 0) {
                Write-Host "    ERROR: $server deployment failed to start!" -ForegroundColor Red
            } else {
                Write-Host "    Started deployment for $server" -ForegroundColor Green
            }
        }
    }

    Write-Host ""
    Write-Host "  All VM deployments started (--no-wait)." -ForegroundColor Cyan
    Write-Host "  Monitor with: az deployment group list -g lab-eus2-rg-epic-prod-01 -o table" -ForegroundColor Cyan
    Write-Host ""
}

# ============================================================================
# Step 4: LVM Configuration (Linux VMs only, requires VMs to be running)
# ============================================================================

$linuxServers = @(
    @{ Name = "EUS2-EPPRDODB"; RG = "lab-eus2-rg-epic-prod-01" },
    @{ Name = "EUS2-ENSUPODB"; RG = "lab-eus2-rg-epic-prod-01" },
    @{ Name = "EUS2-EPRPTODB"; RG = "lab-eus2-rg-epic-prod-01" },
    @{ Name = "EUS2-ENTSTODB"; RG = "lab-eus2-rg-epic-prod-01" },
    @{ Name = "EUS2-ENTRNODB"; RG = "lab-eus2-rg-epic-prod-01" },
    @{ Name = "WUS2-EPPRDODB"; RG = "lab-wus2-rg-epic-prod-01" }
)

if ($DeploymentScope -in "LVMOnly", "Full") {
    Write-Host "[4/4] LVM configuration (Linux VMs)..." -ForegroundColor Yellow
    Write-Host "  NOTE: VMs must be running and accessible via Bastion/SSH first." -ForegroundColor DarkYellow
    Write-Host ""

    foreach ($server in $linuxServers) {
        $scriptFile = Join-Path $lvmScriptDir "$($server.Name)-lvm-setup.sh"
        if (-not (Test-Path $scriptFile)) {
            Write-Host "  SKIP: LVM script not found for $($server.Name)" -ForegroundColor DarkYellow
            continue
        }
        Write-Host "  Ready: $($server.Name) -> $scriptFile" -ForegroundColor White
    }

    Write-Host ""
    Write-Host "  To run LVM setup on each Linux VM:" -ForegroundColor Cyan
    Write-Host "    1. Connect via Bastion: az network bastion ssh -n lab-eus2-bastion-epic-01 -g lab-eus2-rg-net-epic-01 --target-resource-id <vm-resource-id> --auth-type password --username $AdminUsername" -ForegroundColor Cyan
    Write-Host "    2. Upload script: az network bastion tunnel ... then scp" -ForegroundColor Cyan
    Write-Host "    3. Run: sudo bash <hostname>-lvm-setup.sh" -ForegroundColor Cyan
}

# ============================================================================
# Summary
# ============================================================================

Write-Host ""
Write-Host "=============================================="  -ForegroundColor Cyan
Write-Host " Deployment Summary"                             -ForegroundColor Cyan
Write-Host "=============================================="  -ForegroundColor Cyan
Write-Host ""
Write-Host "  Resource Groups:" -ForegroundColor White
Write-Host "    lab-eus2-rg-epic-prod-01  (EUS2 Compute)" -ForegroundColor Gray
Write-Host "    lab-wus2-rg-epic-prod-01  (WUS2 Compute)" -ForegroundColor Gray
Write-Host "    lab-eus2-rg-net-epic-01   (EUS2 Network)" -ForegroundColor Gray
Write-Host "    lab-wus2-rg-net-epic-01   (WUS2 Network)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Networking:" -ForegroundColor White
Write-Host "    EUS2 VNet: 10.100.0.0/23  (lab-eus2-vnet-epic-01)" -ForegroundColor Gray
Write-Host "    WUS2 VNet: 10.100.2.0/23  (lab-wus2-vnet-epic-01)" -ForegroundColor Gray
Write-Host "    Peering:   EUS2 <-> WUS2  (bidirectional)" -ForegroundColor Gray
Write-Host "    Bastion:   lab-eus2-bastion-epic-01" -ForegroundColor Gray
Write-Host ""
Write-Host "  VMs (EUS2): $($eus2Servers.Count)" -ForegroundColor White
Write-Host "  VMs (WUS2): $($wus2Servers.Count)" -ForegroundColor White
Write-Host "  Linux/LVM:  $($linuxServers.Count)" -ForegroundColor White
Write-Host ""
