#!/usr/bin/env bash
set -euo pipefail

# Bootstrap a k3s cluster on Fly.io
# Usage: ./scripts/setup.sh [app-name] [region] [org]

APP_NAME="${1:-k3s-cluster}"
REGION="${2:-ord}"
ORG="${3:-personal}"

echo "==> Setting up k3s cluster on Fly.io"
echo "    App:    $APP_NAME"
echo "    Region: $REGION"
echo "    Org:    $ORG"
echo ""

# Check prerequisites
if ! command -v fly &>/dev/null; then
  echo "ERROR: flyctl (fly) is not installed. Install it from https://fly.io/docs/flyctl/install/"
  exit 1
fi

if ! fly auth whoami &>/dev/null; then
  echo "ERROR: Not logged in to Fly.io. Run 'fly auth login' first."
  exit 1
fi

# Update fly.toml with the chosen app name and region
sed -i.bak "s/^app = .*/app = \"${APP_NAME}\"/" fly.toml
sed -i.bak "s/^primary_region = .*/primary_region = \"${REGION}\"/" fly.toml
rm -f fly.toml.bak

# Create the app (if it doesn't exist)
if fly apps list --json | grep -q "\"${APP_NAME}\""; then
  echo "==> App '${APP_NAME}' already exists"
else
  echo "==> Creating app '${APP_NAME}'"
  fly apps create "${APP_NAME}" --org "${ORG}"
fi

# Create the volume (if it doesn't exist)
EXISTING_VOLS=$(fly volumes list --app "${APP_NAME}" --json 2>/dev/null || echo "[]")
if echo "${EXISTING_VOLS}" | grep -q '"k3s_data"'; then
  echo "==> Volume 'k3s_data' already exists"
else
  echo "==> Creating volume 'k3s_data' (10GB) in ${REGION}"
  fly volumes create k3s_data --size 10 --region "${REGION}" --app "${APP_NAME}" --yes
fi

# Generate and set K3S_TOKEN
K3S_TOKEN=$(openssl rand -hex 32)
echo "==> Setting K3S_TOKEN secret"
fly secrets set "K3S_TOKEN=${K3S_TOKEN}" --app "${APP_NAME}" --stage

# Generate a deploy token for the autoscaler
echo "==> Generating deploy token for autoscaler"
DEPLOY_TOKEN=$(fly tokens deploy --app "${APP_NAME}")
fly secrets set "FLY_API_TOKEN=${DEPLOY_TOKEN}" --app "${APP_NAME}" --stage

# Deploy
echo "==> Deploying k3s server"
fly deploy --app "${APP_NAME}" --yes

echo ""
echo "==> Deployment complete!"
echo ""
echo "To get your kubeconfig:"
echo "  fly ssh console -a ${APP_NAME} -C 'cat /var/lib/rancher/k3s/k3s.yaml'"
echo ""
echo "Then update the 'server' address to use your Fly proxy or WireGuard tunnel:"
echo "  fly proxy 6443:6443 -a ${APP_NAME}"
echo "  # In another terminal, set server to https://127.0.0.1:6443"
echo ""
echo "Monitor the autoscaler:"
echo "  fly logs -a ${APP_NAME} | grep autoscaler"
echo ""
echo "K3S_TOKEN (save this if you need manual agent joins): ${K3S_TOKEN}"
