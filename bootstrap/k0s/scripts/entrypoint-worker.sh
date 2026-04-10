#!/bin/sh
set -e

echo "[worker] Starting k0s worker node"
echo "[worker] Machine ID: ${FLY_MACHINE_ID}"

# Wait for server to be reachable
echo "[worker] Waiting for server API..."
for i in $(seq 1 60); do
  if wget -q --spider --no-check-certificate "https://${K0S_SERVER_IP}:6443/ping" 2>/dev/null; then
    echo "[worker] Server is reachable"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "[worker] WARNING: Server not reachable after 60s, attempting join anyway"
  fi
  sleep 1
done

# Write join token to file
mkdir -p /etc/k0s
echo "${K0S_JOIN_TOKEN}" > /etc/k0s/worker-token

exec k0s worker \
  --data-dir /var/lib/k0s \
  --token-file /etc/k0s/worker-token \
  --kubelet-extra-args="--node-ip=${FLY_PRIVATE_IP} --hostname-override=${FLY_MACHINE_ID}"