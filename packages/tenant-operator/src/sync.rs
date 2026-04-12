use std::collections::BTreeMap;
use std::sync::Arc;

use k8s_openapi::api::core::v1::{
    LimitRange, LimitRangeItem, LimitRangeSpec, Namespace, ResourceQuota, ResourceQuotaSpec,
};
use k8s_openapi::api::networking::v1::{
    NetworkPolicy, NetworkPolicyEgressRule, NetworkPolicyIngressRule, NetworkPolicyPeer,
    NetworkPolicyPort, NetworkPolicySpec,
};
use k8s_openapi::api::rbac::v1::{PolicyRule, Role, RoleBinding, RoleRef, Subject};
use k8s_openapi::apimachinery::pkg::api::resource::Quantity;
use k8s_openapi::apimachinery::pkg::apis::meta::v1::LabelSelector;
use kube::api::{Api, ObjectMeta, Patch, PatchParams};
use kube::runtime::controller::Action;
use kube::{Client, ResourceExt};
use tracing::{info, warn};

use tenant_crd::{Tenant, TenantStatus};
use crate::Error;

pub struct Context {
    pub client: Client,
}

pub async fn sync_tenant(tenant: Arc<Tenant>, ctx: Arc<Context>) -> Result<Action, Error> {
    let client = &ctx.client;
    let name = tenant.name_any();
    let ns = format!("tenant-{name}");

    info!(tenant = %name, namespace = %ns, "syncing tenant");

    ensure_namespace(client, &ns, &name).await?;
    ensure_resource_quota(client, &ns, &tenant.spec).await?;
    ensure_limit_range(client, &ns, &tenant.spec).await?;
    ensure_network_policy(client, &ns).await?;
    ensure_rbac(client, &ns).await?;
    update_status(client, &name, "Ready", "All resources synced").await?;

    info!(tenant = %name, "sync complete");
    Ok(Action::requeue(std::time::Duration::from_secs(300)))
}

pub fn on_error(tenant: Arc<Tenant>, error: &Error, _ctx: Arc<Context>) -> Action {
    warn!(tenant = %tenant.name_any(), %error, "sync failed, retrying");
    Action::requeue(std::time::Duration::from_secs(30))
}

async fn ensure_namespace(client: &Client, ns: &str, tenant: &str) -> Result<(), Error> {
    let api: Api<Namespace> = Api::all(client.clone());
    let labels = tenant_labels(tenant);
    let namespace = Namespace {
        metadata: ObjectMeta {
            name: Some(ns.to_string()),
            labels: Some(labels),
            ..Default::default()
        },
        ..Default::default()
    };
    api.patch(ns, &patch_params(), &Patch::Apply(namespace))
        .await?;
    Ok(())
}

async fn ensure_resource_quota(
    client: &Client,
    ns: &str,
    spec: &tenant_crd::TenantSpec,
) -> Result<(), Error> {
    let api: Api<ResourceQuota> = Api::namespaced(client.clone(), ns);
    let mut hard = BTreeMap::new();
    hard.insert("limits.cpu".to_string(), Quantity(spec.cpu.clone()));
    hard.insert("limits.memory".to_string(), Quantity(spec.memory.clone()));

    let quota = ResourceQuota {
        metadata: ObjectMeta {
            name: Some("tenant-quota".to_string()),
            namespace: Some(ns.to_string()),
            ..Default::default()
        },
        spec: Some(ResourceQuotaSpec {
            hard: Some(hard),
            ..Default::default()
        }),
        ..Default::default()
    };
    api.patch("tenant-quota", &patch_params(), &Patch::Apply(quota))
        .await?;
    Ok(())
}

async fn ensure_limit_range(
    client: &Client,
    ns: &str,
    spec: &tenant_crd::TenantSpec,
) -> Result<(), Error> {
    let api: Api<LimitRange> = Api::namespaced(client.clone(), ns);

    let cpu_default = spec
        .default_pod_cpu
        .clone()
        .unwrap_or_else(|| "500m".to_string());
    let mem_default = spec
        .default_pod_memory
        .clone()
        .unwrap_or_else(|| "256Mi".to_string());

    let mut defaults = BTreeMap::new();
    defaults.insert("cpu".to_string(), Quantity(cpu_default));
    defaults.insert("memory".to_string(), Quantity(mem_default));

    let limit_range = LimitRange {
        metadata: ObjectMeta {
            name: Some("tenant-limits".to_string()),
            namespace: Some(ns.to_string()),
            ..Default::default()
        },
        spec: Some(LimitRangeSpec {
            limits: vec![LimitRangeItem {
                type_: "Container".to_string(),
                default: Some(defaults),
                ..Default::default()
            }],
        }),
    };
    api.patch("tenant-limits", &patch_params(), &Patch::Apply(limit_range))
        .await?;
    Ok(())
}

async fn ensure_network_policy(client: &Client, ns: &str) -> Result<(), Error> {
    let api: Api<NetworkPolicy> = Api::namespaced(client.clone(), ns);
    let policy = NetworkPolicy {
        metadata: ObjectMeta {
            name: Some("tenant-isolation".to_string()),
            namespace: Some(ns.to_string()),
            ..Default::default()
        },
        spec: Some(NetworkPolicySpec {
            pod_selector: LabelSelector::default(),
            ingress: Some(vec![NetworkPolicyIngressRule {
                from: Some(vec![NetworkPolicyPeer {
                    namespace_selector: Some(LabelSelector {
                        match_labels: Some(BTreeMap::from([(
                            "kubernetes.io/metadata.name".to_string(),
                            ns.to_string(),
                        )])),
                        ..Default::default()
                    }),
                    ..Default::default()
                }]),
                ..Default::default()
            }]),
            egress: Some(vec![
                // Allow DNS
                NetworkPolicyEgressRule {
                    to: Some(vec![NetworkPolicyPeer {
                        namespace_selector: Some(LabelSelector {
                            match_labels: Some(BTreeMap::from([(
                                "kubernetes.io/metadata.name".to_string(),
                                "kube-system".to_string(),
                            )])),
                            ..Default::default()
                        }),
                        ..Default::default()
                    }]),
                    ports: Some(vec![NetworkPolicyPort {
                        port: Some(k8s_openapi::apimachinery::pkg::util::intstr::IntOrString::Int(
                            53,
                        )),
                        protocol: Some("UDP".to_string()),
                        ..Default::default()
                    }]),
                },
                // Allow egress within namespace
                NetworkPolicyEgressRule {
                    to: Some(vec![NetworkPolicyPeer {
                        pod_selector: Some(LabelSelector::default()),
                        ..Default::default()
                    }]),
                    ..Default::default()
                },
            ]),
            policy_types: Some(vec!["Ingress".to_string(), "Egress".to_string()]),
            ..Default::default()
        }),
    };
    api.patch("tenant-isolation", &patch_params(), &Patch::Apply(policy))
        .await?;
    Ok(())
}

async fn ensure_rbac(client: &Client, ns: &str) -> Result<(), Error> {
    let role_api: Api<Role> = Api::namespaced(client.clone(), ns);
    let role = Role {
        metadata: ObjectMeta {
            name: Some("tenant-manager".to_string()),
            namespace: Some(ns.to_string()),
            ..Default::default()
        },
        rules: Some(vec![
            PolicyRule {
                api_groups: Some(vec!["".to_string()]),
                resources: Some(vec![
                    "pods".to_string(),
                    "services".to_string(),
                    "configmaps".to_string(),
                    "secrets".to_string(),
                ]),
                verbs: vec![
                    "get".to_string(),
                    "list".to_string(),
                    "watch".to_string(),
                    "create".to_string(),
                    "update".to_string(),
                    "patch".to_string(),
                    "delete".to_string(),
                ],
                ..Default::default()
            },
            PolicyRule {
                api_groups: Some(vec!["apps".to_string()]),
                resources: Some(vec!["deployments".to_string(), "statefulsets".to_string()]),
                verbs: vec![
                    "get".to_string(),
                    "list".to_string(),
                    "watch".to_string(),
                    "create".to_string(),
                    "update".to_string(),
                    "patch".to_string(),
                    "delete".to_string(),
                ],
                ..Default::default()
            },
            PolicyRule {
                api_groups: Some(vec!["networking.k8s.io".to_string()]),
                resources: Some(vec!["ingresses".to_string(), "networkpolicies".to_string()]),
                verbs: vec!["get".to_string(), "list".to_string(), "watch".to_string()],
                ..Default::default()
            },
        ]),
    };
    role_api
        .patch("tenant-manager", &patch_params(), &Patch::Apply(role))
        .await?;

    let sa_api: Api<k8s_openapi::api::core::v1::ServiceAccount> =
        Api::namespaced(client.clone(), ns);
    let sa = k8s_openapi::api::core::v1::ServiceAccount {
        metadata: ObjectMeta {
            name: Some("tenant-admin".to_string()),
            namespace: Some(ns.to_string()),
            ..Default::default()
        },
        ..Default::default()
    };
    sa_api
        .patch("tenant-admin", &patch_params(), &Patch::Apply(sa))
        .await?;

    let rb_api: Api<RoleBinding> = Api::namespaced(client.clone(), ns);
    let rb = RoleBinding {
        metadata: ObjectMeta {
            name: Some("tenant-admin-binding".to_string()),
            namespace: Some(ns.to_string()),
            ..Default::default()
        },
        role_ref: RoleRef {
            api_group: "rbac.authorization.k8s.io".to_string(),
            kind: "Role".to_string(),
            name: "tenant-manager".to_string(),
        },
        subjects: Some(vec![Subject {
            kind: "ServiceAccount".to_string(),
            name: "tenant-admin".to_string(),
            namespace: Some(ns.to_string()),
            ..Default::default()
        }]),
    };
    rb_api
        .patch(
            "tenant-admin-binding",
            &patch_params(),
            &Patch::Apply(rb),
        )
        .await?;
    Ok(())
}

async fn update_status(
    client: &Client,
    tenant_name: &str,
    phase: &str,
    message: &str,
) -> Result<(), Error> {
    let api: Api<Tenant> = Api::all(client.clone());
    let status = serde_json::json!({
        "apiVersion": "platform.fly-k3s.io/v1alpha1",
        "kind": "Tenant",
        "metadata": { "name": tenant_name },
        "status": TenantStatus {
            phase: Some(phase.to_string()),
            message: Some(message.to_string()),
        }
    });
    api.patch_status(
        tenant_name,
        &PatchParams::apply("tenant-operator"),
        &Patch::Apply(status),
    )
    .await?;
    Ok(())
}

fn patch_params() -> PatchParams {
    PatchParams::apply("tenant-operator")
}

fn tenant_labels(tenant: &str) -> BTreeMap<String, String> {
    BTreeMap::from([
        ("app.kubernetes.io/managed-by".to_string(), "tenant-operator".to_string()),
        ("platform.fly-k3s.io/tenant".to_string(), tenant.to_string()),
    ])
}