use axum::extract::Request;
use axum::http::{header, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;

pub async fn basic_auth(req: Request, next: Next) -> Response {
    let expected_user = std::env::var("ADMIN_USER").expect("ADMIN_USER must be set");
    let expected_pass = std::env::var("ADMIN_PASS").expect("ADMIN_PASS must be set");

    let unauthorized = (
        StatusCode::UNAUTHORIZED,
        [(header::WWW_AUTHENTICATE, "Basic realm=\"tenant-gateway\"")],
        "Unauthorized",
    );

    let Some(auth_header) = req.headers().get(header::AUTHORIZATION) else {
        return unauthorized.into_response();
    };

    let Ok(auth_str) = auth_header.to_str() else {
        return unauthorized.into_response();
    };

    let Some(encoded) = auth_str.strip_prefix("Basic ") else {
        return unauthorized.into_response();
    };

    let Ok(decoded) = STANDARD.decode(encoded) else {
        return unauthorized.into_response();
    };

    let Ok(credentials) = String::from_utf8(decoded) else {
        return unauthorized.into_response();
    };

    let Some((user, pass)) = credentials.split_once(':') else {
        return unauthorized.into_response();
    };

    if user != expected_user || pass != expected_pass {
        return unauthorized.into_response();
    }

    next.run(req).await
}