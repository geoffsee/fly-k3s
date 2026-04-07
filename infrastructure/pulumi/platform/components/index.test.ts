import { describe, test, expect, beforeAll } from "bun:test";
import * as pulumi from "@pulumi/pulumi";

pulumi.runtime.setMocks({
    newResource: (args: pulumi.runtime.MockResourceArgs) => ({
        id: `${args.name}-id`,
        state: args.inputs,
    }),
    call: (args: pulumi.runtime.MockCallArgs) => args.inputs,
}, "platform-components", "test");

function promiseOf<T>(output: pulumi.Output<T>): Promise<T> {
    return new Promise(resolve => output.apply(resolve));
}

describe("platform components", () => {
    let infra: typeof import("./index");

    beforeAll(async () => {
        infra = await import("./index");
    });

    test("cert-manager is deployed to cert-manager namespace", async () => {
        const ns = await promiseOf(infra.certManager.namespace);
        expect(ns).toBe("cert-manager");
    });

    test("cert-manager has CRDs enabled", async () => {
        const values = await promiseOf(infra.certManager.values);
        expect(values).toMatchObject({ crds: { enabled: true } });
    });

    test("traefik uses NodePort service type", async () => {
        const values = await promiseOf(infra.traefik.values);
        expect(values.service.type).toBe("NodePort");
    });

    test("traefik web port is 30080", async () => {
        const values = await promiseOf(infra.traefik.values);
        expect(values.ports.web.nodePort).toBe(30080);
    });

    test("traefik websecure port is 30443", async () => {
        const values = await promiseOf(infra.traefik.values);
        expect(values.ports.websecure.nodePort).toBe(30443);
    });

    test("postgresql uses bitnami chart", async () => {
        const chart = await promiseOf(infra.postgresql.chart);
        expect(chart).toBe("postgresql");
    });

    test("zitadel uses zitadel chart", async () => {
        const chart = await promiseOf(infra.zitadel.chart);
        expect(chart).toBe("zitadel");
    });

    test("zitadel uses correct external domain", async () => {
        const values = await promiseOf(infra.zitadel.values);
        expect(values.zitadel.configmapConfig.ExternalDomain).toBe("machine.127.0.0.1.sslip.io");
    });

    test("zitadel database points to db-postgresql", async () => {
        const values = await promiseOf(infra.zitadel.values);
        expect(values.zitadel.configmapConfig.Database.Postgres.Host).toBe("db-postgresql");
    });

    test("cluster issuer uses self-signed", async () => {
        const spec = await promiseOf(infra.selfSignedIssuer.spec);
        expect(spec).toMatchObject({ selfSigned: {} });
    });

    test("certificate targets zitadel-tls secret", async () => {
        const spec = await promiseOf(infra.zitadelCert.spec);
        expect(spec.secretName).toBe("zitadel-tls");
    });
});
