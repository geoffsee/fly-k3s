#!/bin/sh
set -e

echo "[server] Starting k3s server node"

# Copy auto-deploy manifests into the volume-mounted directory
mkdir -p /var/lib/rancher/k3s/server/manifests
cp -f /default-manifests/*.yaml /var/lib/rancher/k3s/server/manifests/ 2>/dev/null || true

# Start k3s server
k3s server \
  --token "${K3S_TOKEN}" \
  --node-ip "${FLY_PRIVATE_IP}" \
  --tls-san "${FLY_APP_NAME}.internal" \
  --tls-san "${FLY_PRIVATE_IP}" \
  --flannel-backend host-gw \
  --disable traefik \
  --write-kubeconfig /var/lib/rancher/k3s/k3s.yaml \
  --write-kubeconfig-mode 644 &

K3S_PID=$!

# Wait for API server to be ready
echo "[server] Waiting for k3s API server..."
for i in $(seq 1 120); do
  if k3s kubectl get nodes >/dev/null 2>&1; then
    echo "[server] k3s API server is ready"
    break
  fi
  if [ "$i" -eq 120 ]; then
    echo "[server] ERROR: k3s API server did not become ready in 120s"
    exit 1
  fi
  sleep 1
done

# Start the autoscaler in the background
echo "[server] Starting autoscaler"
python3 /usr/local/bin/autoscaler.py &

# Wait on the k3s server process
wait $K3S_PID
