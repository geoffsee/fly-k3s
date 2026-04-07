import * as pulumi from "@pulumi/pulumi";
import * as zitadel from "@pulumiverse/zitadel";
import * as path from "node:path";
import {readFileSync} from "fs";

const domain = process.env.ZITADEL_DOMAIN || "machine.127.0.0.1.sslip.io";
const jwtPath = process.env.ZITADEL_JWT_PATH || "zitadel-admin-sa.json";

let jwtJson = "{}";
try { jwtJson = JSON.stringify(JSON.parse(readFileSync(path.resolve(jwtPath), "utf-8"))); } catch {}

const zitadelProvider = new zitadel.Provider("zitadel", {
    domain,
    jwtProfileJson: jwtJson,
});

export const org = new zitadel.Org("org", {
    name: "makers",
}, {provider: zitadelProvider});

export const project = new zitadel.Project("project", {
    name: "makers-project",
    orgId: org.id,
}, {provider: zitadelProvider});

export const app = new zitadel.ApplicationOidc("app", {
    name: "makers-app",
    projectId: project.id,
    orgId: org.id,
    grantTypes: ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE"],
    redirectUris: ["http://localhost:3000/callback"],
    responseTypes: ["OIDC_RESPONSE_TYPE_CODE"],
}, {provider: zitadelProvider, dependsOn: [project]});

export const user = new zitadel.HumanUser("user", {
    userName: "makers-user",
    email: "makers-user@example.com",
    firstName: "Makers",
    lastName: "User",
    displayName: "Makers User",
    orgId: org.id,
    initialPassword: "TempPassword123!",
    isEmailVerified: true,
}, {provider: zitadelProvider});

export const clientId = pulumi.secret(app.clientId);
export const clientSecret = pulumi.secret(app.clientSecret);
export const userLoginNames = pulumi.secret(user.loginNames);
export const userPassword = pulumi.secret(user.initialPassword);
export const userPreferredLoginName = pulumi.secret(user.preferredLoginName);
export const userState = pulumi.secret(user.state);
export const createdOrg = pulumi.secret(org.id);
export const createdProject = pulumi.secret(pulumi.interpolate`${project.id} - ${project.name}`);
