import * as pulumi from "@pulumi/pulumi";
import * as command from "@pulumi/command";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";

const config = new pulumi.Config();
const appName = config.get("appName") || "k0s-cluster";
const region = config.get("region") || "ord";
const org = config.get("org") || "personal";

// k0s build context is in bootstrap/k0s/
const k0sDir = path.resolve(__dirname, "../../../../bootstrap/k0s");

const updateFlyToml = new command.local.Command("update-fly-toml", {
    create: [
        `sed -i.bak 's/^app = .*/app = "${appName}"/' fly.toml`,
        `sed -i.bak 's/^primary_region = .*/primary_region = "${region}"/' fly.toml`,
        `rm -f fly.toml.bak`,
    ].join(" && "),
    dir: k0sDir,
    triggers: [appName, region],
});

export const createApp = new command.local.Command("create-app", {
    create: `fly apps list --json | grep -q '"${appName}"' || fly apps create "${appName}" --org "${org}"`,
    delete: `fly apps destroy "${appName}" --yes 2>/dev/null || true`,
}, {dependsOn: [updateFlyToml]});

export const createVolume = new command.local.Command("create-volume", {
    create: `fly volumes list --app "${appName}" --json 2>/dev/null | grep -q '"k0s_data"' || fly volumes create k0s_data --size 10 --region "${region}" --app "${appName}" --yes`,
}, {dependsOn: [createApp]});

const setDeployToken = new command.local.Command("set-deploy-token", {
    create: `DEPLOY_TOKEN=$(fly tokens deploy --app "${appName}") && fly secrets set "FLY_API_TOKEN=$DEPLOY_TOKEN" --app "${appName}" --stage`,
}, {dependsOn: [createApp]});

function hashDir(dir: string): string {
    const hash = crypto.createHash("sha256");
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            hash.update(hashDir(fullPath));
        } else {
            hash.update(entry.name);
            hash.update(fs.readFileSync(fullPath));
        }
    }
    return hash.digest("hex");
}

const k0sDirHash = hashDir(k0sDir);

export const deploy = new command.local.Command("deploy", {
    create: `fly deploy --app "${appName}" --yes`,
    dir: k0sDir,
    triggers: [k0sDirHash],
}, {dependsOn: [createVolume, setDeployToken]});

// --- Tenant Gateway ---

const gatewayAppName = config.get("gatewayAppName") || "tenant-gateway";
const gatewayDir = path.resolve(__dirname, "../../../../packages/tenant-gateway");

const adminUser = config.get("gatewayAdminUser") || "admin";
const adminPass = config.getSecret("gatewayAdminPass") || pulumi.output(
    crypto.randomBytes(32).toString("base64url")
);

const createGatewayApp = new command.local.Command("create-gateway-app", {
    create: `fly apps list --json | grep -q '"${gatewayAppName}"' || fly apps create "${gatewayAppName}" --org "${org}"`,
    delete: `fly apps destroy "${gatewayAppName}" --yes 2>/dev/null || true`,
}, {dependsOn: [deploy]});

// Pull kubeconfig from k0s controller and rewrite server URL to Fly internal address
const fetchKubeconfig = new command.local.Command("fetch-kubeconfig", {
    create: [
        `KUBECONFIG=$(fly ssh console -a "${appName}" -C 'cat /var/lib/k0s/pki/admin.conf' 2>/dev/null)`,
        `KUBECONFIG=$(echo "$KUBECONFIG" | sed 's|server: https://.*:6443|server: https://${appName}.internal:6443|')`,
        `echo "$KUBECONFIG"`,
    ].join(" && "),
}, {dependsOn: [deploy]});

const setGatewaySecrets = new command.local.Command("set-gateway-secrets", {
    create: pulumi.interpolate`fly secrets set "ADMIN_USER=${adminUser}" "ADMIN_PASS=${adminPass}" "KUBECONFIG_DATA=${fetchKubeconfig.stdout}" --app "${gatewayAppName}" --stage`,
}, {dependsOn: [createGatewayApp, fetchKubeconfig]});

const updateGatewayFlyToml = new command.local.Command("update-gateway-fly-toml", {
    create: [
        `sed -i.bak 's/^app = .*/app = "${gatewayAppName}"/' fly.toml`,
        `sed -i.bak 's/^primary_region = .*/primary_region = "${region}"/' fly.toml`,
        `rm -f fly.toml.bak`,
    ].join(" && "),
    dir: gatewayDir,
    triggers: [gatewayAppName, region],
});

const gatewayDirHash = hashDir(gatewayDir);

const repoRoot = path.resolve(__dirname, "../../../..");
const deployGateway = new command.local.Command("deploy-gateway", {
    create: `fly deploy --app "${gatewayAppName}" --config "${gatewayDir}/fly.toml" --dockerfile "${gatewayDir}/Dockerfile" --yes`,
    dir: repoRoot,
    triggers: [gatewayDirHash],
}, {dependsOn: [setGatewaySecrets, updateGatewayFlyToml]});

// --- Outputs ---

export const outputAppName = appName;
export const outputRegion = region;
export const outputKubeconfigCmd = `fly ssh console -a ${appName} -C 'cat /var/lib/k0s/pki/admin.conf'`;
export const outputProxyCmd = `fly proxy 6443:6443 -a ${appName}`;
export const outputLogsCmd = `fly logs -a ${appName} | grep autoscaler`;
export const outputGatewayAppName = gatewayAppName;
export const outputGatewayUrl = `https://${gatewayAppName}.fly.dev`;
export const outputGatewayAdminUser = adminUser;
export const outputGatewayAdminPass = adminPass;
