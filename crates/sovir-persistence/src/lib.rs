//! PostgreSQL adapter implementing the hexagonal ports. Development-grade:
//! schema in `infra/postgres/migrations`, RLS default-deny stands, and there is
//! no tenant isolation or encryption at rest yet (see B21_PLATFORM_STATUS).
//!
//! Sync-over-async note: the ports are synchronous traits while sqlx is async.
//! `block` uses `block_in_place` + `Handle::block_on`, which is only valid on a
//! multi-thread Tokio runtime. Async ports are deferred to a future ADR; the
//! in-memory adapters remain the default when `DATABASE_URL` is unset.
use sovir_domain::{
    ConsentGrant, DeliveryState, Device, Intervention, InterventionKind, Modality, ObservedEvent,
    Platform, RiskSignal, Scope, SensitiveDataClass, Session,
};
use sovir_ports::{
    ConsentRepository, DeviceRegistry, EventRepository, InterventionSink, PortError, SessionStore,
};
use sqlx::{postgres::PgPoolOptions, PgPool};
use std::future::Future;
use std::time::Duration;

/// Run an async future from a sync port implementation. Requires a
/// multi-thread runtime (tokio `full` enables `rt-multi-thread`).
fn block<F: Future>(fut: F) -> F::Output {
    tokio::task::block_in_place(|| tokio::runtime::Handle::current().block_on(fut))
}

fn map_storage(e: sqlx::Error) -> PortError {
    match e {
        sqlx::Error::Database(db) if db.is_unique_violation() => PortError::Duplicate,
        _ => PortError::Storage,
    }
}

#[derive(Clone)]
pub struct PgStore {
    pool: PgPool,
}
impl PgStore {
    pub async fn connect(database_url: &str) -> Result<Self, sqlx::Error> {
        let pool = PgPoolOptions::new()
            .max_connections(4)
            .acquire_timeout(Duration::from_secs(5))
            .connect(database_url)
            .await?;
        Ok(Self { pool })
    }
    /// Readiness probe: a real ping for the durable adapter.
    pub async fn healthy(&self) -> bool {
        sqlx::query("SELECT 1").execute(&self.pool).await.is_ok()
    }
}

impl ConsentRepository for PgStore {
    fn get(&self, grant_id: &str) -> Result<Option<ConsentGrant>, PortError> {
        block(async {
            sqlx::query_as::<_, (String, String, String, i64, bool)>(
                "SELECT principal_id, device_id, source_id, expires_at_ms, revoked
                 FROM consent_grants WHERE grant_id = $1",
            )
            .bind(grant_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_storage)?
            .map(
                |(principal_id, device_id, source_id, expires_at_ms, revoked)| {
                    Ok(ConsentGrant {
                        grant_id: grant_id.to_string(),
                        source_id,
                        expires_at_ms: expires_at_ms as u64,
                        revoked,
                        principal_id,
                        device_id,
                    })
                },
            )
            .transpose()
        })
    }
    fn put(&self, grant: ConsentGrant) -> Result<(), PortError> {
        block(async {
            sqlx::query(
                "INSERT INTO consent_grants
                 (grant_id, principal_id, device_id, source_id, expires_at_ms, revoked)
                 VALUES ($1,$2,$3,$4,$5,$6)",
            )
            .bind(&grant.grant_id)
            .bind(&grant.principal_id)
            .bind(&grant.device_id)
            .bind(&grant.source_id)
            .bind(grant.expires_at_ms as i64)
            .bind(grant.revoked)
            .execute(&self.pool)
            .await
            .map_err(map_storage)?;
            Ok(())
        })
    }
    fn revoke(&self, grant_id: &str) -> Result<bool, PortError> {
        block(async {
            let n = sqlx::query("UPDATE consent_grants SET revoked = TRUE WHERE grant_id = $1")
                .bind(grant_id)
                .execute(&self.pool)
                .await
                .map_err(map_storage)?
                .rows_affected();
            Ok(n > 0)
        })
    }
    fn revoke_by_device(&self, device_id: &str) -> Result<u64, PortError> {
        block(async {
            let n = sqlx::query(
                "UPDATE consent_grants SET revoked = TRUE WHERE device_id = $1 AND NOT revoked",
            )
            .bind(device_id)
            .execute(&self.pool)
            .await
            .map_err(map_storage)?
            .rows_affected();
            Ok(n)
        })
    }
    fn list_by_principal(&self, principal_id: &str) -> Result<Vec<ConsentGrant>, PortError> {
        block(async {
            let rows = sqlx::query_as::<_, (String, String, String, i64, bool)>(
                "SELECT grant_id, device_id, source_id, expires_at_ms, revoked
                 FROM consent_grants WHERE principal_id = $1 ORDER BY grant_id",
            )
            .bind(principal_id)
            .fetch_all(&self.pool)
            .await
            .map_err(map_storage)?;
            Ok(rows
                .into_iter()
                .map(
                    |(grant_id, device_id, source_id, expires_at_ms, revoked)| ConsentGrant {
                        grant_id,
                        source_id,
                        expires_at_ms: expires_at_ms as u64,
                        revoked,
                        principal_id: principal_id.to_string(),
                        device_id,
                    },
                )
                .collect())
        })
    }
    fn delete_by_principal(&self, principal_id: &str) -> Result<u64, PortError> {
        block(async {
            let n = sqlx::query("DELETE FROM consent_grants WHERE principal_id = $1")
                .bind(principal_id)
                .execute(&self.pool)
                .await
                .map_err(map_storage)?
                .rows_affected();
            Ok(n)
        })
    }
}

fn modality_str(m: Modality) -> &'static str {
    match m {
        Modality::Text => "TEXT",
        Modality::UiTree => "UI_TREE",
        Modality::ImageRegion => "IMAGE_REGION",
        Modality::Url => "URL",
        Modality::Notification => "NOTIFICATION",
    }
}
fn class_str(c: SensitiveDataClass) -> &'static str {
    match c {
        SensitiveDataClass::Public => "PUBLIC",
        SensitiveDataClass::Personal => "PERSONAL",
        SensitiveDataClass::Sensitive => "SENSITIVE",
        SensitiveDataClass::Secret => "SECRET",
    }
}
fn signal_str(s: RiskSignal) -> &'static str {
    match s {
        RiskSignal::CredentialRequest => "CREDENTIAL_REQUEST",
        RiskSignal::PaymentRequest => "PAYMENT_REQUEST",
        RiskSignal::UrgentAction => "URGENT_ACTION",
        RiskSignal::IdentityUnverified => "IDENTITY_UNVERIFIED",
        RiskSignal::TrackingObserved => "TRACKING_OBSERVED",
        RiskSignal::HiddenFeePattern => "HIDDEN_FEE_PATTERN",
        RiskSignal::ConsentDarkPattern => "CONSENT_DARK_PATTERN",
        RiskSignal::UserDefinedExposureLimit => "USER_DEFINED_EXPOSURE_LIMIT",
    }
}
fn scope_str(s: Scope) -> &'static str {
    match s {
        Scope::ConsentWrite => "consent_write",
        Scope::EventsWrite => "events_write",
        Scope::DevicesWrite => "devices_write",
        Scope::SessionsWrite => "sessions_write",
    }
}
fn scope_from(s: &str) -> Option<Scope> {
    match s {
        "consent_write" => Some(Scope::ConsentWrite),
        "events_write" => Some(Scope::EventsWrite),
        "devices_write" => Some(Scope::DevicesWrite),
        "sessions_write" => Some(Scope::SessionsWrite),
        _ => None,
    }
}
fn platform_str(p: Platform) -> &'static str {
    match p {
        Platform::Android => "ANDROID",
        Platform::Ios => "IOS",
        Platform::Windows => "WINDOWS",
        Platform::Macos => "MACOS",
        Platform::Linux => "LINUX",
        Platform::BrowserExtension => "BROWSER_EXTENSION",
    }
}
fn platform_from(s: &str) -> Platform {
    match s {
        "ANDROID" => Platform::Android,
        "IOS" => Platform::Ios,
        "MACOS" => Platform::Macos,
        "LINUX" => Platform::Linux,
        "BROWSER_EXTENSION" => Platform::BrowserExtension,
        _ => Platform::Windows,
    }
}
fn modality_from(s: &str) -> Modality {
    match s {
        "TEXT" => Modality::Text,
        "UI_TREE" => Modality::UiTree,
        "IMAGE_REGION" => Modality::ImageRegion,
        "NOTIFICATION" => Modality::Notification,
        _ => Modality::Url,
    }
}
fn class_from(s: &str) -> SensitiveDataClass {
    match s {
        "PERSONAL" => SensitiveDataClass::Personal,
        "SENSITIVE" => SensitiveDataClass::Sensitive,
        "SECRET" => SensitiveDataClass::Secret,
        _ => SensitiveDataClass::Public,
    }
}
fn signal_from(s: &str) -> Option<RiskSignal> {
    match s {
        "CREDENTIAL_REQUEST" => Some(RiskSignal::CredentialRequest),
        "PAYMENT_REQUEST" => Some(RiskSignal::PaymentRequest),
        "URGENT_ACTION" => Some(RiskSignal::UrgentAction),
        "IDENTITY_UNVERIFIED" => Some(RiskSignal::IdentityUnverified),
        "TRACKING_OBSERVED" => Some(RiskSignal::TrackingObserved),
        "HIDDEN_FEE_PATTERN" => Some(RiskSignal::HiddenFeePattern),
        "CONSENT_DARK_PATTERN" => Some(RiskSignal::ConsentDarkPattern),
        "USER_DEFINED_EXPOSURE_LIMIT" => Some(RiskSignal::UserDefinedExposureLimit),
        _ => None,
    }
}
fn kind_str(k: InterventionKind) -> &'static str {
    match k {
        InterventionKind::Notify => "notify",
        InterventionKind::WarnBanner => "warn_banner",
        InterventionKind::RequireReview => "require_review",
    }
}
fn kind_from(s: &str) -> InterventionKind {
    match s {
        "warn_banner" => InterventionKind::WarnBanner,
        "require_review" => InterventionKind::RequireReview,
        _ => InterventionKind::Notify,
    }
}
fn state_str(s: DeliveryState) -> &'static str {
    match s {
        DeliveryState::Pending => "pending",
        DeliveryState::Delivered => "delivered",
        DeliveryState::Failed => "failed",
        DeliveryState::Expired => "expired",
    }
}
fn state_from(s: &str) -> DeliveryState {
    match s {
        "delivered" => DeliveryState::Delivered,
        "failed" => DeliveryState::Failed,
        "expired" => DeliveryState::Expired,
        _ => DeliveryState::Pending,
    }
}

impl EventRepository for PgStore {
    fn insert_once(&self, event: ObservedEvent) -> Result<(), PortError> {
        block(async {
            let signals: Vec<&str> = event.signals.iter().map(|s| signal_str(*s)).collect();
            let res = sqlx::query(
                "INSERT INTO observation_events
                 (event_id, principal_id, device_id, source_id, consent_grant_id,
                  observed_at_ms, modality, sensitive_data_class, content_digest, signals)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                 ON CONFLICT (event_id) DO NOTHING",
            )
            .bind(&event.event_id)
            .bind(&event.principal_id)
            .bind(&event.device_id)
            .bind(&event.source_id)
            .bind(&event.consent_grant_id)
            .bind(event.observed_at_ms as i64)
            .bind(modality_str(event.modality))
            .bind(class_str(event.sensitive_data_class))
            .bind(&event.content_digest)
            .bind(&signals)
            .execute(&self.pool)
            .await
            .map_err(map_storage)?;
            if res.rows_affected() == 0 {
                Err(PortError::Duplicate)
            } else {
                Ok(())
            }
        })
    }
    fn list_by_principal(&self, principal_id: &str) -> Result<Vec<ObservedEvent>, PortError> {
        block(async {
            let rows = sqlx::query_as::<
                _,
                (
                    String,
                    String,
                    String,
                    String,
                    i64,
                    String,
                    String,
                    String,
                    Vec<String>,
                ),
            >(
                "SELECT event_id, device_id, source_id, consent_grant_id, observed_at_ms,
                        modality, sensitive_data_class, content_digest, signals
                 FROM observation_events WHERE principal_id = $1 ORDER BY observed_at_ms",
            )
            .bind(principal_id)
            .fetch_all(&self.pool)
            .await
            .map_err(map_storage)?;
            Ok(rows
                .into_iter()
                .map(
                    |(
                        event_id,
                        device_id,
                        source_id,
                        consent_grant_id,
                        observed_at_ms,
                        modality,
                        data_class,
                        content_digest,
                        signals,
                    )| {
                        ObservedEvent {
                            event_id,
                            source_id,
                            observed_at_ms: observed_at_ms as u64,
                            modality: modality_from(&modality),
                            content_digest,
                            consent_grant_id,
                            sensitive_data_class: class_from(&data_class),
                            payload_ref: None,
                            signals: signals.iter().filter_map(|s| signal_from(s)).collect(),
                            principal_id: principal_id.to_string(),
                            device_id,
                        }
                    },
                )
                .collect())
        })
    }
    fn delete_by_principal(&self, principal_id: &str) -> Result<u64, PortError> {
        block(async {
            let n = sqlx::query("DELETE FROM observation_events WHERE principal_id = $1")
                .bind(principal_id)
                .execute(&self.pool)
                .await
                .map_err(map_storage)?
                .rows_affected();
            Ok(n)
        })
    }
}

impl SessionStore for PgStore {
    fn issue(&self, session: Session) -> Result<(), PortError> {
        block(async {
            let scopes: Vec<&str> = session.scopes.iter().map(|s| scope_str(*s)).collect();
            sqlx::query(
                "INSERT INTO sessions
                 (token, session_id, principal_id, tenant_id, device_id, scopes, expires_at_ms, revoked)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
            )
            .bind(&session.token)
            .bind(&session.session_id)
            .bind(&session.principal_id)
            .bind(&session.tenant_id)
            .bind(&session.device_id)
            .bind(&scopes)
            .bind(session.expires_at_ms as i64)
            .bind(session.revoked)
            .execute(&self.pool)
            .await
            .map_err(map_storage)?;
            Ok(())
        })
    }
    fn resolve(&self, token: &str) -> Result<Option<Session>, PortError> {
        block(async {
            sqlx::query_as::<
                _,
                (String, String, String, String, Vec<String>, i64, bool),
            >(
                "SELECT session_id, principal_id, tenant_id, device_id, scopes, expires_at_ms, revoked
                 FROM sessions WHERE token = $1",
            )
            .bind(token)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_storage)?
            .map(
                |(session_id, principal_id, tenant_id, device_id, scopes, expires_at_ms, revoked)| {
                    Session {
                        token: token.to_string(),
                        session_id,
                        principal_id,
                        tenant_id,
                        device_id,
                        scopes: scopes.iter().filter_map(|s| scope_from(s)).collect(),
                        expires_at_ms: expires_at_ms as u64,
                        revoked,
                    }
                },
            )
            .map_or(Ok(None), |s| Ok(Some(s)))
        })
    }
    fn revoke(&self, token: &str) -> Result<bool, PortError> {
        block(async {
            let n = sqlx::query("UPDATE sessions SET revoked = TRUE WHERE token = $1")
                .bind(token)
                .execute(&self.pool)
                .await
                .map_err(map_storage)?
                .rows_affected();
            Ok(n > 0)
        })
    }
    fn revoke_by_device(&self, device_id: &str) -> Result<u64, PortError> {
        block(async {
            let n = sqlx::query(
                "UPDATE sessions SET revoked = TRUE WHERE device_id = $1 AND NOT revoked",
            )
            .bind(device_id)
            .execute(&self.pool)
            .await
            .map_err(map_storage)?
            .rows_affected();
            Ok(n)
        })
    }
    fn revoke_by_principal(&self, principal_id: &str) -> Result<u64, PortError> {
        block(async {
            let n = sqlx::query(
                "UPDATE sessions SET revoked = TRUE WHERE principal_id = $1 AND NOT revoked",
            )
            .bind(principal_id)
            .execute(&self.pool)
            .await
            .map_err(map_storage)?
            .rows_affected();
            Ok(n)
        })
    }
}

impl DeviceRegistry for PgStore {
    fn register(&self, device: Device) -> Result<(), PortError> {
        block(async {
            sqlx::query(
                "INSERT INTO devices
                 (principal_id, device_id, platform, label, registered_at_ms, last_seen_at_ms, revoked_at_ms)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)",
            )
            .bind(&device.principal_id)
            .bind(&device.device_id)
            .bind(platform_str(device.platform))
            .bind(&device.label)
            .bind(device.registered_at_ms as i64)
            .bind(device.last_seen_at_ms.map(|v| v as i64))
            .bind(device.revoked_at_ms.map(|v| v as i64))
            .execute(&self.pool)
            .await
            .map_err(map_storage)?;
            Ok(())
        })
    }
    fn get(&self, principal_id: &str, device_id: &str) -> Result<Option<Device>, PortError> {
        block(async {
            sqlx::query_as::<_, (String, String, i64, Option<i64>, Option<i64>)>(
                "SELECT platform, label, registered_at_ms, last_seen_at_ms, revoked_at_ms
                 FROM devices WHERE principal_id = $1 AND device_id = $2",
            )
            .bind(principal_id)
            .bind(device_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_storage)?
            .map(
                |(platform, label, registered_at_ms, last_seen_at_ms, revoked_at_ms)| Device {
                    device_id: device_id.to_string(),
                    principal_id: principal_id.to_string(),
                    platform: platform_from(&platform),
                    label,
                    registered_at_ms: registered_at_ms as u64,
                    last_seen_at_ms: last_seen_at_ms.map(|v| v as u64),
                    revoked_at_ms: revoked_at_ms.map(|v| v as u64),
                },
            )
            .map_or(Ok(None), |d| Ok(Some(d)))
        })
    }
    fn list(&self, principal_id: &str) -> Result<Vec<Device>, PortError> {
        block(async {
            let rows = sqlx::query_as::<
                _,
                (String, String, String, i64, Option<i64>, Option<i64>),
            >(
                "SELECT device_id, platform, label, registered_at_ms, last_seen_at_ms, revoked_at_ms
                 FROM devices WHERE principal_id = $1 ORDER BY device_id",
            )
            .bind(principal_id)
            .fetch_all(&self.pool)
            .await
            .map_err(map_storage)?;
            Ok(rows
                .into_iter()
                .map(
                    |(
                        device_id,
                        platform,
                        label,
                        registered_at_ms,
                        last_seen_at_ms,
                        revoked_at_ms,
                    )| {
                        Device {
                            device_id,
                            principal_id: principal_id.to_string(),
                            platform: platform_from(&platform),
                            label,
                            registered_at_ms: registered_at_ms as u64,
                            last_seen_at_ms: last_seen_at_ms.map(|v| v as u64),
                            revoked_at_ms: revoked_at_ms.map(|v| v as u64),
                        }
                    },
                )
                .collect())
        })
    }
    fn touch_seen(
        &self,
        principal_id: &str,
        device_id: &str,
        now_ms: u64,
    ) -> Result<(), PortError> {
        block(async {
            sqlx::query(
                "UPDATE devices SET last_seen_at_ms = $3
                 WHERE principal_id = $1 AND device_id = $2",
            )
            .bind(principal_id)
            .bind(device_id)
            .bind(now_ms as i64)
            .execute(&self.pool)
            .await
            .map_err(map_storage)?;
            Ok(())
        })
    }
    fn revoke(&self, principal_id: &str, device_id: &str, now_ms: u64) -> Result<bool, PortError> {
        block(async {
            let n = sqlx::query(
                "UPDATE devices SET revoked_at_ms = $3
                 WHERE principal_id = $1 AND device_id = $2",
            )
            .bind(principal_id)
            .bind(device_id)
            .bind(now_ms as i64)
            .execute(&self.pool)
            .await
            .map_err(map_storage)?
            .rows_affected();
            Ok(n > 0)
        })
    }
}

type InterventionRow = (
    String,
    String,
    String,
    String,
    String,
    String,
    i32,
    i64,
    i64,
    Option<String>,
    serde_json::Value,
);

fn row_to_intervention(r: InterventionRow) -> Result<Intervention, PortError> {
    let (id, event_id, principal_id, device_id, kind, state, attempts, created, next, err, audit) =
        r;
    Ok(Intervention {
        intervention_id: id,
        event_id,
        principal_id,
        device_id,
        kind: kind_from(&kind),
        state: state_from(&state),
        attempts: attempts as u32,
        created_at_ms: created as u64,
        next_attempt_at_ms: next as u64,
        last_error: err,
        audit: serde_json::from_value(audit).unwrap_or_default(),
    })
}

const INTERVENTION_COLS: &str =
    "intervention_id, event_id, principal_id, device_id, kind, state, attempts,
     created_at_ms, next_attempt_at_ms, last_error, audit";

impl InterventionSink for PgStore {
    fn enqueue(&self, i: Intervention) -> Result<(), PortError> {
        block(async {
            sqlx::query(
                "INSERT INTO interventions
                 (intervention_id, event_id, principal_id, device_id, kind, state,
                  attempts, created_at_ms, next_attempt_at_ms, last_error, audit)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
            )
            .bind(&i.intervention_id)
            .bind(&i.event_id)
            .bind(&i.principal_id)
            .bind(&i.device_id)
            .bind(kind_str(i.kind))
            .bind(state_str(i.state))
            .bind(i.attempts as i32)
            .bind(i.created_at_ms as i64)
            .bind(i.next_attempt_at_ms as i64)
            .bind(&i.last_error)
            .bind(serde_json::to_value(&i.audit).unwrap_or_default())
            .execute(&self.pool)
            .await
            .map_err(map_storage)?;
            Ok(())
        })
    }
    fn due(&self, now_ms: u64, limit: usize) -> Result<Vec<Intervention>, PortError> {
        block(async {
            let q = format!(
                "SELECT {INTERVENTION_COLS} FROM interventions
                 WHERE state IN ('pending','failed') AND next_attempt_at_ms <= $1
                 ORDER BY next_attempt_at_ms LIMIT $2"
            );
            let rows = sqlx::query_as::<_, InterventionRow>(&q)
                .bind(now_ms as i64)
                .bind(limit as i64)
                .fetch_all(&self.pool)
                .await
                .map_err(map_storage)?;
            rows.into_iter().map(row_to_intervention).collect()
        })
    }
    fn list(&self, principal_id: &str) -> Result<Vec<Intervention>, PortError> {
        block(async {
            let q = format!(
                "SELECT {INTERVENTION_COLS} FROM interventions
                 WHERE principal_id = $1 ORDER BY created_at_ms"
            );
            let rows = sqlx::query_as::<_, InterventionRow>(&q)
                .bind(principal_id)
                .fetch_all(&self.pool)
                .await
                .map_err(map_storage)?;
            rows.into_iter().map(row_to_intervention).collect()
        })
    }
    fn update(&self, i: Intervention) -> Result<(), PortError> {
        block(async {
            sqlx::query(
                "UPDATE interventions SET state=$2, attempts=$3, next_attempt_at_ms=$4,
                 last_error=$5, audit=$6 WHERE intervention_id=$1",
            )
            .bind(&i.intervention_id)
            .bind(state_str(i.state))
            .bind(i.attempts as i32)
            .bind(i.next_attempt_at_ms as i64)
            .bind(&i.last_error)
            .bind(serde_json::to_value(&i.audit).unwrap_or_default())
            .execute(&self.pool)
            .await
            .map_err(map_storage)?;
            Ok(())
        })
    }

    fn delete_by_principal(&self, principal_id: &str) -> Result<u64, PortError> {
        block(async {
            let n = sqlx::query("DELETE FROM interventions WHERE principal_id = $1")
                .bind(principal_id)
                .execute(&self.pool)
                .await
                .map_err(map_storage)?
                .rows_affected();
            Ok(n)
        })
    }
    fn list_by_device(&self, device_id: &str) -> Result<Vec<Intervention>, PortError> {
        block(async {
            let q = format!(
                "SELECT {INTERVENTION_COLS} FROM interventions
                 WHERE device_id = $1 AND state IN ('pending','failed')
                 ORDER BY created_at_ms"
            );
            let rows = sqlx::query_as::<_, InterventionRow>(&q)
                .bind(device_id)
                .fetch_all(&self.pool)
                .await
                .map_err(map_storage)?;
            rows.into_iter().map(row_to_intervention).collect()
        })
    }
}
