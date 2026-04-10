import { describe, test, expect, beforeAll } from "bun:test";
import * as pulumi from "@pulumi/pulumi";

pulumi.runtime.setMocks({
    newResource: (args: pulumi.runtime.MockResourceArgs) => ({
        id: `${args.name}-id`,
        state: args.inputs,
    }),
    call: (args: pulumi.runtime.MockCallArgs) => args.inputs,
}, "dev-cluster", "test");

function promiseOf<T>(output: pulumi.Output<T>): Promise<T> {
    return new Promise(resolve => output.apply(resolve));
}

describe("dev cluster", () => {
    let infra: typeof import("./index");

    beforeAll(async () => {
        infra = await import("./index");
    });

    test("registry container listens on port 5001", async () => {
        const ports = await promiseOf(infra.registryContainer.ports);
        expect(ports).toBeDefined();
        expect(ports![0].external).toBe(5001);
        expect(ports![0].internal).toBe(5000);
    });

    test("registry container is named k0s-registry", async () => {
        const name = await promiseOf(infra.registryContainer.name);
        expect(name).toBe("k0s-registry");
    });

    test("k0s controller is privileged", async () => {
        const privileged = await promiseOf(infra.k0sController.privileged);
        expect(privileged).toBe(true);
    });

    test("k0s controller maps API port 6443", async () => {
        const ports = await promiseOf(infra.k0sController.ports);
        expect(ports).toBeDefined();
        const apiPort = ports!.find(p => p.internal === 6443);
        expect(apiPort).toBeDefined();
        expect(apiPort!.external).toBe(6443);
    });

    test("configmap is in kube-public namespace", async () => {
        const metadata = await promiseOf(infra.registryConfigMap.metadata);
        expect(metadata.namespace).toBe("kube-public");
        expect(metadata.name).toBe("local-registry-hosting");
    });
});
