#!/bin/sh
set -e

echo "[agent] Starting k3s agent node"
echo "[agent] Server IP: ${K3S_SERVER_IP}"
echo "[agent] Machine ID: ${FLY_MACHINE_ID}"

# Wait for server to be reachable
echo "[agent] Waiting for server API..."
for i in $(seq 1 60); do
  if wget -q --spider --no-check-certificate "https://${K3S_SERVER_IP}:6443/ping" 2>/dev/null; then
    echo "[agent] Server is reachable"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "[agent] WARNING: Server not reachable after 60s, attempting join anyway"
  fi
  sleep 1
done

exec k3s agent \
  --server "https://${K3S_SERVER_IP}:6443" \
  --token "${K3S_TOKEN}" \
  --node-ip "${FLY_PRIVATE_IP}" \
  --node-name "${FLY_MACHINE_ID}"
