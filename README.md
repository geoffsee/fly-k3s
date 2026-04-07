# fly-k3s

Autoscaling k3s cluster on Fly.io with a GitOps-ready repo structure. Starts with a single server node and automatically scales agent nodes from 0 to N based on resource pressure.

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
             ├─────────────────┤  (auto-created)      │
             │                 │  k3s agent           │
             │                 └──────────────────────┘
             ▼
    Fly Machines API
    (create/destroy agents)
```

## Project Structure

```
├── infrastructure/             # Pulumi IaC
│   ├── pulumi/
│   │   ├── platform/
│   │   │   ├── fly/            # Fly.io k3s cluster
│   │   │   ├── staging/        # GCP CoreOS VM + GPU
│   │   │   ├── components/     # Helm: cert-manager, Traefik, PostgreSQL, Zitadel
│   │   │   └── configurations/ # Zitadel orgs, projects, OIDC apps, users
│   │   ├── cluster/
│   │   │   └── dev/            # Local Kind cluster + Docker registry
│   │   └── modules/            # Reusable Pulumi components
│   └── scripts/                # Deploy, destroy, setup scripts
├── bootstrap/                  # Machine/bootstrap artifacts
│   ├── k3s/                    # Dockerfile, fly.toml, entrypoints, autoscaler
│   └── coreos/staging/         # Ignition config, SSH key generation
├── platform/                   # Shared cluster services (GitOps manifests)
│   ├── metrics-server/
│   ├── cert-manager/
│   ├── ingress/
│   └── zitadel/
├── clusters/                   # Per-environment GitOps entrypoints
│   ├── staging/
│   └── production/
├── apps/                       # Application workloads
│   └── example-service/
└── packages/                   # Buildable software/tools
    └── dev-proxy/              # Rust HTTP-to-HTTPS proxy
```

## Quick Start

### Prerequisites

- [Pulumi CLI](https://www.pulumi.com/docs/install/)
- [flyctl](https://fly.io/docs/flyctl/install/)
- [bun](https://bun.sh)
- Docker

### Deploy to Fly.io

```bash
fly auth login
pulumi login

cd infrastructure/pulumi/platform/fly
bun install
pulumi stack init prod
pulumi config set appName k3s-cluster
pulumi config set region ord
pulumi up --yes
```

Then get your kubeconfig:

```bash
fly ssh console -a k3s-cluster -C 'cat /var/lib/rancher/k3s/k3s.yaml' > kubeconfig.yaml
fly proxy 6443:6443 -a k3s-cluster &

# Edit kubeconfig.yaml: change server to https://127.0.0.1:6443
export KUBECONFIG=./kubeconfig.yaml
kubectl get nodes
```

### Local Development (Kind)

```bash
bun run setup     # install all dependencies
bun run dev       # deploy Kind cluster + platform components + Zitadel config
bun run dev:destroy
```

### Staging (GCP)

```bash
# 1. Create bootstrap/coreos/staging/.env.staging from the .example
# 2. Generate ignition config
cd bootstrap/coreos/staging
./generate-ignition.sh

# 3. Deploy
bun run staging:deploy
bun run staging:status
```

## Testing

All Pulumi projects have unit tests using `bun:test` and `pulumi.runtime.setMocks()`. No cloud credentials needed.

```bash
bun run test    # all projects
cd infrastructure/pulumi/platform/fly && bun test   # single project
```

## Autoscaler Configuration

Set in `bootstrap/k3s/fly.toml`:

| Variable | Default | Description |
|---|---|---|
| `AUTOSCALER_HIGH_WATERMARK` | `80` | Scale up when allocation > this % |
| `AUTOSCALER_LOW_WATERMARK` | `30` | Scale down when allocation < this % |
| `AUTOSCALER_MAX_AGENTS` | `4` | Maximum agent machines |
| `AUTOSCALER_COOLDOWN_SECONDS` | `120` | Seconds between scaling events |
| `AUTOSCALER_CHECK_INTERVAL` | `30` | Seconds between metric checks |
| `AUTOSCALER_AGENT_VM_SIZE` | `shared-cpu-2x` | VM size for agents |
| `AUTOSCALER_AGENT_MEMORY_MB` | `2048` | Memory (MB) for agents |

## Monitoring

```bash
fly logs -a k3s-cluster | grep autoscaler
kubectl get nodes
kubectl top nodes
```
