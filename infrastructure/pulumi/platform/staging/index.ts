import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import {config} from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Bootstrap artifacts are in bootstrap/coreos/staging/
const bootstrapDir = path.resolve(__dirname, "../../../../bootstrap/coreos/staging");
try { config({path: path.join(bootstrapDir, ".env.staging")}); } catch (_) {}

const pulumiConfig = new pulumi.Config();
const firewallName = pulumiConfig.get("firewallName") || process.env.GCP_FIREWALL_NAME || "allow-access-coreos-vm";
const instanceName = pulumiConfig.get("instanceName") || process.env.GCP_INSTANCE_NAME || "cdktf-instance";

const network = gcp.compute.getNetwork({
    name: "cdktf-network",
});

export const firewall = new gcp.compute.Firewall("allow-access", {
    name: firewallName,
    network: network.then(n => n.name),
    direction: "INGRESS",
    description: "Allow SSH, K8s API (6443), HTTP (80), HTTPS (443), and NodePorts (30080,30443)",
    sourceRanges: ["0.0.0.0/0"],
    targetTags: ["dev"],
    allows: [{
        protocol: "tcp",
        ports: ["22", "6443", "80", "443", "30080", "30443"],
    }],
});

// Generate with: bootstrap/coreos/staging/generate-ignition.sh
let ignitionConfig: string;
try {
    ignitionConfig = fs.readFileSync(path.join(bootstrapDir, "coreos.ign"), "utf-8");
} catch (_) {
    ignitionConfig = "{}";
}

export const instance = new gcp.compute.Instance("coreos-vm", {
    name: instanceName,
    machineType: "g2-standard-4",
    scheduling: {
        onHostMaintenance: "TERMINATE",
    },
    guestAccelerators: [{
        type: "nvidia-l4",
        count: 1,
    }],
    bootDisk: {
        initializeParams: {
            image: "fedora-coreos-cloud/fedora-coreos-stable",
        },
    },
    metadata: {
        "user-data": ignitionConfig,
    },
    networkInterfaces: [{
        network: network.then(n => n.name),
        accessConfigs: [{}],
    }],
    tags: ["web", "dev"],
});

export const vmIp = instance.networkInterfaces.apply(
    ifaces => ifaces[0]?.accessConfigs?.[0]?.natIp,
);
export const outputInstanceName = instance.name;
