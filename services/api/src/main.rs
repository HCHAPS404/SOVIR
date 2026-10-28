//! Development-only loopback API. No production auth, persistence or multi-tenant isolation.
use axum::{
    extract::{DefaultBodyLimit, Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sovir_adapters::{
    DeterministicRiskAnalyzer, InMemoryConsentRepository, InMemoryDeviceRegistry,
    InMemoryEventRepository, InMemoryInterventionSink, InMemorySessionStore,
    RecordingDeliveryChannel, SystemClock,
};
use sovir_application::{AppError, ServicePorts, SovirService};
use sovir_domain::{
    ConsentGrant, Device, DomainError, EventDecision, Intervention, ObservedEvent, Platform,
    Principal, Session,
};
use sovir_persistence::PgStore;
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
    /// dev-session endpoint is only enabled for local/test environments.
    dev_session_enabled: bool,
    /// Present only when the durable Postgres adapter is active; readiness
    /// then means a live pool probe instead of a trivial constant.
    pg: Option<PgStore>,
}
#[derive(Serialize)]
struct ApiMessage {
    message: &'static str,
}
type ApiError = (StatusCode, Json<ApiMessage>);

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
}
/// Resolves the session bearer token to a Principal. Dev sessions only —
/// never expose this service publicly.
fn require_principal(headers: &HeaderMap, state: &AppState) -> Result<Principal, ApiError> {
    let token = bearer_token(headers).ok_or((
        StatusCode::UNAUTHORIZED,
        Json(ApiMessage {
            message: "unauthorized",
        }),
    ))?;
    state.service.authenticate(token).map_err(map_error)
}
fn map_error(e: AppError) -> ApiError {
    let (status, message) = match e {
        AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
        AppError::Forbidden => (StatusCode::FORBIDDEN, "forbidden"),
        AppError::DeviceRevoked => (StatusCode::FORBIDDEN, "device_revoked"),
        AppError::Domain(DomainError::ConsentRequired) | AppError::ConsentNotFound => {
            (StatusCode::FORBIDDEN, "consent_required")
        }
        AppError::Domain(_) | AppError::InvalidGrant | AppError::InvalidRequest => {
            (StatusCode::BAD_REQUEST, "invalid_request")
        }
        AppError::Port(PortError::Duplicate) => (StatusCode::CONFLICT, "duplicate_event"),
        AppError::Port(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error"),
    };
    (status, Json(ApiMessage { message }))
}
/// Durable adapter when `DATABASE_URL` is set (fails closed on connect
/// error); in-memory otherwise.
async fn compose_service(database_url: Option<&str>) -> (SovirService, Option<PgStore>) {
    if let Some(url) = database_url {
        let pg = PgStore::connect(url)
            .await
            .expect("DATABASE_URL is set but Postgres is unreachable; refusing to start");
        let service = SovirService::new(
            Arc::new(SystemClock),
            ServicePorts {
                grants: Arc::new(pg.clone()),
                events: Arc::new(pg.clone()),
                risk: Arc::new(DeterministicRiskAnalyzer),
                sessions: Arc::new(pg.clone()),
                devices: Arc::new(pg.clone()),
                sink: Arc::new(pg.clone()),
                channel: Arc::new(RecordingDeliveryChannel::default()),
            },
        );
        return (service, Some(pg));
    }
    (dev_service(), None)
}
fn dev_service() -> SovirService {
    SovirService::new(
        Arc::new(SystemClock),
        ServicePorts {
            grants: Arc::new(InMemoryConsentRepository::default()),
            events: Arc::new(InMemoryEventRepository::default()),
            risk: Arc::new(DeterministicRiskAnalyzer),
            sessions: Arc::new(InMemorySessionStore::default()),
            devices: Arc::new(InMemoryDeviceRegistry::default()),
            sink: Arc::new(InMemoryInterventionSink::default()),
            channel: Arc::new(RecordingDeliveryChannel::default()),
        },
    )
}
async fn live() -> Json<ApiMessage> {
    Json(ApiMessage { message: "alive" })
}
// Readiness: in-memory means constructed == ready; with the Postgres adapter
// it is a real pool probe (SELECT 1).
async fn ready(State(s): State<AppState>) -> Result<Json<ApiMessage>, ApiError> {
    match &s.pg {
        Some(pg) if !pg.healthy().await => Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ApiMessage {
                message: "not_ready",
            }),
        )),
        _ => Ok(Json(ApiMessage { message: "ready" })),
    }
}

#[derive(Deserialize)]
struct DevSessionRequest {
    principal_id: String,
    #[serde(default)]
    device_id: Option<String>,
}
async fn dev_session(
    State(s): State<AppState>,
    Json(body): Json<DevSessionRequest>,
) -> Result<(StatusCode, Json<Session>), ApiError> {
    if !s.dev_session_enabled {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ApiMessage {
                message: "dev_sessions_disabled",
            }),
        ));
    }
    let device_id = body.device_id.unwrap_or_else(|| "dev-device".to_string());
    let session = s
        .service
        .issue_dev_session(&body.principal_id, &device_id)
        .map_err(map_error)?;
    Ok((StatusCode::CREATED, Json(session)))
}
async fn logout(State(s): State<AppState>, headers: HeaderMap) -> Result<StatusCode, ApiError> {
    let token = bearer_token(&headers).ok_or((
        StatusCode::UNAUTHORIZED,
        Json(ApiMessage {
            message: "unauthorized",
        }),
    ))?;
    match s.service.logout(token).map_err(map_error)? {
        true => Ok(StatusCode::NO_CONTENT),
        false => Err((
            StatusCode::NOT_FOUND,
            Json(ApiMessage {
                message: "not_found",
            }),
        )),
    }
}
async fn whoami(
    State(s): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Principal>, ApiError> {
    Ok(Json(require_principal(&headers, &s)?))
}

#[derive(Deserialize)]
struct RegisterDeviceRequest {
    #[serde(default)]
    device_id: Option<String>,
    platform: Platform,
    #[serde(default)]
    label: String,
}
async fn register_device(
    State(s): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<RegisterDeviceRequest>,
) -> Result<(StatusCode, Json<Device>), ApiError> {
    let p = require_principal(&headers, &s)?;
    let device = s
        .service
        .register_device(&p, body.device_id.as_deref(), body.platform, &body.label)
        .map_err(map_error)?;
    Ok((StatusCode::CREATED, Json(device)))
}
async fn list_devices(
    State(s): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<Device>>, ApiError> {
    let p = require_principal(&headers, &s)?;
    Ok(Json(s.service.list_devices(&p).map_err(map_error)?))
}
async fn revoke_device(
    State(s): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let p = require_principal(&headers, &s)?;
    match s.service.revoke_device(&p, &id).map_err(map_error)? {
        true => Ok(StatusCode::NO_CONTENT),
        false => Err((
            StatusCode::NOT_FOUND,
            Json(ApiMessage {
                message: "not_found",
            }),
        )),
    }
}

async fn grant(
    State(s): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ConsentGrant>,
) -> Result<StatusCode, ApiError> {
    let p = require_principal(&headers, &s)?;
    s.service.grant(&p, body).map_err(map_error)?;
    Ok(StatusCode::CREATED)
}
async fn revoke(
    State(s): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let p = require_principal(&headers, &s)?;
    match s.service.revoke(&p, &id).map_err(map_error)? {
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
    let p = require_principal(&headers, &s)?;
    let decision = s.service.ingest(&p, body).map_err(map_error)?;
    Ok((StatusCode::CREATED, Json(decision)))
}
async fn list_interventions(
    State(s): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<Intervention>>, ApiError> {
    let p = require_principal(&headers, &s)?;
    Ok(Json(s.service.list_interventions(&p).map_err(map_error)?))
}
#[derive(Serialize)]
struct DispatchResult {
    delivered: u64,
}
async fn dispatch(
    State(s): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<DispatchResult>, ApiError> {
    let p = require_principal(&headers, &s)?;
    let delivered = s.service.dispatch_due(&p).map_err(map_error)?;
    Ok(Json(DispatchResult { delivered }))
}

fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .route("/v1/auth/dev-session", post(dev_session))
        .route("/v1/auth/logout", post(logout))
        .route("/v1/auth/whoami", get(whoami))
        .route("/v1/devices", post(register_device).get(list_devices))
        .route("/v1/devices/{id}/revoke", post(revoke_device))
        .route("/v1/consents", post(grant))
        .route("/v1/consents/{id}/revoke", post(revoke))
        .route("/v1/events", post(ingest))
        .route("/v1/interventions", get(list_interventions))
        .route("/v1/interventions/dispatch", post(dispatch))
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
    // Dev sessions are the only auth path; they must never exist outside
    // local/test. Any other SOVIR_ENV disables the endpoint entirely.
    let sovir_env = env::var("SOVIR_ENV").unwrap_or_else(|_| "local".into());
    let dev_session_enabled = matches!(sovir_env.as_str(), "local" | "test");
    if env::var("SOVIR_ALLOW_REMOTE_INFERENCE").unwrap_or_default() == "true" {
        return Err("remote inference not implemented; disable it (fail closed)".into());
    }
    tracing_subscriber::fmt().with_env_filter("info").init();
    let database_url = env::var("DATABASE_URL").ok();
    let (service, pg) = compose_service(database_url.as_deref()).await;
    let state = AppState {
        service,
        dev_session_enabled,
        pg,
    };
    let app = build_router(state);
    tracing::info!(addr = %addr, env = %sovir_env, "starting loopback-only SOVIR development API");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::{Service, ServiceExt};

    fn test_state() -> AppState {
        AppState {
            service: dev_service(),
            dev_session_enabled: true,
            pg: None,
        }
    }

    async fn session_token(app: &mut Router, principal: &str) -> String {
        let body = serde_json::json!({"principal_id": principal, "device_id": "dev-device"});
        let response = app
            .call(
                Request::builder()
                    .method("POST")
                    .uri("/v1/auth/dev-session")
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_vec(&body).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        v["token"].as_str().unwrap().to_string()
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
    async fn events_without_session_are_unauthorized() {
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
    async fn dev_session_whoami_and_logout_flow() {
        let mut app = build_router(test_state());
        let token = session_token(&mut app, "user-1").await;
        let response = app
            .call(
                Request::builder()
                    .uri("/v1/auth/whoami")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(v["principal_id"], "user-1");
        assert_eq!(v["device_id"], "dev-device");
        let response = app
            .call(
                Request::builder()
                    .method("POST")
                    .uri("/v1/auth/logout")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        // Logged-out session fails closed.
        let response = app
            .call(
                Request::builder()
                    .uri("/v1/auth/whoami")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn device_register_list_revoke_flow() {
        let mut app = build_router(test_state());
        let token = session_token(&mut app, "user-1").await;
        let auth = format!("Bearer {token}");
        let body = serde_json::json!({
            "device_id": "dev-device",
            "platform": "WINDOWS",
            "label": "dev rig"
        });
        let response = app
            .call(
                Request::builder()
                    .method("POST")
                    .uri("/v1/devices")
                    .header("content-type", "application/json")
                    .header("authorization", &auth)
                    .body(Body::from(serde_json::to_vec(&body).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);
        let response = app
            .call(
                Request::builder()
                    .uri("/v1/devices")
                    .header("authorization", &auth)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        // Revoking the device kills its sessions: subsequent auth fails closed.
        let response = app
            .call(
                Request::builder()
                    .method("POST")
                    .uri("/v1/devices/dev-device/revoke")
                    .header("authorization", &auth)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        let response = app
            .call(
                Request::builder()
                    .uri("/v1/auth/whoami")
                    .header("authorization", &auth)
                    .body(Body::empty())
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
                    .header("authorization", "Bearer any-token")
                    .body(Body::from(big))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    }
}
