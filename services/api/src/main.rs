//! Development-only loopback API. No production auth, persistence or multi-tenant isolation.
use axum::{
    extract::{DefaultBodyLimit, Path, State},
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
use std::{env, net::SocketAddr, sync::Arc, time::Duration};
use tower::ServiceBuilder;
use tower_http::{
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    timeout::TimeoutLayer,
    trace::{DefaultOnResponse, TraceLayer},
};

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
// Readiness for the in-memory development API: the service has no external
// dependencies, so constructed == ready. A future durable adapter must make
// this check real (pool connectivity, migration version) before reuse.
async fn ready() -> Json<ApiMessage> {
    Json(ApiMessage { message: "ready" })
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

fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .route("/v1/consents", post(grant))
        .route("/v1/consents/{id}/revoke", post(revoke))
        .route("/v1/events", post(ingest))
        .layer(
            ServiceBuilder::new()
                // Outermost first: assign x-request-id, echo it back, bound
                // request size/time, and trace with the id in the span.
                .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
                .layer(PropagateRequestIdLayer::x_request_id())
                .layer(
                    TraceLayer::new_for_http()
                        .make_span_with(|request: &axum::http::Request<_>| {
                            let request_id = request
                                .headers()
                                .get("x-request-id")
                                .and_then(|v| v.to_str().ok())
                                .unwrap_or("-");
                            tracing::info_span!(
                                "http_request",
                                method = %request.method(),
                                path = %request.uri().path(),
                                %request_id,
                            )
                        })
                        .on_response(DefaultOnResponse::new().include_headers(true)),
                )
                .layer(TimeoutLayer::with_status_code(
                    StatusCode::REQUEST_TIMEOUT,
                    Duration::from_secs(30),
                ))
                .layer(DefaultBodyLimit::max(64 * 1024)),
        )
        .with_state(state)
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
    let app = build_router(state);
    tracing::info!(addr = %addr, "starting loopback-only SOVIR development API");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    fn test_state() -> AppState {
        AppState {
            service: SovirService::new(
                Arc::new(SystemClock),
                Arc::new(InMemoryConsentRepository::default()),
                Arc::new(InMemoryEventRepository::default()),
                Arc::new(DeterministicRiskAnalyzer),
            ),
            bearer: Arc::from("test-token-with-24-plus-characters"),
        }
    }

    #[tokio::test]
    async fn liveness_responds_and_propagates_request_id() {
        let app = build_router(test_state());
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health/live")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert!(response.headers().contains_key("x-request-id"));
    }

    #[tokio::test]
    async fn readiness_responds() {
        let app = build_router(test_state());
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health/ready")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn events_without_token_are_unauthorized() {
        let app = build_router(test_state());
        let event = serde_json::json!({
            "event_id": "e-1",
            "source_id": "browser.synthetic",
            "observed_at_ms": 0,
            "modality": "URL",
            "content_digest": "sha256:test",
            "consent_grant_id": "g-1",
            "sensitive_data_class": "PUBLIC"
        });
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/events")
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_vec(&event).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn oversized_body_is_rejected() {
        let app = build_router(test_state());
        let big = vec![b'x'; 128 * 1024];
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/events")
                    .header("content-type", "application/json")
                    .header("authorization", "Bearer test-token-with-24-plus-characters")
                    .body(Body::from(big))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    }
}
