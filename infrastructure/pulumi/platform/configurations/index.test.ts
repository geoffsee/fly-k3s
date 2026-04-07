import { describe, test, expect, beforeAll } from "bun:test";
import * as pulumi from "@pulumi/pulumi";


pulumi.runtime.setMocks({
    newResource: (args: pulumi.runtime.MockResourceArgs) => ({
        id: `${args.name}-id`,
        state: args.inputs,
    }),
    call: (args: pulumi.runtime.MockCallArgs) => args.inputs,
}, "platform-configurations", "test");

function promiseOf<T>(output: pulumi.Output<T>): Promise<T> {
    return new Promise(resolve => output.apply(resolve));
}

describe("zitadel configurations", () => {
    let infra: typeof import("./index");

    beforeAll(async () => {
        infra = await import("./index");
    });

    test("org is named makers", async () => {
        const name = await promiseOf(infra.org.name);
        expect(name).toBe("makers");
    });

    test("project is named makers-project", async () => {
        const name = await promiseOf(infra.project.name);
        expect(name).toBe("makers-project");
    });

    test("OIDC app uses authorization code grant", async () => {
        const grants = await promiseOf(infra.app.grantTypes);
        expect(grants).toContain("OIDC_GRANT_TYPE_AUTHORIZATION_CODE");
    });

    test("OIDC app redirects to localhost:3000", async () => {
        const uris = await promiseOf(infra.app.redirectUris);
        expect(uris).toContain("http://localhost:3000/callback");
    });

    test("user has correct username", async () => {
        const name = await promiseOf(infra.user.userName);
        expect(name).toBe("makers-user");
    });

    test("user email is verified", async () => {
        const verified = await promiseOf(infra.user.isEmailVerified);
        expect(verified).toBe(true);
    });
});
