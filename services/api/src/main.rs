//! Development-only loopback API. No production auth, persistence or multi-tenant isolation.
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;
use sovir_adapters::{
    DeterministicRiskAnalyzer, InMemoryConsentRepository, InMemoryEventRepository, SystemClock,
};
use sovir_application::{AppError, SovirService};
use sovir_domain::{ConsentGrant, DomainError, EventDecision, ObservedEvent};
use sovir_ports::PortError;
use std::{env, net::SocketAddr, sync::Arc};

#[derive(Clone)]
struct AppState {
    service: SovirService,
    bearer: Arc<str>,
}
#[derive(Serialize)]
struct ApiMessage {
    message: &'static str,
}
type ApiError = (StatusCode, Json<ApiMessage>);

fn require_dev_auth(headers: &HeaderMap, state: &AppState) -> Result<(), ApiError> {
    let value = headers.get("authorization").and_then(|v| v.to_str().ok());
    // Development-only bearer auth; never expose this service publicly.
    let accepted = value
        .map(|v| v.strip_prefix("Bearer ") == Some(state.bearer.as_ref()))
        .unwrap_or(false);
    if accepted {
        Ok(())
    } else {
        Err((
            StatusCode::UNAUTHORIZED,
            Json(ApiMessage {
                message: "unauthorized",
            }),
        ))
    }
}
fn map_error(e: AppError) -> ApiError {
    let (status, message) = match e {
        AppError::Domain(DomainError::ConsentRequired) | AppError::ConsentNotFound => {
            (StatusCode::FORBIDDEN, "consent_required")
        }
        AppError::Domain(_) | AppError::InvalidGrant => {
            (StatusCode::BAD_REQUEST, "invalid_request")
        }
        AppError::Port(PortError::Duplicate) => (StatusCode::CONFLICT, "duplicate_event"),
        AppError::Port(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error"),
    };
    (status, Json(ApiMessage { message }))
}
async fn live() -> Json<ApiMessage> {
    Json(ApiMessage { message: "alive" })
}
async fn grant(
    State(s): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ConsentGrant>,
) -> Result<StatusCode, ApiError> {
    require_dev_auth(&headers, &s)?;
    s.service.grant(body).map_err(map_error)?;
    Ok(StatusCode::CREATED)
}
async fn revoke(
    State(s): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    require_dev_auth(&headers, &s)?;
    match s.service.revoke(&id).map_err(map_error)? {
        true => Ok(StatusCode::NO_CONTENT),
        false => Err((
            StatusCode::NOT_FOUND,
            Json(ApiMessage {
                message: "not_found",
            }),
        )),
    }
}
async fn ingest(
    State(s): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ObservedEvent>,
) -> Result<(StatusCode, Json<EventDecision>), ApiError> {
    require_dev_auth(&headers, &s)?;
    let decision = s.service.ingest(body).map_err(map_error)?;
    Ok((StatusCode::CREATED, Json(decision)))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let addr: SocketAddr = env::var("SOVIR_API_BIND")
        .unwrap_or_else(|_| "127.0.0.1:8787".into())
        .parse()?;
    if !addr.ip().is_loopback() {
        return Err("dev API must bind only to loopback".into());
    }
    let bearer = env::var("SOVIR_API_DEV_TOKEN")
        .map_err(|_| "set SOVIR_API_DEV_TOKEN (at least 24 characters)")?;
    if bearer.len() < 24 {
        return Err("SOVIR_API_DEV_TOKEN must be >= 24 characters".into());
    }
    if env::var("SOVIR_ALLOW_REMOTE_INFERENCE").unwrap_or_default() == "true" {
        return Err("remote inference not implemented; disable it (fail closed)".into());
    }
    tracing_subscriber::fmt().with_env_filter("info").init();
    let service = SovirService::new(
        Arc::new(SystemClock),
        Arc::new(InMemoryConsentRepository::default()),
        Arc::new(InMemoryEventRepository::default()),
        Arc::new(DeterministicRiskAnalyzer),
    );
    let state = AppState {
        service,
        bearer: Arc::from(bearer),
    };
    let app = Router::new()
        .route("/health/live", get(live))
        .route("/v1/consents", post(grant))
        .route("/v1/consents/{id}/revoke", post(revoke))
        .route("/v1/events", post(ingest))
        .with_state(state);
    tracing::info!(addr = %addr, "starting loopback-only SOVIR development API");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
