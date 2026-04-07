import { describe, test, expect, beforeAll } from "bun:test";
import * as pulumi from "@pulumi/pulumi";


pulumi.runtime.setMocks({
    newResource: (args: pulumi.runtime.MockResourceArgs) => ({
        id: `${args.name}-id`,
        state: args.inputs,
    }),
    call: (args: pulumi.runtime.MockCallArgs) => args.inputs,
}, "staging-cluster", "test");

function promiseOf<T>(output: pulumi.Output<T>): Promise<T> {
    return new Promise(resolve => output.apply(resolve));
}

describe("staging cluster", () => {
    let infra: typeof import("./index");

    beforeAll(async () => {
        infra = await import("./index");
    });

    test("firewall allows SSH, K8s API, HTTP, HTTPS, NodePorts", async () => {
        const allows = await promiseOf(infra.firewall.allows);
        const ports = allows![0].ports!;
        expect(ports).toContain("22");
        expect(ports).toContain("6443");
        expect(ports).toContain("443");
        expect(ports).toContain("30080");
    });

    test("firewall targets dev-tagged instances", async () => {
        const tags = await promiseOf(infra.firewall.targetTags);
        expect(tags).toContain("dev");
    });

    test("instance uses g2-standard-4 machine type", async () => {
        const type = await promiseOf(infra.instance.machineType);
        expect(type).toBe("g2-standard-4");
    });

    test("instance has nvidia-l4 GPU", async () => {
        const accs = await promiseOf(infra.instance.guestAccelerators);
        expect(accs![0].type).toBe("nvidia-l4");
        expect(accs![0].count).toBe(1);
    });

    test("instance uses CoreOS image", async () => {
        const disk = await promiseOf(infra.instance.bootDisk);
        expect(disk.initializeParams!.image).toContain("fedora-coreos");
    });

    test("instance has web and dev tags", async () => {
        const tags = await promiseOf(infra.instance.tags);
        expect(tags).toContain("web");
        expect(tags).toContain("dev");
    });
});
