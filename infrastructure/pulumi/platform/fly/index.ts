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

let dockerfileContent: string;
try {
    dockerfileContent = fs.readFileSync(path.join(k0sDir, "Dockerfile"), "utf-8");
} catch (_) {
    dockerfileContent = "";
}
const dockerfileHash = crypto.createHash("sha256")
    .update(dockerfileContent)
    .digest("hex");

export const deploy = new command.local.Command("deploy", {
    create: `fly deploy --app "${appName}" --yes`,
    dir: k0sDir,
    triggers: [dockerfileHash],
}, {dependsOn: [createVolume, setDeployToken]});

export const outputAppName = appName;
export const outputRegion = region;
export const outputKubeconfigCmd = `fly ssh console -a ${appName} -C 'cat /var/lib/k0s/pki/admin.conf'`;
export const outputProxyCmd = `fly proxy 6443:6443 -a ${appName}`;
export const outputLogsCmd = `fly logs -a ${appName} | grep autoscaler`;
