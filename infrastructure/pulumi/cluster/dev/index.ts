import * as pulumi from "@pulumi/pulumi";
import * as docker from "@pulumi/docker";
import * as command from "@pulumi/command";
import * as k8s from "@pulumi/kubernetes";

// --- Docker Registry ---

const registryImage = new docker.RemoteImage("registry-image", {
    name: "registry:2",
});

export const registryContainer = new docker.Container("registry", {
    name: "kind-registry",
    image: registryImage.imageId,
    ports: [
        {
            internal: 5000,
            external: 5001,
        },
    ],
    restart: "always",
});

// --- Kind Cluster ---

const kindConfig = `\
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
containerdConfigPatches:
- |-
  [plugins."io.containerd.grpc.v1.cri".registry]
    config_path = "/etc/containerd/certs.d"
nodes:
- role: control-plane
  extraPortMappings:
  - containerPort: 30080
    hostPort: 80
    protocol: TCP
  - containerPort: 30443
    hostPort: 443
    protocol: TCP
`;

export const kindCluster = new command.local.Command("kind-cluster", {
    create: `cat <<'KINDEOF' | kind create cluster --config=-
${kindConfig}
KINDEOF`,
    delete: "kind delete cluster",
}, { dependsOn: [registryContainer] });

// --- Configure registry on Kind nodes ---

export const registryConfig = new command.local.Command("registry-config", {
    create: pulumi.interpolate`
REGISTRY_DIR="/etc/containerd/certs.d/localhost:5001"
for node in $(kind get nodes); do
    docker exec "$node" mkdir -p "$REGISTRY_DIR"
    docker exec "$node" sh -c "cat > $REGISTRY_DIR/hosts.toml" <<TOML
[host."http://kind-registry:5000"]
TOML
done
`,
    delete: "echo 'registry config removed with cluster'",
}, { dependsOn: [kindCluster, registryContainer] });

// --- Connect registry to Kind network ---

export const networkConnection = new command.local.Command("registry-network", {
    create: 'docker network connect "kind" "kind-registry" || true',
    delete: 'docker network disconnect "kind" "kind-registry" || true',
}, { dependsOn: [kindCluster, registryContainer] });

// --- K8s ConfigMap documenting the local registry ---

const k8sProvider = new k8s.Provider("kind-provider", {
    context: "kind-kind",
    kubeconfig: pulumi.interpolate`${process.env.HOME}/.kube/config`,
}, { dependsOn: [kindCluster] });

export const registryConfigMap = new k8s.core.v1.ConfigMap("local-registry-hosting", {
    metadata: {
        name: "local-registry-hosting",
        namespace: "kube-public",
    },
    data: {
        "localRegistryHosting.v1": JSON.stringify({
            host: "localhost:5001",
            help: "https://kind.sigs.k8s.io/docs/user/local-registry/",
        }),
    },
}, { provider: k8sProvider, dependsOn: [registryConfig, networkConnection] });

// --- Exports ---

export const registryEndpoint = "localhost:5001";
export const clusterName = "kind";
