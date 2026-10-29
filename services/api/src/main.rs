//! Development-only loopback API. No production auth, persistence or multi-tenant isolation.
use axum::{
    extract::{DefaultBodyLimit, Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sovir_adapters::{
    CompositeDeliveryChannel, DeterministicRiskAnalyzer, InMemoryAuditLog, InMemoryBudgetLedger,
    InMemoryConsentRepository, InMemoryDeletionReceiptStore, InMemoryDeviceRegistry,
    InMemoryEventRepository, InMemoryIdempotencyStore, InMemoryInterventionSink,
    InMemorySessionStore, InMemoryThreatIntel, InMemoryWebhookRegistry, RecordingDeliveryChannel,
    RecordingHttpEgress, SystemClock, WebhookChannel,
};
use sovir_application::{AppError, PrincipalDataExport, PurgeReport, ServicePorts, SovirService};
use sovir_domain::{
    ConsentGrant, Device, DomainError, EventDecision, Intervention, InterventionKind,
    ObservedEvent, Platform, Principal, Session, WebhookEndpoint,
};
use sovir_persistence::PgStore;
use sovir_ports::PortError;
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
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
    /// Dev fixed-window rate limiter keyed by principal+device. In-memory and
    /// per-process only: a real limiter lives at the edge/infra layer.
    limits: std::sync::Arc<Mutex<HashMap<String, (u64, u64)>>>,
    rate_limit_per_min: u64,
    /// Idempotency-Key store (B10). Durable in Postgres when DATABASE_URL is
    /// set (migration 0008), in-memory otherwise. Scoped by tenant+principal.
    idem: std::sync::Arc<dyn sovir_ports::IdempotencyStore>,
    /// Webhook egress allowlist (SSRF guard) for endpoint registration.
    webhook_allowlist: Vec<String>,
}
#[derive(Serialize)]
struct ApiMessage {
    message: &'static str,
}

/// Standard error envelope: {"error":{"code","request_id","retryable"}}.
/// Kept small enough to pass clippy's result_large_err gate.
struct ApiError {
    status: StatusCode,
    code: &'static str,
    request_id: String,
    retryable: bool,
    retry_after: Option<u64>,
}
impl axum::response::IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let mut headers = HeaderMap::new();
        if let Some(secs) = self.retry_after {
            headers.insert("retry-after", secs.into());
        }
        (
            self.status,
            headers,
            Json(serde_json::json!({
                "error": {
                    "code": self.code,
                    "request_id": self.request_id,
                    "retryable": self.retryable,
                }
            })),
        )
            .into_response()
    }
}
fn request_id(headers: &HeaderMap) -> String {
    headers
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("-")
        .to_string()
}
fn api_err(
    status: StatusCode,
    code: &'static str,
    headers: &HeaderMap,
    retryable: bool,
) -> ApiError {
    ApiError {
        status,
        code,
        request_id: request_id(headers),
        retryable,
        retry_after: None,
    }
}
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
const RATE_WINDOW_MS: u64 = 60_000;
fn rate_check(state: &AppState, p: &Principal, headers: &HeaderMap) -> Result<(), ApiError> {
    let key = format!("{}|{}", p.principal_id, p.device_id);
    let now = now_ms();
    let mut guard = state.limits.lock().map_err(|_| ApiError {
        status: StatusCode::INTERNAL_SERVER_ERROR,
        code: "internal_error",
        request_id: request_id(headers),
        retryable: true,
        retry_after: None,
    })?;
    let (count, window_start) = guard.entry(key).or_insert((0, now));
    if now.saturating_sub(*window_start) >= RATE_WINDOW_MS {
        *count = 0;
        *window_start = now;
    }
    *count += 1;
    if *count > state.rate_limit_per_min {
        return Err(ApiError {
            status: StatusCode::TOO_MANY_REQUESTS,
            code: "rate_limited",
            request_id: request_id(headers),
            retryable: true,
            retry_after: Some(RATE_WINDOW_MS / 1000),
        });
    }
    Ok(())
}

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
}
/// Resolves the session bearer token to a Principal. Dev sessions only —
/// never expose this service publicly.
async fn require_principal(headers: &HeaderMap, state: &AppState) -> Result<Principal, ApiError> {
    let token = bearer_token(headers)
        .ok_or_else(|| api_err(StatusCode::UNAUTHORIZED, "unauthorized", headers, false))?;
    state
        .service
        .authenticate(token)
        .await
        .map_err(|e| map_error(e, headers))
}
fn map_error(e: AppError, headers: &HeaderMap) -> ApiError {
    let (status, code, retryable) = match e {
        AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized", false),
        AppError::Forbidden => (StatusCode::FORBIDDEN, "forbidden", false),
        AppError::DeviceRevoked => (StatusCode::FORBIDDEN, "device_revoked", false),
        AppError::Domain(DomainError::ConsentRequired) | AppError::ConsentNotFound => {
            (StatusCode::FORBIDDEN, "consent_required", false)
        }
        AppError::Domain(_) | AppError::InvalidGrant | AppError::InvalidRequest => {
            (StatusCode::BAD_REQUEST, "invalid_request", false)
        }
        AppError::Port(PortError::Duplicate) => (StatusCode::CONFLICT, "duplicate_event", false),
        AppError::Port(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error", true),
        AppError::ProviderUnavailable => (
            StatusCode::SERVICE_UNAVAILABLE,
            "provider_unavailable",
            true,
        ),
        AppError::BudgetExceeded => (StatusCode::TOO_MANY_REQUESTS, "budget_exceeded", false),
    };
    api_err(status, code, headers, retryable)
}
/// Egress selection (ADR-0010): the real HTTP adapter exists only when
/// SOVIR_HTTP_EGRESS=real AND an explicit allowlist is set AND the env is
/// local/test. Everything else records — no network egress by default.
fn pick_egress(allowlist: &[String], sovir_env: &str) -> Arc<dyn sovir_ports::HttpEgress> {
    let wants_real = env::var("SOVIR_HTTP_EGRESS").unwrap_or_default() == "real";
    if wants_real && !allowlist.is_empty() && matches!(sovir_env, "local" | "test") {
        Arc::new(sovir_adapters::ReqwestHttpEgress::new(allowlist.to_vec()))
    } else {
        Arc::new(RecordingHttpEgress::default())
    }
}
/// Durable adapter when `DATABASE_URL` is set (fails closed on connect
/// error); in-memory otherwise.
async fn compose_service(
    database_url: Option<&str>,
    webhook_allowlist: &[String],
    sovir_env: &str,
) -> (SovirService, Option<PgStore>) {
    if let Some(url) = database_url {
        // SOVIR_INFERENCE_BUDGET_USD: per-tenant hard cap in whole USD.
        // Default 0 = no inference spend allowed (ADR-0012).
        let budget_usd = std::env::var("SOVIR_INFERENCE_BUDGET_USD")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(0);
        let pg = PgStore::connect(url)
            .await
            .expect("DATABASE_URL is set but Postgres is unreachable; refusing to start")
            .with_budget_cap(budget_usd.saturating_mul(1_000_000));
        // Durable webhook registry (migration 0007).
        let pg_wh: std::sync::Arc<dyn sovir_ports::WebhookRegistry> =
            std::sync::Arc::new(pg.clone());
        let egress = pick_egress(webhook_allowlist, sovir_env);
        let service = SovirService::new(
            Arc::new(SystemClock),
            ServicePorts {
                grants: Arc::new(pg.clone()),
                events: Arc::new(pg.clone()),
                risk: Arc::new(DeterministicRiskAnalyzer::default()),
                sessions: Arc::new(pg.clone()),
                devices: Arc::new(pg.clone()),
                sink: Arc::new(pg.clone()),
                channel: Arc::new(CompositeDeliveryChannel(vec![
                    Arc::new(RecordingDeliveryChannel::default()),
                    Arc::new(WebhookChannel::new(pg_wh.clone(), egress.clone())),
                ])),
                webhooks: pg_wh,
                receipts: Arc::new(pg.clone()),
                idem: Arc::new(pg.clone()),
                audit: Arc::new(pg.clone()),
                inference: None,
                budget: Arc::new(pg.clone()),
                intel: Arc::new(pg.clone()),
            },
        );
        return (service, Some(pg));
    }
    let registry: std::sync::Arc<dyn sovir_ports::WebhookRegistry> =
        std::sync::Arc::new(InMemoryWebhookRegistry::default());
    let egress = pick_egress(webhook_allowlist, sovir_env);
    (dev_service_with(Some((registry, egress))).0, None)
}
/// Builds the service; when a registry/egress pair is supplied the delivery
/// channel fans out to the recording channel AND signed webhook egress.
fn dev_service_with(
    webhooks: Option<(
        std::sync::Arc<dyn sovir_ports::WebhookRegistry>,
        std::sync::Arc<dyn sovir_ports::HttpEgress>,
    )>,
) -> (
    SovirService,
    Option<std::sync::Arc<dyn sovir_ports::WebhookRegistry>>,
) {
    let registry = webhooks.as_ref().map(|(r, _)| r.clone());
    let channel: Arc<dyn sovir_ports::DeliveryChannel> = match webhooks {
        Some((r, e)) => Arc::new(CompositeDeliveryChannel(vec![
            Arc::new(RecordingDeliveryChannel::default()),
            Arc::new(WebhookChannel::new(r, e)),
        ])),
        None => Arc::new(RecordingDeliveryChannel::default()),
    };
    (
        SovirService::new(
            Arc::new(SystemClock),
            ServicePorts {
                grants: Arc::new(InMemoryConsentRepository::default()),
                events: Arc::new(InMemoryEventRepository::default()),
                risk: Arc::new(DeterministicRiskAnalyzer::default()),
                sessions: Arc::new(InMemorySessionStore::default()),
                devices: Arc::new(InMemoryDeviceRegistry::default()),
                sink: Arc::new(InMemoryInterventionSink::default()),
                channel,
                webhooks: registry.clone().unwrap_or_else(|| {
                    Arc::new(InMemoryWebhookRegistry::default())
                        as std::sync::Arc<dyn sovir_ports::WebhookRegistry>
                }),
                receipts: Arc::new(InMemoryDeletionReceiptStore::default()),
                idem: Arc::new(InMemoryIdempotencyStore::default()),
                audit: Arc::new(InMemoryAuditLog::default()),
                inference: None,
                budget: Arc::new(InMemoryBudgetLedger::default()),
                intel: Arc::new(InMemoryThreatIntel::default()),
            },
        ),
        registry,
    )
}
async fn live() -> Json<ApiMessage> {
    Json(ApiMessage { message: "alive" })
}
// Readiness: in-memory means constructed == ready; with the Postgres adapter
// it is a real pool probe (SELECT 1).
async fn ready(State(s): State<AppState>) -> Result<Json<ApiMessage>, ApiError> {
    match &s.pg {
        Some(pg) if !pg.healthy().await => Err(ApiError {
            status: StatusCode::SERVICE_UNAVAILABLE,
            code: "not_ready",
            request_id: "-".to_string(),
            retryable: true,
            retry_after: None,
        }),
        _ => Ok(Json(ApiMessage { message: "ready" })),
    }
}

#[derive(Deserialize)]
struct DevSessionRequest {
    principal_id: String,
    #[serde(default)]
    device_id: Option<String>,
    /// Dev-only tenant label (B19). Self-declared; never proof of
    /// authorization — it exists so tenant isolation is exercisable.
    #[serde(default = "default_tenant")]
    tenant_id: String,
}
fn default_tenant() -> String {
    "dev".to_string()
}
async fn dev_session(
    State(s): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<DevSessionRequest>,
) -> Result<(StatusCode, Json<Session>), ApiError> {
    if !s.dev_session_enabled {
        return Err(api_err(
            StatusCode::FORBIDDEN,
            "dev_sessions_disabled",
            &headers,
            false,
        ));
    }
    let device_id = body.device_id.unwrap_or_else(|| "dev-device".to_string());
    let session = s
        .service
        .issue_dev_session(&body.principal_id, &device_id, &body.tenant_id)
        .await
        .map_err(|e| map_error(e, &headers))?;
    Ok((StatusCode::CREATED, Json(session)))
}
async fn logout(State(s): State<AppState>, headers: HeaderMap) -> Result<StatusCode, ApiError> {
    let token = bearer_token(&headers)
        .ok_or_else(|| api_err(StatusCode::UNAUTHORIZED, "unauthorized", &headers, false))?;
    match s
        .service
        .logout(token)
        .await
        .map_err(|e| map_error(e, &headers))?
    {
        true => Ok(StatusCode::NO_CONTENT),
        false => Err(api_err(StatusCode::NOT_FOUND, "not_found", &headers, false)),
    }
}
async fn whoami(
    State(s): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Principal>, ApiError> {
    Ok(Json(require_principal(&headers, &s).await?))
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
    let p = require_principal(&headers, &s).await?;
    let device = s
        .service
        .register_device(&p, body.device_id.as_deref(), body.platform, &body.label)
        .await
        .map_err(|e| map_error(e, &headers))?;
    Ok((StatusCode::CREATED, Json(device)))
}
async fn list_devices(
    State(s): State<AppState>,
    headers: HeaderMap,
    axum::extract::Query(q): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Vec<Device>>, ApiError> {
    let p = require_principal(&headers, &s).await?;
    let mut items = s
        .service
        .list_devices(&p)
        .await
        .map_err(|e| map_error(e, &headers))?;
    items.truncate(list_limit(&q));
    Ok(Json(items))
}
async fn revoke_device(
    State(s): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let p = require_principal(&headers, &s).await?;
    match s
        .service
        .revoke_device(&p, &id)
        .await
        .map_err(|e| map_error(e, &headers))?
    {
        true => Ok(StatusCode::NO_CONTENT),
        false => Err(api_err(StatusCode::NOT_FOUND, "not_found", &headers, false)),
    }
}

async fn grant(
    State(s): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ConsentGrant>,
) -> Result<StatusCode, ApiError> {
    let p = require_principal(&headers, &s).await?;
    rate_check(&s, &p, &headers)?;
    s.service
        .grant(&p, body)
        .await
        .map_err(|e| map_error(e, &headers))?;
    Ok(StatusCode::CREATED)
}
async fn revoke(
    State(s): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let p = require_principal(&headers, &s).await?;
    match s
        .service
        .revoke(&p, &id)
        .await
        .map_err(|e| map_error(e, &headers))?
    {
        true => Ok(StatusCode::NO_CONTENT),
        false => Err(api_err(StatusCode::NOT_FOUND, "not_found", &headers, false)),
    }
}
async fn ingest(
    State(s): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ObservedEvent>,
) -> Result<(StatusCode, Json<EventDecision>), ApiError> {
    let p = require_principal(&headers, &s).await?;
    rate_check(&s, &p, &headers)?;
    // Idempotency-Key is mandatory for event ingestion (B10). Replay of the
    // same key+body returns the stored response; same key with a different
    // body conflicts.
    let key = headers
        .get("idempotency-key")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string)
        .ok_or_else(|| {
            api_err(
                StatusCode::BAD_REQUEST,
                "idempotency_key_required",
                &headers,
                false,
            )
        })?;
    let mut h = DefaultHasher::new();
    serde_json::to_string(&body)
        .unwrap_or_default()
        .hash(&mut h);
    let body_hash = h.finish() as i64;
    if let Some(stored) = s
        .idem
        .get(&p.tenant_id, &p.principal_id, &key)
        .await
        .map_err(|e| map_error(AppError::Port(e), &headers))?
    {
        if stored.body_hash == body_hash {
            let decision: EventDecision =
                serde_json::from_value(stored.response_json).map_err(|_| ApiError {
                    status: StatusCode::INTERNAL_SERVER_ERROR,
                    code: "internal_error",
                    request_id: request_id(&headers),
                    retryable: true,
                    retry_after: None,
                })?;
            return Ok((StatusCode::CREATED, Json(decision)));
        }
        return Err(api_err(
            StatusCode::CONFLICT,
            "idempotency_conflict",
            &headers,
            false,
        ));
    }
    let decision = s
        .service
        .ingest(&p, body)
        .await
        .map_err(|e| map_error(e, &headers))?;
    if let Ok(v) = serde_json::to_value(&decision) {
        let _ = s
            .idem
            .put(sovir_domain::IdempotentResponse {
                tenant_id: p.tenant_id.clone(),
                principal_id: p.principal_id.clone(),
                idem_key: key,
                body_hash,
                response_json: v,
                created_at_ms: now_ms(),
            })
            .await;
    }
    Ok((StatusCode::CREATED, Json(decision)))
}
/// Pagination: `?limit=N` (default 100, hard cap 500) truncates list
/// responses. Dev-scale pagination — no cursor yet.
const LIST_LIMIT_DEFAULT: usize = 100;
const LIST_LIMIT_MAX: usize = 500;
fn list_limit(q: &std::collections::HashMap<String, String>) -> usize {
    q.get("limit")
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(LIST_LIMIT_DEFAULT)
        .min(LIST_LIMIT_MAX)
}
async fn list_audit(
    State(s): State<AppState>,
    headers: HeaderMap,
    axum::extract::Query(q): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Vec<sovir_domain::AuditEvent>>, ApiError> {
    let p = require_principal(&headers, &s).await?;
    let mut items = s
        .service
        .list_audit(&p)
        .await
        .map_err(|e| map_error(e, &headers))?;
    items.truncate(list_limit(&q));
    Ok(Json(items))
}
async fn list_interventions(
    State(s): State<AppState>,
    headers: HeaderMap,
    axum::extract::Query(q): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Vec<Intervention>>, ApiError> {
    let p = require_principal(&headers, &s).await?;
    let mut items = s
        .service
        .list_interventions(&p)
        .await
        .map_err(|e| map_error(e, &headers))?;
    items.truncate(list_limit(&q));
    Ok(Json(items))
}
#[derive(Serialize)]
struct DispatchResult {
    delivered: u64,
}
async fn dispatch(
    State(s): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<DispatchResult>, ApiError> {
    let p = require_principal(&headers, &s).await?;
    let delivered = s
        .service
        .dispatch_due(&p)
        .await
        .map_err(|e| map_error(e, &headers))?;
    Ok(Json(DispatchResult { delivered }))
}

#[derive(Deserialize)]
struct RegisterWebhookRequest {
    url: String,
    kinds: Vec<InterventionKind>,
}
async fn register_webhook(
    State(s): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<RegisterWebhookRequest>,
) -> Result<(StatusCode, Json<WebhookEndpoint>), ApiError> {
    let p = require_principal(&headers, &s).await?;
    let ep = s
        .service
        .register_webhook(&p, &body.url, body.kinds, &s.webhook_allowlist)
        .await
        .map_err(|e| map_error(e, &headers))?;
    Ok((StatusCode::CREATED, Json(ep)))
}
async fn list_webhooks(
    State(s): State<AppState>,
    headers: HeaderMap,
    axum::extract::Query(q): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Vec<WebhookEndpoint>>, ApiError> {
    let p = require_principal(&headers, &s).await?;
    let mut items = s
        .service
        .list_webhooks(&p)
        .await
        .map_err(|e| map_error(e, &headers))?;
    items.truncate(list_limit(&q));
    Ok(Json(items))
}
async fn revoke_webhook(
    State(s): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let p = require_principal(&headers, &s).await?;
    match s
        .service
        .revoke_webhook(&p, &id)
        .await
        .map_err(|e| map_error(e, &headers))?
    {
        true => Ok(StatusCode::NO_CONTENT),
        false => Err(api_err(StatusCode::NOT_FOUND, "not_found", &headers, false)),
    }
}
async fn export_data(
    State(s): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<PrincipalDataExport>, ApiError> {
    let p = require_principal(&headers, &s).await?;
    Ok(Json(
        s.service
            .export_data(&p)
            .await
            .map_err(|e| map_error(e, &headers))?,
    ))
}
async fn purge_data(
    State(s): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<PurgeReport>, ApiError> {
    let p = require_principal(&headers, &s).await?;
    Ok(Json(
        s.service
            .purge_data(&p)
            .await
            .map_err(|e| map_error(e, &headers))?,
    ))
}
/// B16 retention: caller-scoped deletion of events and terminal interventions
/// older than SOVIR_RETENTION_MS (default 30 days). A scheduled global sweep
/// remains an infrastructure decision — this is the executable per-principal
/// half of the policy.
async fn enforce_retention(
    State(s): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<sovir_application::RetentionReport>, ApiError> {
    let p = require_principal(&headers, &s).await?;
    let retention_ms = std::env::var("SOVIR_RETENTION_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(30 * 24 * 60 * 60 * 1000);
    Ok(Json(
        s.service
            .enforce_retention(&p, retention_ms)
            .await
            .map_err(|e| map_error(e, &headers))?,
    ))
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
        .route("/v1/me/data", get(export_data).delete(purge_data))
        .route("/v1/me/audit", get(list_audit))
        .route("/v1/me/retention", post(enforce_retention))
        .route("/v1/webhooks", post(register_webhook).get(list_webhooks))
        .route("/v1/webhooks/{id}/revoke", post(revoke_webhook))
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
    let webhook_allowlist: Vec<String> = env::var("SOVIR_WEBHOOK_ALLOWLIST")
        .unwrap_or_else(|_| "127.0.0.1,localhost".into())
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let (service, pg) =
        compose_service(database_url.as_deref(), &webhook_allowlist, &sovir_env).await;
    let rate_limit_per_min = env::var("SOVIR_RATE_LIMIT_PER_MIN")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(60);
    // Scheduled global retention sweep (B16 infra path). Runs
    // enforce_retention_global every SOVIR_RETENTION_SWEEP_MS; 0/unset
    // disables it. The per-principal endpoint stays caller-owned.
    let sweep_ms: u64 = env::var("SOVIR_RETENTION_SWEEP_MS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    if sweep_ms > 0 {
        let retention_ms: u64 = env::var("SOVIR_RETENTION_MS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(30 * 24 * 60 * 60 * 1_000);
        let svc = service.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(std::time::Duration::from_millis(sweep_ms));
            loop {
                tick.tick().await;
                match svc.enforce_retention_global(retention_ms).await {
                    Ok(r) => tracing::info!(
                        cutoff_ms = r.cutoff_ms,
                        events_deleted = r.events_deleted,
                        terminal_interventions_deleted = r.terminal_interventions_deleted,
                        "retention sweep"
                    ),
                    Err(e) => tracing::warn!(error = %e, "retention sweep failed"),
                }
            }
        });
    }
    // Scheduled global dispatcher (B15 infra path): delivers due
    // interventions every SOVIR_DISPATCH_SWEEP_MS; 0/unset disables it.
    // Manual dispatch stays available at POST /v1/interventions/dispatch.
    let dispatch_sweep_ms: u64 = env::var("SOVIR_DISPATCH_SWEEP_MS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    if dispatch_sweep_ms > 0 {
        let svc = service.clone();
        tokio::spawn(async move {
            let mut tick =
                tokio::time::interval(std::time::Duration::from_millis(dispatch_sweep_ms));
            loop {
                tick.tick().await;
                match svc.dispatch_due_global().await {
                    Ok(n) if n > 0 => tracing::info!(delivered = n, "dispatch sweep"),
                    Ok(_) => {}
                    Err(e) => tracing::warn!(error = %e, "dispatch sweep failed"),
                }
            }
        });
    }
    let idem_store: std::sync::Arc<dyn sovir_ports::IdempotencyStore> = pg
        .as_ref()
        .map(|p| {
            std::sync::Arc::new(p.clone()) as std::sync::Arc<dyn sovir_ports::IdempotencyStore>
        })
        .unwrap_or_else(|| {
            std::sync::Arc::new(InMemoryIdempotencyStore::default())
                as std::sync::Arc<dyn sovir_ports::IdempotencyStore>
        });
    let state = AppState {
        service,
        dev_session_enabled,
        pg,
        limits: std::sync::Arc::new(Mutex::new(HashMap::new())),
        rate_limit_per_min,
        idem: idem_store,
        webhook_allowlist,
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
        let registry: std::sync::Arc<dyn sovir_ports::WebhookRegistry> =
            std::sync::Arc::new(InMemoryWebhookRegistry::default());
        let egress: std::sync::Arc<dyn sovir_ports::HttpEgress> =
            std::sync::Arc::new(RecordingHttpEgress::default());
        AppState {
            service: dev_service_with(Some((registry, egress))).0,
            dev_session_enabled: true,
            pg: None,
            limits: std::sync::Arc::new(Mutex::new(HashMap::new())),
            rate_limit_per_min: 60,
            idem: std::sync::Arc::new(InMemoryIdempotencyStore::default()),
            webhook_allowlist: vec!["127.0.0.1".to_string(), "localhost".to_string()],
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

    fn valid_event() -> serde_json::Value {
        serde_json::json!({
            "event_id": format!("e-{}", uuid::Uuid::new_v4()),
            "source_id": "browser.synthetic",
            "observed_at_ms": now_ms(),
            "modality": "URL",
            "content_digest": "sha256:test",
            "consent_grant_id": "g-1",
            "sensitive_data_class": "PUBLIC"
        })
    }
    async fn grant_consent(app: &mut Router, token: &str) {
        let body = serde_json::json!({
            "grant_id": "g-1", "source_id": "browser.synthetic",
            "expires_at_ms": now_ms() + 3_600_000
        });
        let r = app
            .call(
                Request::builder()
                    .method("POST")
                    .uri("/v1/consents")
                    .header("content-type", "application/json")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::from(serde_json::to_vec(&body).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(r.status(), StatusCode::CREATED);
    }
    async fn post_event(
        app: &mut Router,
        token: &str,
        idem: Option<&str>,
        event: &serde_json::Value,
    ) -> axum::response::Response {
        let mut b = Request::builder()
            .method("POST")
            .uri("/v1/events")
            .header("content-type", "application/json")
            .header("authorization", format!("Bearer {token}"));
        if let Some(k) = idem {
            b = b.header("idempotency-key", k);
        }
        app.call(
            b.body(Body::from(serde_json::to_vec(event).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap()
    }

    #[tokio::test]
    async fn events_require_idempotency_key() {
        let mut app = build_router(test_state());
        let token = session_token(&mut app, "user-1").await;
        grant_consent(&mut app, &token).await;
        let r = post_event(&mut app, &token, None, &valid_event()).await;
        assert_eq!(r.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn idempotent_replay_returns_stored_response() {
        let mut app = build_router(test_state());
        let token = session_token(&mut app, "user-1").await;
        grant_consent(&mut app, &token).await;
        let event = valid_event();
        let r1 = post_event(&mut app, &token, Some("k-1"), &event).await;
        assert_eq!(r1.status(), StatusCode::CREATED);
        // Same key + same body replays the stored response (even though the
        // event_id would otherwise dedup-conflict).
        let r2 = post_event(&mut app, &token, Some("k-1"), &event).await;
        assert_eq!(r2.status(), StatusCode::CREATED);
        // Same key + different body conflicts.
        let mut other = event.clone();
        other["event_id"] = serde_json::json!("e-different");
        let r3 = post_event(&mut app, &token, Some("k-1"), &other).await;
        assert_eq!(r3.status(), StatusCode::CONFLICT);
    }

    #[tokio::test]
    async fn rate_limit_returns_429_with_retry_after() {
        let mut state = test_state();
        // grant consumes one request from the same principal window.
        state.rate_limit_per_min = 3;
        let mut app = build_router(state);
        let token = session_token(&mut app, "user-1").await;
        grant_consent(&mut app, &token).await;
        for i in 0..2 {
            let mut e = valid_event();
            e["event_id"] = serde_json::json!(format!("e-{i}"));
            let r = post_event(&mut app, &token, Some(&format!("k-{i}")), &e).await;
            assert_eq!(r.status(), StatusCode::CREATED);
        }
        let mut e = valid_event();
        e["event_id"] = serde_json::json!("e-overflow");
        let r = post_event(&mut app, &token, Some("k-overflow"), &e).await;
        assert_eq!(r.status(), StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(r.headers().get("retry-after").unwrap(), "60");
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
