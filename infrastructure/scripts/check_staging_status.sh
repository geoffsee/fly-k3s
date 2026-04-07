#!/usr/bin/env sh

set -e

echo "Checking staging VM status..."

cd "$(dirname "$0")/../pulumi/platform/staging"

VM_IP=$(pulumi stack output vmIp 2>/dev/null)

if [ -z "$VM_IP" ]; then
    echo "Could not find VM IP. Make sure deployment completed successfully."
    exit 1
fi

echo "VM IP: $VM_IP"

check_port() { nc -z -w ${3:-1} "$1" "$2" 2>/dev/null; }

if ! ping -c 1 -W 5 $VM_IP >/dev/null 2>&1; then
    echo "VM is not responding to ping"
    exit 1
fi
echo "VM reachable"

echo "Waiting for SSH..."
for i in $(seq 1 30); do
    if check_port $VM_IP 22 5; then echo "SSH available"; break; fi
    echo "  Attempt $i/30"; sleep 10
    if [ "$i" = "30" ]; then echo "SSH not available"; exit 1; fi
done

ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no core@$VM_IP '
    uptime
    echo "---"
    sudo systemctl is-active k0s 2>/dev/null || echo "k0s not active"
    sudo ss -tlnp | grep ":80\|:22\|:6443" || echo "Key ports not listening"
' 2>/dev/null || echo "Could not check services via SSH"

if curl -s --connect-timeout 10 --max-time 30 "http://$VM_IP" >/dev/null 2>&1; then
    echo "HTTP responding. SSH: ssh core@$VM_IP  Web: http://$VM_IP"
else
    echo "HTTP not responding yet. Try again in a few minutes."
fi
