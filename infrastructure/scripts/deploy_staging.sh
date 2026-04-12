#!/usr/bin/env sh

set -e

echo "Starting staging deployment..."

cd "$(dirname "$0")/../pulumi/platform/staging"

BOOTSTRAP_DIR="$(cd ../../../../bootstrap/coreos/staging && pwd)"

# Check if .env.staging exists
if [ ! -f "$BOOTSTRAP_DIR/.env.staging" ]; then
    echo "Error: bootstrap/coreos/staging/.env.staging not found"
    echo "Please create it with: GCP_PROJECT, GCP_REGION, GCP_ZONE"
    exit 1
fi

source "$BOOTSTRAP_DIR/.env.staging"

if [ -z "$GCP_PROJECT" ]; then
    echo "Error: GCP_PROJECT not set in .env.staging"
    exit 1
fi

echo "Project: $GCP_PROJECT  Region: ${GCP_REGION:-us-central1}  Zone: ${GCP_ZONE:-us-central1-a}"

if [ ! -d "node_modules" ]; then bun install; fi

pulumi config set gcp:project "$GCP_PROJECT" 2>/dev/null || true
pulumi config set gcp:region "${GCP_REGION:-us-central1}" 2>/dev/null || true
pulumi config set gcp:zone "${GCP_ZONE:-us-central1-a}" 2>/dev/null || true

pulumi up --yes

VM_IP=$(pulumi stack output vmIp 2>/dev/null)
if [ -z "$VM_IP" ]; then
  echo "Failed to resolve VM IP from Pulumi stack output"
  exit 1
fi

echo "VM IP: $VM_IP"

check_port() { nc -z -w ${3:-2} "$1" "$2" 2>/dev/null; }

echo "Waiting for SSH (22)..."
for i in $(seq 1 30); do
  if check_port "$VM_IP" 22 5; then echo "SSH ready"; break; fi
  echo "  Attempt $i/30"; sleep 5
  if [ "$i" = "30" ]; then echo "SSH not ready"; exit 1; fi
done

echo "Waiting for Kubernetes API (6443)..."
for i in $(seq 1 60); do
  if check_port "$VM_IP" 6443 3; then echo "Kubernetes API ready"; break; fi
  echo "  Attempt $i/60"; sleep 5
  if [ "$i" = "60" ]; then echo "Kubernetes API not ready"; exit 1; fi
done

echo "Updating known hosts for $VM_IP..."
ssh-keyscan -H "$VM_IP" >> ~/.ssh/known_hosts 2>/dev/null

KUBECONFIG_FILE="$(pwd)/.kubeconfig.$VM_IP"
ssh core@$VM_IP 'sudo cat /var/lib/k0s/pki/admin.conf' > "$KUBECONFIG_FILE"

TMPFILE="$KUBECONFIG_FILE.tmp"
sed -E "s#server: https?://[^[:space:]]*#server: https://$VM_IP:6443#" "$KUBECONFIG_FILE" > "$TMPFILE" && mv "$TMPFILE" "$KUBECONFIG_FILE"
sed -i'' -e '/certificate-authority-data/d' "$KUBECONFIG_FILE" 2>/dev/null || sed -i -e '/certificate-authority-data/d' "$KUBECONFIG_FILE"
awk '1; /server:/ {print "    insecure-skip-tls-verify: true"}' "$KUBECONFIG_FILE" > "$TMPFILE" && mv "$TMPFILE" "$KUBECONFIG_FILE"

KUBE_CONTEXT=$(awk '/^contexts:/ {p=1; next} p && /name:/ {print $2; exit}' "$KUBECONFIG_FILE")
[ -z "$KUBE_CONTEXT" ] && KUBE_CONTEXT=$(awk '/current-context:/ {print $2; exit}' "$KUBECONFIG_FILE")

ZITADEL_DOMAIN="${ZITADEL_DOMAIN:-$STAGING_DOMAIN}"
if [ -z "$ZITADEL_DOMAIN" ]; then
  echo "No domain configured. Set ZITADEL_DOMAIN in .env.staging"
  exit 1
fi

echo "Deploying components (domain=$ZITADEL_DOMAIN)..."
(
  cd ../components || exit 1
  if [ ! -d node_modules ]; then bun install; fi
  KUBECONFIG="$KUBECONFIG_FILE" KUBE_CONTEXT="$KUBE_CONTEXT" ZITADEL_DOMAIN="$ZITADEL_DOMAIN" pulumi up --yes
)

if [ -n "$ZITADEL_JWT_PATH" ] && [ -f "$ZITADEL_JWT_PATH" ]; then
  echo "Deploying Zitadel configurations..."
  (
    cd ../configurations || exit 1
    if [ ! -d node_modules ]; then bun install; fi
    ZITADEL_DOMAIN="$ZITADEL_DOMAIN" ZITADEL_JWT_PATH="$ZITADEL_JWT_PATH" pulumi up --yes
  )
fi

echo "Staging deployment complete!"
