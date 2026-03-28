# fly-k3s

Autoscaling k3s cluster on Fly.io. Starts with a single server node and automatically scales agent nodes from 0 to N based on resource pressure.

## Architecture

```
  Fly.io 6PN Private Network
  ──────────────────────────

  ┌──────────────────────┐     ┌──────────────────────┐
  │  Server Machine      │     │  Agent Machine 1     │
  │  (always running)    │     │  (auto-created)      │
  │                      │     │                      │
  │  k3s server :6443 ◄──┼─────┤  k3s agent           │
  │  autoscaler.py       │     │  (stateless)         │
  │  [Volume: k3s_data]  │     └──────────────────────┘
  └──────────┬───────────┘
             │                 ┌──────────────────────┐
             │                 │  Agent Machine N     │
             │                 │  (auto-created)      │
             ├─────────────────┤  k3s agent           │
             │                 │  (stateless)         │
             │                 └──────────────────────┘
             ▼
    Fly Machines API
    (create/destroy agents)
```

- **Server**: Always-on machine with a persistent volume. Runs k3s control plane + workloads + the autoscaler.
- **Agents**: Ephemeral machines created/destroyed by the autoscaler via the Fly Machines API. Stateless.
- **Networking**: All nodes communicate over Fly's private 6PN WireGuard network.

## How autoscaling works

The autoscaler runs on the server and checks cluster resource allocation every 30s:

- **Scale up**: When CPU or memory allocation exceeds 80%, a new agent is created (up to `MAX_AGENTS`)
- **Scale down**: When allocation drops below 30%, the newest agent is drained and destroyed
- **Cooldown**: 120s between scaling events to prevent flapping
- **Orphan cleanup**: Machines that exist in Fly but aren't registered as k8s nodes are cleaned up

## Quick start

```bash
# 1. Install flyctl if needed
# https://fly.io/docs/flyctl/install/

# 2. Log in
fly auth login

# 3. Bootstrap the cluster
./scripts/setup.sh my-k3s ord personal
#                   ^^^^^ ^^^ ^^^^^^^^
#                   app   region  org

# 4. Get kubeconfig
fly ssh console -a my-k3s -C 'cat /var/lib/rancher/k3s/k3s.yaml' > kubeconfig.yaml

# 5. Proxy the API server locally
fly proxy 6443:6443 -a my-k3s &

# 6. Use kubectl
export KUBECONFIG=./kubeconfig.yaml
# Edit kubeconfig.yaml: change server to https://127.0.0.1:6443
kubectl get nodes
```

## Configuration

All autoscaler settings are environment variables in `fly.toml`:

| Variable | Default | Description |
|---|---|---|
| `AUTOSCALER_HIGH_WATERMARK` | `80` | Scale up when allocation > this % |
| `AUTOSCALER_LOW_WATERMARK` | `30` | Scale down when allocation < this % |
| `AUTOSCALER_MAX_AGENTS` | `4` | Maximum number of agent machines |
| `AUTOSCALER_COOLDOWN_SECONDS` | `120` | Minimum seconds between scaling events |
| `AUTOSCALER_CHECK_INTERVAL` | `30` | Seconds between metric checks |
| `AUTOSCALER_AGENT_VM_SIZE` | `shared-cpu-2x` | VM size for agent machines |
| `AUTOSCALER_AGENT_MEMORY_MB` | `2048` | Memory (MB) for agent machines |

## Monitoring

```bash
# Watch autoscaler logs
fly logs -a my-k3s | grep autoscaler

# Check cluster status
kubectl get nodes
kubectl top nodes
```

## Secrets

Set during `setup.sh`, but can be rotated:

```bash
# Cluster join token
fly secrets set K3S_TOKEN=$(openssl rand -hex 32) -a my-k3s

# Fly API token for autoscaler
fly secrets set FLY_API_TOKEN=$(fly tokens deploy -a my-k3s) -a my-k3s
```
