use kube::CustomResource;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(CustomResource, Deserialize, Serialize, Clone, Debug, JsonSchema)]
#[kube(
    group = "platform.fly-k3s.io",
    version = "v1alpha1",
    kind = "Tenant",
    namespaced = false,
    status = "TenantStatus",
    printcolumn = r#"{"name":"Phase","type":"string","jsonPath":".status.phase"}"#
)]
pub struct TenantSpec {
    /// CPU limit for the tenant namespace (e.g. "2")
    pub cpu: String,
    /// Memory limit for the tenant namespace (e.g. "4Gi")
    pub memory: String,
    /// Optional per-pod CPU default (e.g. "500m")
    pub default_pod_cpu: Option<String>,
    /// Optional per-pod memory default (e.g. "256Mi")
    pub default_pod_memory: Option<String>,
}

#[derive(Deserialize, Serialize, Clone, Debug, Default, JsonSchema)]
pub struct TenantStatus {
    pub phase: Option<String>,
    pub message: Option<String>,
}