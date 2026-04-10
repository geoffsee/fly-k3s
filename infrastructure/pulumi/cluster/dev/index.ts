import * as pulumi from "@pulumi/pulumi";
import * as docker from "@pulumi/docker";
import * as command from "@pulumi/command";
import * as k8s from "@pulumi/kubernetes";
import * as path from "path";

const kubeconfigPath = path.join(process.env.HOME!, ".kube", "k0s-dev");

// --- Docker Network ---

const k0sNetwork = new docker.Network("k0s-network", {
    name: "k0s",
});

// --- Docker Registry ---

const registryImage = new docker.RemoteImage("registry-image", {
    name: "registry:2",
});

export const registryContainer = new docker.Container("registry", {
    name: "k0s-registry",
    image: registryImage.imageId,
    ports: [{
        internal: 5000,
        external: 5001,
    }],
    networksAdvanced: [{
        name: k0sNetwork.name,
    }],
    restart: "always",
});

// --- k0s Controller (with worker enabled) ---

const k0sImage = new docker.RemoteImage("k0s-image", {
    name: "docker.io/k0sproject/k0s:v1.31.3-k0s.0",
});

export const k0sController = new docker.Container("k0s-controller", {
    name: "k0s-controller",
    image: k0sImage.imageId,
    hostname: "k0s-controller",
    privileged: true,
    cgroupnsMode: "host",
    command: ["k0s", "controller", "--enable-worker", "--no-taints"],
    ports: [
        { internal: 6443, external: 6443 },
        { internal: 30080, external: 80 },
        { internal: 30443, external: 443 },
    ],
    tmpfs: {
        "/run": "",
        "/var/run": "",
        "/tmp": "",
    },
    uploads: [
        {
            content: `[plugins."io.containerd.grpc.v1.cri".registry]
  config_path = "/etc/k0s/containerd/certs.d"
`,
            file: "/etc/k0s/containerd.d/registry.toml",
        },
        {
            content: `server = "http://k0s-registry:5000"

[host."http://k0s-registry:5000"]
  capabilities = ["pull", "resolve"]
`,
            file: "/etc/k0s/containerd/certs.d/localhost:5001/hosts.toml",
        },
    ],
    networksAdvanced: [{
        name: k0sNetwork.name,
    }],
    restart: "unless-stopped",
}, { dependsOn: [registryContainer] });

// --- Extract Kubeconfig ---

export const extractKubeconfig = new command.local.Command("extract-kubeconfig", {
    create: [
        `for i in $(seq 1 120); do docker exec k0s-controller k0s kubectl --data-dir /var/lib/k0s get nodes >/dev/null 2>&1 && break; sleep 1; done`,
        `docker exec k0s-controller k0s kubeconfig admin --data-dir /var/lib/k0s | sed 's|server: https://.*:6443|server: https://127.0.0.1:6443|' > "${kubeconfigPath}"`,
        `chmod 600 "${kubeconfigPath}"`,
        `OLD_CTX=$(KUBECONFIG="${kubeconfigPath}" kubectl config current-context) && KUBECONFIG="${kubeconfigPath}" kubectl config rename-context "$OLD_CTX" k0s-dev`,
    ].join(" && "),
    delete: `rm -f "${kubeconfigPath}"`,
}, { dependsOn: [k0sController] });

// --- K8s Provider ---

const k8sProvider = new k8s.Provider("k0s-provider", {
    kubeconfig: kubeconfigPath,
    context: "k0s-dev",
}, { dependsOn: [extractKubeconfig] });

// --- K8s ConfigMap documenting the local registry ---

export const registryConfigMap = new k8s.core.v1.ConfigMap("local-registry-hosting", {
    metadata: {
        name: "local-registry-hosting",
        namespace: "kube-public",
    },
    data: {
        "localRegistryHosting.v1": JSON.stringify({
            host: "localhost:5001",
        }),
    },
}, { provider: k8sProvider });

// --- Exports ---

export const registryEndpoint = "localhost:5001";
export const clusterName = "k0s-dev";
export const kubeconfig = kubeconfigPath;
