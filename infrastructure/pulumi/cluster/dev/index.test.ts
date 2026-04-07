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

    test("registry container is named kind-registry", async () => {
        const name = await promiseOf(infra.registryContainer.name);
        expect(name).toBe("kind-registry");
    });

    test("kind cluster create command includes kind create cluster", async () => {
        const create = await promiseOf(infra.kindCluster.create);
        expect(create).toContain("kind create cluster");
    });

    test("kind cluster delete command includes kind delete cluster", async () => {
        const del = await promiseOf(infra.kindCluster.delete);
        expect(del).toContain("kind delete cluster");
    });

    test("configmap is in kube-public namespace", async () => {
        const metadata = await promiseOf(infra.registryConfigMap.metadata);
        expect(metadata.namespace).toBe("kube-public");
        expect(metadata.name).toBe("local-registry-hosting");
    });
});
