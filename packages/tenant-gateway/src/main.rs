mod auth;
mod routes;
mod ui;

use axum::middleware;
use axum::routing::{delete, get, post};
use axum::Router;
use kube::config::{KubeConfigOptions, Kubeconfig};
use kube::{Client, Config};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing::info;

pub struct AppState {
    pub client: Client,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("tenant_gateway=info".parse()?),
        )
        .init();

    let client = match std::env::var("KUBECONFIG_DATA") {
        Ok(data) => {
            let kubeconfig = Kubeconfig::from_yaml(&data)?;
            let config = Config::from_custom_kubeconfig(kubeconfig, &KubeConfigOptions::default()).await?;
            Client::try_from(config)?
        }
        Err(_) => Client::try_default().await?,
    };
    let state = Arc::new(AppState { client });

    let app = Router::new()
        .route("/", get(ui::index))
        .route("/tenants", get(routes::list_tenants))
        .route("/tenants", post(routes::create_tenant))
        .route("/tenants/{name}", delete(routes::delete_tenant))
        .layer(middleware::from_fn(auth::basic_auth))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = "0.0.0.0:8080";
    info!("listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}