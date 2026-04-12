#!/usr/bin/env sh
set -e

cd "$(dirname "$0")"

STAGING_DIR="$(cd ../../../infrastructure/pulumi/platform/staging && pwd)"
VM_IP=$(cd "$STAGING_DIR" && pulumi stack output vmIp 2>/dev/null)

if [ -z "$VM_IP" ]; then
    echo "Error: could not resolve VM IP from Pulumi stack output"
    exit 1
fi

ssh-keyscan -H "$VM_IP" >> ~/.ssh/known_hosts 2>/dev/null
ssh -i vm-ssh.pk core@"$VM_IP" "$@"
