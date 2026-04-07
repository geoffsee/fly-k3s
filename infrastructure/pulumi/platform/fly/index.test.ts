import { describe, test, expect, beforeAll } from "bun:test";
import * as pulumi from "@pulumi/pulumi";


pulumi.runtime.setMocks({
    newResource: (args: pulumi.runtime.MockResourceArgs) => ({
        id: `${args.name}-id`,
        state: args.inputs,
    }),
    call: (args: pulumi.runtime.MockCallArgs) => args.inputs,
}, "fly-k3s", "test");

function promiseOf<T>(output: pulumi.Output<T>): Promise<T> {
    return new Promise(resolve => output.apply(resolve));
}

describe("fly k3s deployment", () => {
    let infra: typeof import("./index");

    beforeAll(async () => {
        infra = await import("./index");
    });

    test("app creation command references k3s-cluster", async () => {
        const cmd = await promiseOf(infra.createApp.create);
        expect(cmd).toContain("k3s-cluster");
    });

    test("volume creation specifies 10GB", async () => {
        const cmd = await promiseOf(infra.createVolume.create);
        expect(cmd).toContain("--size 10");
    });

    test("k3s token is 64 characters", async () => {
        const length = await promiseOf(infra.k3sToken.length);
        expect(length).toBe(64);
    });

    test("k3s token has no special characters", async () => {
        const special = await promiseOf(infra.k3sToken.special);
        expect(special).toBe(false);
    });

    test("deploy command runs fly deploy", async () => {
        const cmd = await promiseOf(infra.deploy.create);
        expect(cmd).toContain("fly deploy");
    });
});
