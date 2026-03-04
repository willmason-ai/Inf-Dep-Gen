#!/bin/bash
# ============================================================================
# Infrastructure Deployment Generator Lab — Deployment Script (Azure CLI)
# ============================================================================
# Usage:
#   ./deploy-lab.sh --scope full --admin-password 'YourPassword123!'
#   ./deploy-lab.sh --scope network-only
#   ./deploy-lab.sh --scope vms-only --admin-password 'YourPassword123!'
# ============================================================================

set -e

ADMIN_USERNAME="admin"
ADMIN_PASSWORD=""
SCOPE="full"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAB_ROOT="$(dirname "$SCRIPT_DIR")"
ARM_DIR="$LAB_ROOT/generated-templates/lab-arm-templates"
LVM_DIR="$LAB_ROOT/generated-templates/lab-bash-scripts"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --scope) SCOPE="$2"; shift 2 ;;
        --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
        --admin-username) ADMIN_USERNAME="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

echo "=============================================="
echo " Infrastructure Deployment Generator Lab Deployment"
echo "=============================================="
echo ""

# ============================================================================
# Step 1: Deploy Networking
# ============================================================================

if [[ "$SCOPE" == "full" || "$SCOPE" == "network-only" ]]; then
    echo "[1/3] Deploying networking infrastructure..."

    az deployment sub create \
        --location eastus2 \
        --template-file "$SCRIPT_DIR/lab-networking.bicep" \
        --name "lab-networking-$(date +%Y%m%d-%H%M%S)" \
        --verbose

    echo "  Networking deployed successfully."
    echo ""
fi

# ============================================================================
# Step 2: Deploy VMs
# ============================================================================

if [[ "$SCOPE" == "full" || "$SCOPE" == "vms-only" ]]; then
    if [[ -z "$ADMIN_PASSWORD" ]]; then
        echo "ERROR: --admin-password is required for VM deployment"
        exit 1
    fi

    # EUS2 servers
    EUS2_SERVERS=(
        "EUS2-EPPRDODB"
        "EUS2-ENSUPODB"
        "EUS2-EPRPTODB"
        "EUS2-ENTSTODB"
        "EUS2-ENTRNODB"
        "EUS2-EPCLR01"
        "EUS2-EPCAB01"
        "EUS2-EPCUB01"
    )

    echo "[2/3] Deploying EUS2 VMs..."
    for server in "${EUS2_SERVERS[@]}"; do
        TEMPLATE="$ARM_DIR/$server.json"
        if [ ! -f "$TEMPLATE" ]; then
            echo "  SKIP: $server (template not found)"
            continue
        fi
        echo "  Deploying $server..."
        az deployment group create \
            --resource-group "lab-eus2-rg-epic-prod-01" \
            --template-file "$TEMPLATE" \
            --parameters \
                vnetName="lab-eus2-vnet-epic-01" \
                subnetName="lab-eus2-sn-epicinf-01" \
                vnetResourceGroup="lab-eus2-rg-net-epic-01" \
                adminUsername="$ADMIN_USERNAME" \
                adminPasswordOrKey="$ADMIN_PASSWORD" \
            --name "$server-$(date +%Y%m%d-%H%M%S)" \
            --no-wait
        echo "    Started: $server"
    done

    # WUS2 servers
    WUS2_SERVERS=(
        "WUS2-EPPRDODB"
        "WUS2-ENCLR01"
        "WUS2-ENCAB01"
        "WUS2-ENCUB01"
    )

    echo ""
    echo "[3/3] Deploying WUS2 VMs..."
    for server in "${WUS2_SERVERS[@]}"; do
        TEMPLATE="$ARM_DIR/$server.json"
        if [ ! -f "$TEMPLATE" ]; then
            echo "  SKIP: $server (template not found)"
            continue
        fi
        echo "  Deploying $server..."
        az deployment group create \
            --resource-group "lab-wus2-rg-epic-prod-01" \
            --template-file "$TEMPLATE" \
            --parameters \
                vnetName="lab-wus2-vnet-epic-01" \
                subnetName="lab-wus2-sn-epicinf-01" \
                vnetResourceGroup="lab-wus2-rg-net-epic-01" \
                adminUsername="$ADMIN_USERNAME" \
                adminPasswordOrKey="$ADMIN_PASSWORD" \
            --name "$server-$(date +%Y%m%d-%H%M%S)" \
            --no-wait
        echo "    Started: $server"
    done
fi

echo ""
echo "=============================================="
echo " Deployment Complete"
echo "=============================================="
echo ""
echo "Monitor deployments:"
echo "  az deployment group list -g lab-eus2-rg-epic-prod-01 -o table"
echo "  az deployment group list -g lab-wus2-rg-epic-prod-01 -o table"
echo ""
echo "Connect via Bastion:"
echo "  az network bastion ssh \\"
echo "    -n lab-eus2-bastion-epic-01 \\"
echo "    -g lab-eus2-rg-net-epic-01 \\"
echo "    --target-resource-id /subscriptions/{sub}/resourceGroups/lab-eus2-rg-epic-prod-01/providers/Microsoft.Compute/virtualMachines/{vmName} \\"
echo "    --auth-type password \\"
echo "    --username $ADMIN_USERNAME"
echo ""
