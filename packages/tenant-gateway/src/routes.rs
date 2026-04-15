use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use kube::api::{Api, DeleteParams, PostParams};
use kube::ResourceExt;
use serde::{Deserialize, Serialize};
use tenant_crd::{Tenant, TenantSpec};
use tracing::info;

use crate::AppState;

#[derive(Deserialize)]
pub struct CreateTenantRequest {
    pub name: String,
    pub cpu: String,
    pub memory: String,
    pub default_pod_cpu: Option<String>,
    pub default_pod_memory: Option<String>,
}

#[derive(Serialize)]
pub struct TenantResponse {
    pub name: String,
    pub cpu: String,
    pub memory: String,
    pub phase: Option<String>,
    pub message: Option<String>,
    pub kubeconfig: Option<String>,
}

pub async fn list_tenants(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<TenantResponse>>, (StatusCode, String)> {
    let api: Api<Tenant> = Api::all(state.client.clone());
    let tenants = api.list(&Default::default()).await.map_err(k8s_err)?;

    let response: Vec<TenantResponse> = tenants
        .items
        .into_iter()
        .map(|t| {
            let status = t.status.as_ref();
            TenantResponse {
                name: t.name_any(),
                cpu: t.spec.cpu.clone(),
                memory: t.spec.memory.clone(),
                phase: status.and_then(|s| s.phase.clone()),
                message: status.and_then(|s| s.message.clone()),
                kubeconfig: status.and_then(|s| s.kubeconfig.clone()),
            }
        })
        .collect();

    Ok(Json(response))
}

pub async fn create_tenant(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateTenantRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Validate tenant name
    let name_re = regex::Regex::new(r"^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$").unwrap();
    if !name_re.is_match(&req.name) {
        return Err((StatusCode::BAD_REQUEST, "Invalid tenant name".to_string()));
    }

    // Basic quantity validation
    let qty_re = regex::Regex::new(r"^[0-9]+(\.[0-9]+)?[mkiMGTPEYZ]?$").unwrap();
    if !qty_re.is_match(&req.cpu) || !qty_re.is_match(&req.memory) {
        return Err((StatusCode::BAD_REQUEST, "Invalid resource quantity".to_string()));
    }

    let api: Api<Tenant> = Api::all(state.client.clone());

    let tenant = Tenant::new(
        &req.name,
        TenantSpec {
            cpu: req.cpu,
            memory: req.memory,
            default_pod_cpu: req.default_pod_cpu,
            default_pod_memory: req.default_pod_memory,
        },
    );

    api.create(&PostParams::default(), &tenant)
        .await
        .map_err(k8s_err)?;

    info!(tenant = %req.name, "tenant created");
    Ok((StatusCode::CREATED, Json(serde_json::json!({"status": "created", "name": req.name}))))
}

pub async fn delete_tenant(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let api: Api<Tenant> = Api::all(state.client.clone());
    api.delete(&name, &DeleteParams::default())
        .await
        .map_err(k8s_err)?;

    info!(tenant = %name, "tenant deleted");
    Ok((StatusCode::OK, Json(serde_json::json!({"status": "deleted", "name": name}))))
}

pub async fn get_tenant_kubeconfig(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let api: Api<Tenant> = Api::all(state.client.clone());
    let tenant = api.get(&name).await.map_err(k8s_err)?;
    
    let kubeconfig = tenant.status.and_then(|s| s.kubeconfig)
        .ok_or((StatusCode::NOT_FOUND, "Kubeconfig not ready yet".to_string()))?;

    let filename = format!("{}-kubeconfig.yml", name);
    
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, "application/x-yaml".parse().unwrap());
    headers.insert(
        header::CONTENT_DISPOSITION,
        format!("attachment; filename=\"{}\"", filename).parse().unwrap(),
    );
    
    Ok((StatusCode::OK, headers, kubeconfig))
}

fn k8s_err(e: kube::Error) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
}