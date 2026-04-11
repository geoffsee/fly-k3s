mod sync;

use std::sync::Arc;

use futures::StreamExt;
use kube::api::Api;
use kube::runtime::controller::Controller;
use kube::runtime::watcher::Config;
use kube::{Client, CustomResourceExt};
use tenant_crd::Tenant;
use tracing::info;

use sync::Context;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Kubernetes API error: {0}")]
    Kube(#[from] kube::Error),
    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("tenant_operator=info".parse()?),
        )
        .init();

    let client = Client::try_default().await?;

    // Install or update the CRD
    install_crd(&client).await?;

    let tenants: Api<Tenant> = Api::all(client.clone());
    let ctx = Arc::new(Context {
        client: client.clone(),
    });

    info!("starting tenant operator");

    Controller::new(tenants, Config::default())
        .shutdown_on_signal()
        .run(sync::sync_tenant, sync::on_error, ctx)
        .for_each(|res| async move {
            match res {
                Ok(obj) => info!(tenant = %obj.0.name, "synced"),
                Err(e) => tracing::error!("controller error: {:?}", e),
            }
        })
        .await;

    Ok(())
}

async fn install_crd(client: &Client) -> Result<(), Error> {
    let crd = Tenant::crd();
    let crds: Api<k8s_openapi::apiextensions_apiserver::pkg::apis::apiextensions::v1::CustomResourceDefinition> =
        Api::all(client.clone());
    crds.patch(
        "tenants.platform.fly-k3s.io",
        &kube::api::PatchParams::apply("tenant-operator"),
        &kube::api::Patch::Apply(crd),
    )
    .await?;
    info!("CRD installed");
    Ok(())
}