#!/bin/sh
set -e

echo "[server] Starting k0s controller node"

# Create data directory
mkdir -p /var/lib/k0s

# Generate k0s cluster config
mkdir -p /etc/k0s
cat > /etc/k0s/k0s.yaml <<EOF
apiVersion: k0s.k0sproject.io/v1beta1
kind: ClusterConfig
metadata:
  name: k0s
spec:
  api:
    address: ${FLY_PRIVATE_IP}
    sans:
      - ${FLY_APP_NAME}.internal
      - ${FLY_PRIVATE_IP}
      - 127.0.0.1
      - localhost
  network:
    dualStack:
      enabled: true
      IPv4podCIDR: "10.244.0.0/16"
      IPv4serviceCIDR: "10.96.0.0/12"
      IPv6podCIDR: "fd00::/108"
      IPv6serviceCIDR: "fd01::/108"
  telemetry:
    enabled: false
EOF

# Configure containerd to trust the internal registry
mkdir -p /etc/k0s/containerd/certs.d/k0s-registry.internal:5000
cat > /etc/k0s/containerd.d/registry.toml <<REGEOF
[plugins."io.containerd.grpc.v1.cri".registry]
  config_path = "/etc/k0s/containerd/certs.d"
REGEOF

cat > /etc/k0s/containerd/certs.d/k0s-registry.internal:5000/hosts.toml <<REGEOF
server = "http://k0s-registry.internal:5000"

[host."http://k0s-registry.internal:5000"]
  capabilities = ["pull", "resolve"]
REGEOF

# Copy auto-deploy manifests into the k0s manifests directory
mkdir -p /var/lib/k0s/manifests/default
cp -f /default-manifests/*.yaml /var/lib/k0s/manifests/default/ 2>/dev/null || true

# Start k0s controller with worker enabled (server node runs workloads)
k0s controller \
  --config /etc/k0s/k0s.yaml \
  --data-dir /var/lib/k0s \
  --enable-worker \
  --kubelet-extra-args="--node-ip=${FLY_PRIVATE_IP}" &

K0S_PID=$!

# Wait for API server to be ready
echo "[server] Waiting for k0s API server..."
for i in $(seq 1 120); do
  if k0s kubectl --data-dir /var/lib/k0s get nodes >/dev/null 2>&1; then
    echo "[server] k0s API server is ready"
    break
  fi
  if [ "$i" -eq 120 ]; then
    echo "[server] ERROR: k0s API server did not become ready in 120s"
    exit 1
  fi
  sleep 1
done

# Generate a worker join token for the autoscaler
echo "[server] Generating worker join token..."
for i in $(seq 1 30); do
  if k0s token create --role=worker --data-dir /var/lib/k0s > /var/lib/k0s/worker-token 2>/dev/null; then
    echo "[server] Worker join token generated"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[server] ERROR: Failed to generate worker join token"
    exit 1
  fi
  sleep 2
done

# Start the autoscaler in the background
echo "[server] Starting autoscaler"
python3 /usr/local/bin/autoscaler.py &

# Wait on the k0s controller process
wait $K0S_PID