import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as command from "@pulumi/command/local";

// ---------------------------------------------------------------------------
// Configuration from environment
// ---------------------------------------------------------------------------
const kubeConfigPath = process.env.KUBECONFIG || `${process.env.HOME}/.kube/k0s-dev`;
const kubeContext = process.env.KUBE_CONTEXT || "k0s-dev";
const zitadelDomain = process.env.ZITADEL_DOMAIN || "machine.127.0.0.1.sslip.io";

// ---------------------------------------------------------------------------
// Kubernetes provider
// ---------------------------------------------------------------------------
const provider = new k8s.Provider("k8s-provider", {
    kubeconfig: kubeConfigPath,
    context: kubeContext,
});

// ---------------------------------------------------------------------------
// 1. cert-manager
// ---------------------------------------------------------------------------
export const certManager = new k8s.helm.v4.Chart("cert-manager", {
    chart: "oci://quay.io/jetstack/charts/cert-manager",
    version: "v1.18.2",
    namespace: "cert-manager",
    repositoryOpts: {},
    values: {
        crds: {
            enabled: true,
        },
    },
}, {
    provider,
    customTimeouts: { create: "5m", update: "5m" },
});

const certManagerNs = new k8s.core.v1.Namespace("cert-manager-ns", {
    metadata: { name: "cert-manager" },
}, { provider });

// ---------------------------------------------------------------------------
// 2. Traefik
// ---------------------------------------------------------------------------
export const traefik = new k8s.helm.v4.Chart("traefik", {
    chart: "traefik",
    version: "36.3.0",
    namespace: "ingress",
    repositoryOpts: {
        repo: "https://traefik.github.io/charts",
    },
    values: {
        logs: {
            general: {
                level: "DEBUG",
            },
        },
        additionalArguments: [
            "--serverstransport.insecureskipverify=true",
        ],
        service: {
            type: "NodePort",
        },
        ports: {
            web: {
                nodePort: 30080,
                redirections: {
                    entryPoint: {
                        to: "websecure",
                        scheme: "https",
                        permanent: true,
                    },
                },
            },
            websecure: {
                nodePort: 30443,
            },
        },
        ingressClass: {
            enabled: true,
            isDefaultClass: true,
        },
    },
}, {
    provider,
    dependsOn: [certManager],
    customTimeouts: { create: "5m", update: "5m" },
});

const ingressNs = new k8s.core.v1.Namespace("ingress-ns", {
    metadata: { name: "ingress" },
}, { provider });

// ---------------------------------------------------------------------------
// 3. PostgreSQL
// ---------------------------------------------------------------------------
export const postgresql = new k8s.helm.v4.Chart("db", {
    chart: "postgresql",
    version: "12.10.0",
    namespace: "default",
    repositoryOpts: {
        repo: "https://charts.bitnami.com/bitnami",
    },
    values: {
        primary: {
            pgHbaConfiguration: "host all all all trust",
        },
    },
}, {
    provider,
    dependsOn: [traefik],
    customTimeouts: { create: "5m", update: "5m" },
});

// ---------------------------------------------------------------------------
// 4. Zitadel
// ---------------------------------------------------------------------------
export const zitadel = new k8s.helm.v4.Chart("my-zitadel", {
    chart: "zitadel",
    namespace: "default",
    repositoryOpts: {
        repo: "https://charts.zitadel.com",
    },
    values: {
        zitadel: {
            masterkey: "x123456789012345678901234567891y",
            configmapConfig: {
                Log: {
                    Level: "debug",
                },
                ExternalDomain: zitadelDomain,
                ExternalPort: 443,
                TLS: {
                    Enabled: false,
                },
                FirstInstance: {
                    Org: {
                        Machine: {
                            Machine: {
                                Username: "zitadel-admin-sa",
                                Name: "Admin",
                            },
                            MachineKey: {
                                ExpirationDate: "2026-01-01T00:00:00Z",
                                Type: 1,
                            },
                        },
                    },
                },
                Database: {
                    Postgres: {
                        Host: "db-postgresql",
                        Port: 5432,
                        Database: "zitadel",
                        MaxOpenConns: 20,
                        MaxIdleConns: 10,
                        MaxConnLifetime: "30m",
                        MaxConnIdleTime: "5m",
                        User: {
                            Username: "postgres",
                            SSL: {
                                Mode: "disable",
                            },
                        },
                        Admin: {
                            Username: "postgres",
                            SSL: {
                                Mode: "disable",
                            },
                        },
                    },
                },
            },
        },
        ingress: {
            enabled: true,
        },
        login: {
            ingress: {
                enabled: true,
            },
        },
    },
}, {
    provider,
    dependsOn: [postgresql],
    customTimeouts: { create: "10m", update: "10m" },
});

// ---------------------------------------------------------------------------
// Post-Helm: cert-manager CRDs, certificates, ingress patching
// ---------------------------------------------------------------------------

// Wait for cert-manager CRDs to be available
const waitForCertManagerCrds = new command.Command("wait-for-cert-manager-crds", {
    create: `kubectl --kubeconfig ${kubeConfigPath} --context ${kubeContext} wait --for=condition=Established crd/clusterissuers.cert-manager.io crd/certificates.cert-manager.io --timeout=120s`,
}, { dependsOn: [certManager] });

// Create a self-signed ClusterIssuer
export const selfSignedIssuer = new k8s.apiextensions.CustomResource("selfsigned-issuer", {
    apiVersion: "cert-manager.io/v1",
    kind: "ClusterIssuer",
    metadata: {
        name: "selfsigned-issuer",
    },
    spec: {
        selfSigned: {},
    },
}, {
    provider,
    dependsOn: [waitForCertManagerCrds],
});

// Create a certificate for Zitadel
export const zitadelCert = new k8s.apiextensions.CustomResource("zitadel-cert", {
    apiVersion: "cert-manager.io/v1",
    kind: "Certificate",
    metadata: {
        name: "zitadel-cert",
        namespace: "default",
    },
    spec: {
        secretName: "zitadel-tls",
        issuerRef: {
            name: "selfsigned-issuer",
            kind: "ClusterIssuer",
        },
        dnsNames: [zitadelDomain],
    },
}, {
    provider,
    dependsOn: [selfSignedIssuer, zitadel],
});

// Wait for certificate to be ready
const waitForCertReady = new command.Command("wait-for-cert-ready", {
    create: `kubectl --kubeconfig ${kubeConfigPath} --context ${kubeContext} wait --for=condition=Ready certificate/zitadel-cert -n default --timeout=120s`,
}, { dependsOn: [zitadelCert] });

// Patch Zitadel ingress with TLS
const patchZitadelIngress = new command.Command("patch-zitadel-ingress", {
    create: `kubectl --kubeconfig ${kubeConfigPath} --context ${kubeContext} patch ingress my-zitadel -n default --type=merge -p '{"spec":{"tls":[{"hosts":["${zitadelDomain}"],"secretName":"zitadel-tls"}]}}'`,
}, { dependsOn: [waitForCertReady] });

// Patch Zitadel login ingress with TLS
const patchZitadelLoginIngress = new command.Command("patch-zitadel-login-ingress", {
    create: `kubectl --kubeconfig ${kubeConfigPath} --context ${kubeContext} patch ingress my-zitadel-login -n default --type=merge -p '{"spec":{"tls":[{"hosts":["${zitadelDomain}"],"secretName":"zitadel-tls"}]}}'`,
}, { dependsOn: [waitForCertReady] });

// Extract certificate to local file
const extractCert = new command.Command("extract-zitadel-cert", {
    create: `mkdir -p ./certs && kubectl --kubeconfig ${kubeConfigPath} --context ${kubeContext} get secret zitadel-tls -n default -o jsonpath='{.data.ca\\.crt}' | base64 -d > ./certs/zitadel-cert.crt`,
}, { dependsOn: [waitForCertReady] });

// Placeholder: extract credentials
const extractCredentials = new command.Command("extract-credentials", {
    create: `echo "TODO: Extract Zitadel admin credentials"`,
}, { dependsOn: [patchZitadelIngress, patchZitadelLoginIngress] });

// Placeholder: verify deployment
const verifyDeployment = new command.Command("verify-deployment", {
    create: `echo "TODO: Verify Zitadel deployment is healthy"`,
}, { dependsOn: [extractCredentials] });

// Completion message
const completionMessage = new command.Command("completion-message", {
    create: `echo "Platform components deployed successfully. Zitadel available at https://${zitadelDomain}"`,
}, { dependsOn: [verifyDeployment, extractCert] });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export const zitadel_url = `https://${zitadelDomain}`;
export const admin_credentials = "Extract from Zitadel machine key secret after deployment";
