//! PostgreSQL adapter implementing the hexagonal ports. Development-grade:
//! schema in `infra/postgres/migrations`, RLS default-deny stands. Queries are
//! scoped by tenant_id (B19); encryption at rest is still out of scope.
//!
//! The ports are async (ADR-0008); sqlx is used natively, no blocking bridge.
//! In-memory adapters remain the default when `DATABASE_URL` is unset.
use async_trait::async_trait;
use sovir_domain::{
    ConsentGrant, DeletionReceipt, DeliveryState, Device, Intervention, InterventionKind, Modality,
    ObservedEvent, Platform, RiskSignal, Scope, SensitiveDataClass, Session, WebhookEndpoint,
};
use sovir_ports::{
    ConsentRepository, DeletionReceiptStore, DeviceRegistry, EventRepository, InterventionSink,
    PortError, SessionStore,
};
use sqlx::{postgres::PgPoolOptions, PgPool};
use std::time::Duration;

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

#[async_trait]
impl ConsentRepository for PgStore {
    async fn get(
        &self,
        tenant_id: &str,
        grant_id: &str,
    ) -> Result<Option<ConsentGrant>, PortError> {
        sqlx::query_as::<_, (String, String, String, i64, bool)>(
            "SELECT principal_id, device_id, source_id, expires_at_ms, revoked
             FROM consent_grants WHERE tenant_id = $1 AND grant_id = $2",
        )
        .bind(tenant_id)
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
                    tenant_id: tenant_id.to_string(),
                })
            },
        )
        .transpose()
    }
    async fn put(&self, grant: ConsentGrant) -> Result<(), PortError> {
        sqlx::query(
            "INSERT INTO consent_grants
             (tenant_id, grant_id, principal_id, device_id, source_id, expires_at_ms, revoked)
             VALUES ($1,$2,$3,$4,$5,$6,$7)",
        )
        .bind(&grant.tenant_id)
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
    }
    async fn revoke(&self, tenant_id: &str, grant_id: &str) -> Result<bool, PortError> {
        let n = sqlx::query(
            "UPDATE consent_grants SET revoked = TRUE
             WHERE tenant_id = $1 AND grant_id = $2",
        )
        .bind(tenant_id)
        .bind(grant_id)
        .execute(&self.pool)
        .await
        .map_err(map_storage)?
        .rows_affected();
        Ok(n > 0)
    }
    async fn revoke_by_device(&self, tenant_id: &str, device_id: &str) -> Result<u64, PortError> {
        let n = sqlx::query(
            "UPDATE consent_grants SET revoked = TRUE
             WHERE tenant_id = $1 AND device_id = $2 AND NOT revoked",
        )
        .bind(tenant_id)
        .bind(device_id)
        .execute(&self.pool)
        .await
        .map_err(map_storage)?
        .rows_affected();
        Ok(n)
    }
    async fn list_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<ConsentGrant>, PortError> {
        let rows = sqlx::query_as::<_, (String, String, String, i64, bool)>(
            "SELECT grant_id, device_id, source_id, expires_at_ms, revoked
             FROM consent_grants
             WHERE tenant_id = $1 AND principal_id = $2 ORDER BY grant_id",
        )
        .bind(tenant_id)
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
                    tenant_id: tenant_id.to_string(),
                },
            )
            .collect())
    }
    async fn delete_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<u64, PortError> {
        let n =
            sqlx::query("DELETE FROM consent_grants WHERE tenant_id = $1 AND principal_id = $2")
                .bind(tenant_id)
                .bind(principal_id)
                .execute(&self.pool)
                .await
                .map_err(map_storage)?
                .rows_affected();
        Ok(n)
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

#[async_trait]
impl EventRepository for PgStore {
    async fn insert_once(&self, event: ObservedEvent) -> Result<(), PortError> {
        let signals: Vec<&str> = event.signals.iter().map(|s| signal_str(*s)).collect();
        let res = sqlx::query(
            "INSERT INTO observation_events
             (tenant_id, event_id, principal_id, device_id, source_id, consent_grant_id,
              observed_at_ms, modality, sensitive_data_class, content_digest, signals)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (event_id) DO NOTHING",
        )
        .bind(&event.tenant_id)
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
    }
    async fn list_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<ObservedEvent>, PortError> {
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
             FROM observation_events
             WHERE tenant_id = $1 AND principal_id = $2 ORDER BY observed_at_ms",
        )
        .bind(tenant_id)
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
                        tenant_id: tenant_id.to_string(),
                    }
                },
            )
            .collect())
    }
    async fn delete_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<u64, PortError> {
        let n = sqlx::query(
            "DELETE FROM observation_events WHERE tenant_id = $1 AND principal_id = $2",
        )
        .bind(tenant_id)
        .bind(principal_id)
        .execute(&self.pool)
        .await
        .map_err(map_storage)?
        .rows_affected();
        Ok(n)
    }
    async fn delete_older_than(
        &self,
        tenant_id: &str,
        principal_id: &str,
        cutoff_ms: u64,
    ) -> Result<u64, PortError> {
        let n = sqlx::query(
            "DELETE FROM observation_events
             WHERE tenant_id = $1 AND principal_id = $2 AND observed_at_ms < $3",
        )
        .bind(tenant_id)
        .bind(principal_id)
        .bind(cutoff_ms as i64)
        .execute(&self.pool)
        .await
        .map_err(map_storage)?
        .rows_affected();
        Ok(n)
    }
    async fn delete_older_than_any(&self, cutoff_ms: u64) -> Result<u64, PortError> {
        let n = sqlx::query("DELETE FROM observation_events WHERE observed_at_ms < $1")
            .bind(cutoff_ms as i64)
            .execute(&self.pool)
            .await
            .map_err(map_storage)?
            .rows_affected();
        Ok(n)
    }
}

#[async_trait]
impl SessionStore for PgStore {
    async fn issue(&self, session: Session) -> Result<(), PortError> {
        (async {
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
        }).await
    }
    async fn resolve(&self, token: &str) -> Result<Option<Session>, PortError> {
        (async {
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
        }).await
    }
    async fn revoke(&self, token: &str) -> Result<bool, PortError> {
        (async {
            let n = sqlx::query("UPDATE sessions SET revoked = TRUE WHERE token = $1")
                .bind(token)
                .execute(&self.pool)
                .await
                .map_err(map_storage)?
                .rows_affected();
            Ok(n > 0)
        })
        .await
    }
    async fn revoke_by_device(&self, tenant_id: &str, device_id: &str) -> Result<u64, PortError> {
        (async {
            let n = sqlx::query(
                "UPDATE sessions SET revoked = TRUE
                 WHERE tenant_id = $1 AND device_id = $2 AND NOT revoked",
            )
            .bind(tenant_id)
            .bind(device_id)
            .execute(&self.pool)
            .await
            .map_err(map_storage)?
            .rows_affected();
            Ok(n)
        })
        .await
    }
    async fn revoke_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<u64, PortError> {
        (async {
            let n = sqlx::query(
                "UPDATE sessions SET revoked = TRUE
                 WHERE tenant_id = $1 AND principal_id = $2 AND NOT revoked",
            )
            .bind(tenant_id)
            .bind(principal_id)
            .execute(&self.pool)
            .await
            .map_err(map_storage)?
            .rows_affected();
            Ok(n)
        })
        .await
    }
}

#[async_trait]
impl DeviceRegistry for PgStore {
    async fn register(&self, device: Device) -> Result<(), PortError> {
        (async {
            sqlx::query(
                "INSERT INTO devices
                 (tenant_id, principal_id, device_id, platform, label,
                  registered_at_ms, last_seen_at_ms, revoked_at_ms)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
            )
            .bind(&device.tenant_id)
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
        .await
    }
    async fn get(
        &self,
        tenant_id: &str,
        principal_id: &str,
        device_id: &str,
    ) -> Result<Option<Device>, PortError> {
        (async {
            sqlx::query_as::<_, (String, String, i64, Option<i64>, Option<i64>)>(
                "SELECT platform, label, registered_at_ms, last_seen_at_ms, revoked_at_ms
                 FROM devices WHERE tenant_id = $1 AND principal_id = $2 AND device_id = $3",
            )
            .bind(tenant_id)
            .bind(principal_id)
            .bind(device_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_storage)?
            .map(
                |(platform, label, registered_at_ms, last_seen_at_ms, revoked_at_ms)| Device {
                    device_id: device_id.to_string(),
                    principal_id: principal_id.to_string(),
                    tenant_id: tenant_id.to_string(),
                    platform: platform_from(&platform),
                    label,
                    registered_at_ms: registered_at_ms as u64,
                    last_seen_at_ms: last_seen_at_ms.map(|v| v as u64),
                    revoked_at_ms: revoked_at_ms.map(|v| v as u64),
                },
            )
            .map_or(Ok(None), |d| Ok(Some(d)))
        })
        .await
    }
    async fn list(&self, tenant_id: &str, principal_id: &str) -> Result<Vec<Device>, PortError> {
        (async {
            let rows = sqlx::query_as::<
                _,
                (String, String, String, i64, Option<i64>, Option<i64>),
            >(
                "SELECT device_id, platform, label, registered_at_ms, last_seen_at_ms, revoked_at_ms
                 FROM devices WHERE tenant_id = $1 AND principal_id = $2 ORDER BY device_id",
            )
            .bind(tenant_id)
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
                            tenant_id: tenant_id.to_string(),
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
        .await
    }
    async fn touch_seen(
        &self,
        tenant_id: &str,
        principal_id: &str,
        device_id: &str,
        now_ms: u64,
    ) -> Result<(), PortError> {
        (async {
            sqlx::query(
                "UPDATE devices SET last_seen_at_ms = $4
                 WHERE tenant_id = $1 AND principal_id = $2 AND device_id = $3",
            )
            .bind(tenant_id)
            .bind(principal_id)
            .bind(device_id)
            .bind(now_ms as i64)
            .execute(&self.pool)
            .await
            .map_err(map_storage)?;
            Ok(())
        })
        .await
    }
    async fn revoke(
        &self,
        tenant_id: &str,
        principal_id: &str,
        device_id: &str,
        now_ms: u64,
    ) -> Result<bool, PortError> {
        (async {
            let n = sqlx::query(
                "UPDATE devices SET revoked_at_ms = $4
                 WHERE tenant_id = $1 AND principal_id = $2 AND device_id = $3",
            )
            .bind(tenant_id)
            .bind(principal_id)
            .bind(device_id)
            .bind(now_ms as i64)
            .execute(&self.pool)
            .await
            .map_err(map_storage)?
            .rows_affected();
            Ok(n > 0)
        })
        .await
    }
    async fn scrub_label(
        &self,
        tenant_id: &str,
        principal_id: &str,
        device_id: &str,
    ) -> Result<u64, PortError> {
        (async {
            let n = sqlx::query(
                "UPDATE devices SET label = '[redacted]'
                 WHERE tenant_id = $1 AND principal_id = $2 AND device_id = $3
                   AND label <> '[redacted]'",
            )
            .bind(tenant_id)
            .bind(principal_id)
            .bind(device_id)
            .execute(&self.pool)
            .await
            .map_err(map_storage)?
            .rows_affected();
            Ok(n)
        })
        .await
    }
}

type InterventionRow = (
    String,
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
    let (
        id,
        event_id,
        principal_id,
        device_id,
        tenant_id,
        kind,
        state,
        attempts,
        created,
        next,
        err,
        audit,
    ) = r;
    Ok(Intervention {
        intervention_id: id,
        event_id,
        principal_id,
        device_id,
        tenant_id,
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
    "intervention_id, event_id, principal_id, device_id, tenant_id, kind, state, attempts,
     created_at_ms, next_attempt_at_ms, last_error, audit";

#[async_trait]
impl InterventionSink for PgStore {
    async fn enqueue(&self, i: Intervention) -> Result<(), PortError> {
        (async {
            sqlx::query(
                "INSERT INTO interventions
                 (intervention_id, event_id, principal_id, device_id, tenant_id, kind, state,
                  attempts, created_at_ms, next_attempt_at_ms, last_error, audit)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
            )
            .bind(&i.intervention_id)
            .bind(&i.event_id)
            .bind(&i.principal_id)
            .bind(&i.device_id)
            .bind(&i.tenant_id)
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
        .await
    }
    async fn due(&self, now_ms: u64, limit: usize) -> Result<Vec<Intervention>, PortError> {
        (async {
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
        .await
    }
    async fn list(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<Intervention>, PortError> {
        (async {
            let q = format!(
                "SELECT {INTERVENTION_COLS} FROM interventions
                 WHERE tenant_id = $1 AND principal_id = $2 ORDER BY created_at_ms"
            );
            let rows = sqlx::query_as::<_, InterventionRow>(&q)
                .bind(tenant_id)
                .bind(principal_id)
                .fetch_all(&self.pool)
                .await
                .map_err(map_storage)?;
            rows.into_iter().map(row_to_intervention).collect()
        })
        .await
    }
    async fn update(&self, i: Intervention) -> Result<(), PortError> {
        (async {
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
        .await
    }

    async fn delete_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<u64, PortError> {
        (async {
            let n =
                sqlx::query("DELETE FROM interventions WHERE tenant_id = $1 AND principal_id = $2")
                    .bind(tenant_id)
                    .bind(principal_id)
                    .execute(&self.pool)
                    .await
                    .map_err(map_storage)?
                    .rows_affected();
            Ok(n)
        })
        .await
    }
    async fn list_by_device(
        &self,
        tenant_id: &str,
        device_id: &str,
    ) -> Result<Vec<Intervention>, PortError> {
        (async {
            let q = format!(
                "SELECT {INTERVENTION_COLS} FROM interventions
                 WHERE tenant_id = $1 AND device_id = $2 AND state IN ('pending','failed')
                 ORDER BY created_at_ms"
            );
            let rows = sqlx::query_as::<_, InterventionRow>(&q)
                .bind(tenant_id)
                .bind(device_id)
                .fetch_all(&self.pool)
                .await
                .map_err(map_storage)?;
            rows.into_iter().map(row_to_intervention).collect()
        })
        .await
    }
    async fn delete_terminal_older_than(
        &self,
        tenant_id: &str,
        principal_id: &str,
        cutoff_ms: u64,
    ) -> Result<u64, PortError> {
        (async {
            let n = sqlx::query(
                "DELETE FROM interventions
                 WHERE tenant_id = $1 AND principal_id = $2 AND created_at_ms < $3
                   AND state IN ('delivered','expired')",
            )
            .bind(tenant_id)
            .bind(principal_id)
            .bind(cutoff_ms as i64)
            .execute(&self.pool)
            .await
            .map_err(map_storage)?
            .rows_affected();
            Ok(n)
        })
        .await
    }
    async fn delete_terminal_older_than_any(&self, cutoff_ms: u64) -> Result<u64, PortError> {
        (async {
            let n = sqlx::query(
                "DELETE FROM interventions
                 WHERE created_at_ms < $1 AND state IN ('delivered','expired')",
            )
            .bind(cutoff_ms as i64)
            .execute(&self.pool)
            .await
            .map_err(map_storage)?
            .rows_affected();
            Ok(n)
        })
        .await
    }
}

#[async_trait]
impl DeletionReceiptStore for PgStore {
    async fn record(&self, receipt: DeletionReceipt) -> Result<(), PortError> {
        (async {
            sqlx::query(
                "INSERT INTO deletion_receipts
                 (receipt_id, tenant_id, principal_id, purged_at_ms, events_deleted,
                  grants_deleted, interventions_deleted, sessions_revoked,
                  devices_revoked, labels_scrubbed)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
            )
            .bind(&receipt.receipt_id)
            .bind(&receipt.tenant_id)
            .bind(&receipt.principal_id)
            .bind(receipt.purged_at_ms as i64)
            .bind(receipt.events_deleted as i64)
            .bind(receipt.grants_deleted as i64)
            .bind(receipt.interventions_deleted as i64)
            .bind(receipt.sessions_revoked as i64)
            .bind(receipt.devices_revoked as i64)
            .bind(receipt.labels_scrubbed as i64)
            .execute(&self.pool)
            .await
            .map_err(map_storage)?;
            Ok(())
        })
        .await
    }
    async fn list_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<DeletionReceipt>, PortError> {
        (async {
            let rows = sqlx::query_as::<_, (String, i64, i64, i64, i64, i64, i64, i64)>(
                "SELECT receipt_id, purged_at_ms, events_deleted, grants_deleted,
                        interventions_deleted, sessions_revoked, devices_revoked,
                        labels_scrubbed
                 FROM deletion_receipts
                 WHERE tenant_id = $1 AND principal_id = $2 ORDER BY purged_at_ms",
            )
            .bind(tenant_id)
            .bind(principal_id)
            .fetch_all(&self.pool)
            .await
            .map_err(map_storage)?;
            Ok(rows
                .into_iter()
                .map(
                    |(
                        receipt_id,
                        purged_at_ms,
                        events_deleted,
                        grants_deleted,
                        interventions_deleted,
                        sessions_revoked,
                        devices_revoked,
                        labels_scrubbed,
                    )| DeletionReceipt {
                        receipt_id,
                        principal_id: principal_id.to_string(),
                        tenant_id: tenant_id.to_string(),
                        purged_at_ms: purged_at_ms as u64,
                        events_deleted: events_deleted as u64,
                        grants_deleted: grants_deleted as u64,
                        interventions_deleted: interventions_deleted as u64,
                        sessions_revoked: sessions_revoked as u64,
                        devices_revoked: devices_revoked as u64,
                        labels_scrubbed: labels_scrubbed as u64,
                    },
                )
                .collect())
        })
        .await
    }
}

type WebhookRow = (
    String,
    String,
    String,
    String,
    Vec<String>,
    i64,
    Option<i64>,
);

fn row_to_webhook(r: WebhookRow) -> WebhookEndpoint {
    let (endpoint_id, principal_id, url, secret, kinds, created_at_ms, revoked_at_ms) = r;
    WebhookEndpoint {
        endpoint_id,
        principal_id,
        tenant_id: String::new(),
        url,
        secret,
        kinds: kinds.iter().filter_map(|k| kind_opt(k)).collect(),
        created_at_ms: created_at_ms as u64,
        revoked_at_ms: revoked_at_ms.map(|v| v as u64),
    }
}
fn kind_opt(s: &str) -> Option<InterventionKind> {
    match s {
        "notify" => Some(InterventionKind::Notify),
        "warn_banner" => Some(InterventionKind::WarnBanner),
        "require_review" => Some(InterventionKind::RequireReview),
        _ => None,
    }
}

#[async_trait]
impl sovir_ports::WebhookRegistry for PgStore {
    async fn register(&self, ep: WebhookEndpoint) -> Result<(), PortError> {
        let kinds: Vec<&str> = ep.kinds.iter().map(|k| kind_str(*k)).collect();
        sqlx::query(
            "INSERT INTO webhook_endpoints
             (endpoint_id, tenant_id, principal_id, url, secret, kinds,
              created_at_ms, revoked_at_ms)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        )
        .bind(&ep.endpoint_id)
        .bind(&ep.tenant_id)
        .bind(&ep.principal_id)
        .bind(&ep.url)
        .bind(&ep.secret)
        .bind(&kinds)
        .bind(ep.created_at_ms as i64)
        .bind(ep.revoked_at_ms.map(|v| v as i64))
        .execute(&self.pool)
        .await
        .map_err(map_storage)?;
        Ok(())
    }
    async fn list(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<WebhookEndpoint>, PortError> {
        let rows = sqlx::query_as::<
            _,
            (
                String,
                String,
                String,
                String,
                Vec<String>,
                i64,
                Option<i64>,
                String,
            ),
        >(
            "SELECT endpoint_id, principal_id, url, secret, kinds,
                    created_at_ms, revoked_at_ms, tenant_id
             FROM webhook_endpoints
             WHERE tenant_id = $1 AND principal_id = $2 ORDER BY created_at_ms",
        )
        .bind(tenant_id)
        .bind(principal_id)
        .fetch_all(&self.pool)
        .await
        .map_err(map_storage)?;
        Ok(rows
            .into_iter()
            .map(|(id, pid, url, secret, kinds, c, r, t)| {
                let mut w = row_to_webhook((id, pid, url, secret, kinds, c, r));
                w.tenant_id = t;
                w
            })
            .collect())
    }
    async fn matching(
        &self,
        tenant_id: &str,
        principal_id: &str,
        kind: InterventionKind,
    ) -> Result<Vec<WebhookEndpoint>, PortError> {
        let rows = sqlx::query_as::<
            _,
            (
                String,
                String,
                String,
                String,
                Vec<String>,
                i64,
                Option<i64>,
                String,
            ),
        >(
            "SELECT endpoint_id, principal_id, url, secret, kinds,
                    created_at_ms, revoked_at_ms, tenant_id
             FROM webhook_endpoints
             WHERE tenant_id = $1 AND principal_id = $2 AND revoked_at_ms IS NULL
               AND $3 = ANY(kinds)",
        )
        .bind(tenant_id)
        .bind(principal_id)
        .bind(kind_str(kind))
        .fetch_all(&self.pool)
        .await
        .map_err(map_storage)?;
        Ok(rows
            .into_iter()
            .map(|(id, pid, url, secret, kinds, c, r, t)| {
                let mut w = row_to_webhook((id, pid, url, secret, kinds, c, r));
                w.tenant_id = t;
                w
            })
            .collect())
    }
    async fn revoke(
        &self,
        tenant_id: &str,
        principal_id: &str,
        endpoint_id: &str,
        now_ms: u64,
    ) -> Result<bool, PortError> {
        let n = sqlx::query(
            "UPDATE webhook_endpoints SET revoked_at_ms = $4
             WHERE tenant_id = $1 AND principal_id = $2 AND endpoint_id = $3
               AND revoked_at_ms IS NULL",
        )
        .bind(tenant_id)
        .bind(principal_id)
        .bind(endpoint_id)
        .bind(now_ms as i64)
        .execute(&self.pool)
        .await
        .map_err(map_storage)?
        .rows_affected();
        Ok(n > 0)
    }
}
