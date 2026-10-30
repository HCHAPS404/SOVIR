//! PostgreSQL adapter implementing the hexagonal ports. Development-grade:
//! schema in `infra/postgres/migrations`, RLS default-deny stands. Queries are
//! scoped by tenant_id (B19); encryption at rest is still out of scope.
//!
//! The ports are async (ADR-0008); sqlx is used natively, no blocking bridge.
//! In-memory adapters remain the default when `DATABASE_URL` is unset.
use async_trait::async_trait;
use sovir_domain::{
    ConsentGrant, DeletionReceipt, DeliveryState, Device, IdempotentResponse, InferenceReservation,
    InferenceUsage, Intervention, InterventionKind, Modality, ObservedEvent, Platform,
    ReservationState, RiskSignal, Scope, SensitiveDataClass, Session, WebhookEndpoint,
};
use sovir_ports::{
    BudgetReservations, ConsentRepository, DeletionReceiptStore, DeviceRegistry, EventRepository,
    IdempotencyStore, InterventionSink, PortError, ReserveOutcome, SessionStore,
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
    /// Runtime pool — expected to connect as `sovir_app` (non-owner):
    /// tenant-scoped work goes through `tenant_tx` where RLS bites.
    pool: PgPool,
    /// Privileged pool for cross-tenant operations: token-only session
    /// resolution (no tenant context exists yet), `*_any` retention
    /// sweeps, dispatch `due`. When no admin URL is configured this is a
    /// clone of `pool` — owner-mode dev compat, documented posture, not
    /// the production split.
    global_pool: PgPool,
    /// Default per-tenant inference cap (micro-USD) stamped on first
    /// spend row. 0 = fail closed (ADR-0012).
    budget_cap_micro_usd: i64,
}
impl PgStore {
    pub async fn connect(database_url: &str) -> Result<Self, sqlx::Error> {
        Self::connect_split(database_url, None).await
    }
    /// Split-role connect (B21): `database_url` should carry `sovir_app`
    /// credentials (RLS-bound runtime role). `admin_url` is the optional
    /// privileged role for cross-tenant sweeps and token resolution —
    /// without it both pools share the runtime role and only an owner
    /// database_url makes global ops work (previous behaviour).
    pub async fn connect_split(
        database_url: &str,
        admin_url: Option<&str>,
    ) -> Result<Self, sqlx::Error> {
        let pool = PgPoolOptions::new()
            .max_connections(4)
            .acquire_timeout(Duration::from_secs(5))
            .connect(database_url)
            .await?;
        let global_pool = match admin_url {
            Some(u) => {
                PgPoolOptions::new()
                    .max_connections(2)
                    .acquire_timeout(Duration::from_secs(5))
                    .connect(u)
                    .await?
            }
            None => pool.clone(),
        };
        Ok(Self {
            pool,
            global_pool,
            budget_cap_micro_usd: 0,
        })
    }
    /// Privileged pool for global ops. Kept as a named accessor so every
    /// cross-tenant path is greppable.
    fn global(&self) -> &PgPool {
        &self.global_pool
    }
    /// Provisioning hook: default budget cap for tenants' first row.
    pub fn with_budget_cap(mut self, micro_usd: u64) -> Self {
        self.budget_cap_micro_usd = micro_usd.min(i64::MAX as u64) as i64;
        self
    }
    /// Tenant-pinned transaction (ADR-0009 defense in depth). Every
    /// tenant-scoped repo method runs inside `set_config('app.tenant_id',
    /// …, true)` so RLS policies bite for a `sovir_app` connection even
    /// if a query forgets its own WHERE clause. Global sweeps and
    /// token-only lookups (`resolve`, `due_any`, `*_any`,
    /// `delete_expired`, `pull`) run on `global()` — the privileged pool
    /// wired by `connect_split`, or the runtime pool in owner-mode dev.
    async fn tenant_tx(
        &self,
        tenant_id: &str,
    ) -> Result<sqlx::Transaction<'_, sqlx::Postgres>, PortError> {
        let mut tx = self.pool.begin().await.map_err(map_storage)?;
        sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
            .bind(tenant_id)
            .execute(&mut *tx)
            .await
            .map_err(map_storage)?;
        Ok(tx)
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
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            sqlx::query_as::<_, (String, String, String, i64, bool)>(
                "SELECT principal_id, device_id, source_id, expires_at_ms, revoked
             FROM consent_grants WHERE tenant_id = $1 AND grant_id = $2",
            )
            .bind(tenant_id)
            .bind(grant_id)
            .fetch_optional(&mut *tx)
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
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn put(&self, grant: ConsentGrant) -> Result<(), PortError> {
        let mut tx = self.tenant_tx(&grant.tenant_id).await?;
        let res = (async {
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
            .execute(&mut *tx)
            .await
            .map_err(map_storage)?;
            Ok(())
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn revoke(&self, tenant_id: &str, grant_id: &str) -> Result<bool, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            let n = sqlx::query(
                "UPDATE consent_grants SET revoked = TRUE
             WHERE tenant_id = $1 AND grant_id = $2",
            )
            .bind(tenant_id)
            .bind(grant_id)
            .execute(&mut *tx)
            .await
            .map_err(map_storage)?
            .rows_affected();
            Ok(n > 0)
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn revoke_by_device(&self, tenant_id: &str, device_id: &str) -> Result<u64, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            let n = sqlx::query(
                "UPDATE consent_grants SET revoked = TRUE
             WHERE tenant_id = $1 AND device_id = $2 AND NOT revoked",
            )
            .bind(tenant_id)
            .bind(device_id)
            .execute(&mut *tx)
            .await
            .map_err(map_storage)?
            .rows_affected();
            Ok(n)
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn list_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<ConsentGrant>, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            let rows = sqlx::query_as::<_, (String, String, String, i64, bool)>(
                "SELECT grant_id, device_id, source_id, expires_at_ms, revoked
             FROM consent_grants
             WHERE tenant_id = $1 AND principal_id = $2 ORDER BY grant_id",
            )
            .bind(tenant_id)
            .bind(principal_id)
            .fetch_all(&mut *tx)
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
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn delete_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<u64, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            let n = sqlx::query(
                "DELETE FROM consent_grants WHERE tenant_id = $1 AND principal_id = $2",
            )
            .bind(tenant_id)
            .bind(principal_id)
            .execute(&mut *tx)
            .await
            .map_err(map_storage)?
            .rows_affected();
            Ok(n)
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
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
        let mut tx = self.tenant_tx(&event.tenant_id).await?;
        let res = (async {
            // Race-safety: re-verify the consent grant inside the same
            // transaction as the insert (FOR UPDATE serializes with any
            // concurrent revoke). App-layer validate_consent stays as the
            // first gate; this is the atomic one.
            // Expiry uses the DB clock so the check is atomic with the lock.
            let grant: Option<(bool, i64)> = sqlx::query_as(
                "SELECT revoked, expires_at_ms FROM consent_grants
                 WHERE grant_id = $1 FOR UPDATE",
            )
            .bind(&event.consent_grant_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(map_storage)?;
            let now: i64 = sqlx::query_scalar("SELECT (EXTRACT(EPOCH FROM NOW())*1000)::bigint")
                .fetch_one(&mut *tx)
                .await
                .map_err(map_storage)?;
            match grant {
                Some((false, exp)) if exp > now => {}
                _ => return Err(PortError::Consent),
            }
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
            .execute(&mut *tx)
            .await
            .map_err(map_storage)?;
            if res.rows_affected() == 0 {
                Err(PortError::Duplicate)
            } else {
                Ok(())
            }
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn list_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<ObservedEvent>, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
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
             WHERE tenant_id = $1 AND principal_id = $2
             ORDER BY observed_at_ms, event_id",
            )
            .bind(tenant_id)
            .bind(principal_id)
            .fetch_all(&mut *tx)
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
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn delete_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<u64, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            let n = sqlx::query(
                "DELETE FROM observation_events WHERE tenant_id = $1 AND principal_id = $2",
            )
            .bind(tenant_id)
            .bind(principal_id)
            .execute(&mut *tx)
            .await
            .map_err(map_storage)?
            .rows_affected();
            Ok(n)
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn delete_older_than(
        &self,
        tenant_id: &str,
        principal_id: &str,
        cutoff_ms: u64,
    ) -> Result<u64, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            let n = sqlx::query(
                "DELETE FROM observation_events
             WHERE tenant_id = $1 AND principal_id = $2 AND observed_at_ms < $3",
            )
            .bind(tenant_id)
            .bind(principal_id)
            .bind(cutoff_ms as i64)
            .execute(&mut *tx)
            .await
            .map_err(map_storage)?
            .rows_affected();
            Ok(n)
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn delete_older_than_any(&self, cutoff_ms: u64) -> Result<u64, PortError> {
        let n = sqlx::query("DELETE FROM observation_events WHERE observed_at_ms < $1")
            .bind(cutoff_ms as i64)
            .execute(self.global())
            .await
            .map_err(map_storage)?
            .rows_affected();
        Ok(n)
    }
    async fn list_recent(
        &self,
        tenant_id: &str,
        principal_id: &str,
        since_ms: u64,
    ) -> Result<Vec<ObservedEvent>, PortError> {
        // Delegates to list_by_principal (already tenant-tx scoped).
        let mut events =
            <Self as EventRepository>::list_by_principal(self, tenant_id, principal_id).await?;
        events.retain(|e| e.observed_at_ms >= since_ms);
        Ok(events)
    }
}

#[async_trait]
impl SessionStore for PgStore {
    async fn issue(&self, session: Session) -> Result<(), PortError> {
        let mut tx = self.tenant_tx(&session.tenant_id).await?;
        let res = (async {
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
            .execute(&mut *tx)
            .await
            .map_err(map_storage)?;
            Ok(())
        }).await
        }).await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
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
            .fetch_optional(self.global())
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
                .execute(self.global())
                .await
                .map_err(map_storage)?
                .rows_affected();
            Ok(n > 0)
        })
        .await
    }
    async fn revoke_by_device(&self, tenant_id: &str, device_id: &str) -> Result<u64, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            (async {
                let n = sqlx::query(
                    "UPDATE sessions SET revoked = TRUE
                 WHERE tenant_id = $1 AND device_id = $2 AND NOT revoked",
                )
                .bind(tenant_id)
                .bind(device_id)
                .execute(&mut *tx)
                .await
                .map_err(map_storage)?
                .rows_affected();
                Ok(n)
            })
            .await
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn revoke_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<u64, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            (async {
                let n = sqlx::query(
                    "UPDATE sessions SET revoked = TRUE
                 WHERE tenant_id = $1 AND principal_id = $2 AND NOT revoked",
                )
                .bind(tenant_id)
                .bind(principal_id)
                .execute(&mut *tx)
                .await
                .map_err(map_storage)?
                .rows_affected();
                Ok(n)
            })
            .await
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn delete_expired(&self, now_ms: u64) -> Result<u64, PortError> {
        (async {
            // Tombstones age by expiry timestamp: revoked sessions persist as
            // tombstones until their natural expiry also passes the cutoff.
            let n = sqlx::query("DELETE FROM sessions WHERE expires_at_ms <= $1")
                .bind(now_ms as i64)
                .execute(self.global())
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
        let mut tx = self.tenant_tx(&device.tenant_id).await?;
        let res = (async {
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
                .execute(&mut *tx)
                .await
                .map_err(map_storage)?;
                Ok(())
            })
            .await
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn get(
        &self,
        tenant_id: &str,
        principal_id: &str,
        device_id: &str,
    ) -> Result<Option<Device>, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            (async {
                sqlx::query_as::<_, (String, String, i64, Option<i64>, Option<i64>)>(
                    "SELECT platform, label, registered_at_ms, last_seen_at_ms, revoked_at_ms
                 FROM devices WHERE tenant_id = $1 AND principal_id = $2 AND device_id = $3",
                )
                .bind(tenant_id)
                .bind(principal_id)
                .bind(device_id)
                .fetch_optional(&mut *tx)
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
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn list(&self, tenant_id: &str, principal_id: &str) -> Result<Vec<Device>, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
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
            .fetch_all(&mut *tx)
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
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn touch_seen(
        &self,
        tenant_id: &str,
        principal_id: &str,
        device_id: &str,
        now_ms: u64,
    ) -> Result<(), PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            (async {
                sqlx::query(
                    "UPDATE devices SET last_seen_at_ms = $4
                 WHERE tenant_id = $1 AND principal_id = $2 AND device_id = $3",
                )
                .bind(tenant_id)
                .bind(principal_id)
                .bind(device_id)
                .bind(now_ms as i64)
                .execute(&mut *tx)
                .await
                .map_err(map_storage)?;
                Ok(())
            })
            .await
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn revoke(
        &self,
        tenant_id: &str,
        principal_id: &str,
        device_id: &str,
        now_ms: u64,
    ) -> Result<bool, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            (async {
                let n = sqlx::query(
                    "UPDATE devices SET revoked_at_ms = $4
                 WHERE tenant_id = $1 AND principal_id = $2 AND device_id = $3",
                )
                .bind(tenant_id)
                .bind(principal_id)
                .bind(device_id)
                .bind(now_ms as i64)
                .execute(&mut *tx)
                .await
                .map_err(map_storage)?
                .rows_affected();
                Ok(n > 0)
            })
            .await
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn scrub_label(
        &self,
        tenant_id: &str,
        principal_id: &str,
        device_id: &str,
    ) -> Result<u64, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            (async {
                let n = sqlx::query(
                    "UPDATE devices SET label = '[redacted]'
                 WHERE tenant_id = $1 AND principal_id = $2 AND device_id = $3
                   AND label <> '[redacted]'",
                )
                .bind(tenant_id)
                .bind(principal_id)
                .bind(device_id)
                .execute(&mut *tx)
                .await
                .map_err(map_storage)?
                .rows_affected();
                Ok(n)
            })
            .await
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
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
        let mut tx = self.tenant_tx(&i.tenant_id).await?;
        let res = (async {
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
                .execute(&mut *tx)
                .await
                .map_err(map_storage)?;
                Ok(())
            })
            .await
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn due_any(&self, now_ms: u64, limit: usize) -> Result<Vec<Intervention>, PortError> {
        self.due(now_ms, limit).await
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
                .fetch_all(self.global())
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
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res: Result<Vec<Intervention>, PortError> = (async {
            (async {
                let q = format!(
                    "SELECT {INTERVENTION_COLS} FROM interventions
                 WHERE tenant_id = $1 AND principal_id = $2 ORDER BY created_at_ms"
                );
                let rows = sqlx::query_as::<_, InterventionRow>(&q)
                    .bind(tenant_id)
                    .bind(principal_id)
                    .fetch_all(&mut *tx)
                    .await
                    .map_err(map_storage)?;
                rows.into_iter().map(row_to_intervention).collect()
            })
            .await
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn update(&self, i: Intervention) -> Result<(), PortError> {
        let mut tx = self.tenant_tx(&i.tenant_id).await?;
        let res = (async {
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
                .execute(&mut *tx)
                .await
                .map_err(map_storage)?;
                Ok(())
            })
            .await
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }

    async fn delete_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<u64, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            (async {
                let n = sqlx::query(
                    "DELETE FROM interventions WHERE tenant_id = $1 AND principal_id = $2",
                )
                .bind(tenant_id)
                .bind(principal_id)
                .execute(&mut *tx)
                .await
                .map_err(map_storage)?
                .rows_affected();
                Ok(n)
            })
            .await
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn list_by_device(
        &self,
        tenant_id: &str,
        device_id: &str,
    ) -> Result<Vec<Intervention>, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res: Result<Vec<Intervention>, PortError> = (async {
            (async {
                let q = format!(
                    "SELECT {INTERVENTION_COLS} FROM interventions
                 WHERE tenant_id = $1 AND device_id = $2 AND state IN ('pending','failed')
                 ORDER BY created_at_ms"
                );
                let rows = sqlx::query_as::<_, InterventionRow>(&q)
                    .bind(tenant_id)
                    .bind(device_id)
                    .fetch_all(&mut *tx)
                    .await
                    .map_err(map_storage)?;
                rows.into_iter().map(row_to_intervention).collect()
            })
            .await
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn delete_terminal_older_than(
        &self,
        tenant_id: &str,
        principal_id: &str,
        cutoff_ms: u64,
    ) -> Result<u64, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            (async {
                let n = sqlx::query(
                    "DELETE FROM interventions
                 WHERE tenant_id = $1 AND principal_id = $2 AND created_at_ms < $3
                   AND state IN ('delivered','expired')",
                )
                .bind(tenant_id)
                .bind(principal_id)
                .bind(cutoff_ms as i64)
                .execute(&mut *tx)
                .await
                .map_err(map_storage)?
                .rows_affected();
                Ok(n)
            })
            .await
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn delete_terminal_older_than_any(&self, cutoff_ms: u64) -> Result<u64, PortError> {
        (async {
            let n = sqlx::query(
                "DELETE FROM interventions
                 WHERE created_at_ms < $1 AND state IN ('delivered','expired')",
            )
            .bind(cutoff_ms as i64)
            .execute(self.global())
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
        let mut tx = self.tenant_tx(&receipt.tenant_id).await?;
        let res = (async {
            (async {
                sqlx::query(
                    "INSERT INTO deletion_receipts
                 (receipt_id, tenant_id, principal_id, purged_at_ms, events_deleted,
                  grants_deleted, interventions_deleted, sessions_revoked,
                  devices_revoked, labels_scrubbed, idem_keys_deleted)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
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
                .bind(receipt.idem_keys_deleted as i64)
                .execute(&mut *tx)
                .await
                .map_err(map_storage)?;
                Ok(())
            })
            .await
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn list_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<DeletionReceipt>, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            (async {
                let rows = sqlx::query_as::<_, (String, i64, i64, i64, i64, i64, i64, i64, i64)>(
                    "SELECT receipt_id, purged_at_ms, events_deleted, grants_deleted,
                        interventions_deleted, sessions_revoked, devices_revoked,
                        labels_scrubbed, idem_keys_deleted
                 FROM deletion_receipts
                 WHERE tenant_id = $1 AND principal_id = $2 ORDER BY purged_at_ms",
                )
                .bind(tenant_id)
                .bind(principal_id)
                .fetch_all(&mut *tx)
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
                            idem_keys_deleted,
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
                            idem_keys_deleted: idem_keys_deleted as u64,
                        },
                    )
                    .collect())
            })
            .await
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
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
        let mut tx = self.tenant_tx(&ep.tenant_id).await?;
        let res = (async {
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
            .execute(&mut *tx)
            .await
            .map_err(map_storage)?;
            Ok(())
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn list(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<WebhookEndpoint>, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
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
            .fetch_all(&mut *tx)
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
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn matching(
        &self,
        tenant_id: &str,
        principal_id: &str,
        kind: InterventionKind,
    ) -> Result<Vec<WebhookEndpoint>, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
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
            .fetch_all(&mut *tx)
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
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn revoke(
        &self,
        tenant_id: &str,
        principal_id: &str,
        endpoint_id: &str,
        now_ms: u64,
    ) -> Result<bool, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            let n = sqlx::query(
                "UPDATE webhook_endpoints SET revoked_at_ms = $4
             WHERE tenant_id = $1 AND principal_id = $2 AND endpoint_id = $3
               AND revoked_at_ms IS NULL",
            )
            .bind(tenant_id)
            .bind(principal_id)
            .bind(endpoint_id)
            .bind(now_ms as i64)
            .execute(&mut *tx)
            .await
            .map_err(map_storage)?
            .rows_affected();
            Ok(n > 0)
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
}
#[async_trait::async_trait]
impl IdempotencyStore for PgStore {
    async fn get(
        &self,
        tenant_id: &str,
        principal_id: &str,
        idem_key: &str,
    ) -> Result<Option<IdempotentResponse>, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            sqlx::query_as::<_, (i64, serde_json::Value, i64)>(
                "SELECT body_hash, response_json, created_at_ms FROM idempotency_keys
             WHERE tenant_id = $1 AND principal_id = $2 AND idem_key = $3",
            )
            .bind(tenant_id)
            .bind(principal_id)
            .bind(idem_key)
            .fetch_optional(&mut *tx)
            .await
            .map_err(map_storage)?
            .map(
                |(body_hash, response_json, created_at_ms)| IdempotentResponse {
                    tenant_id: tenant_id.to_string(),
                    principal_id: principal_id.to_string(),
                    idem_key: idem_key.to_string(),
                    body_hash,
                    response_json,
                    created_at_ms: created_at_ms as u64,
                },
            )
            .map_or(Ok(None), |r| Ok(Some(r)))
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn put(&self, record: IdempotentResponse) -> Result<(), PortError> {
        let mut tx = self.tenant_tx(&record.tenant_id).await?;
        let res = (async {
            // Insert-once: a concurrent replay keeps the first stored response.
            sqlx::query(
                "INSERT INTO idempotency_keys
             (tenant_id, principal_id, idem_key, body_hash, response_json, created_at_ms)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (tenant_id, principal_id, idem_key) DO NOTHING",
            )
            .bind(&record.tenant_id)
            .bind(&record.principal_id)
            .bind(&record.idem_key)
            .bind(record.body_hash)
            .bind(&record.response_json)
            .bind(record.created_at_ms as i64)
            .execute(&mut *tx)
            .await
            .map_err(map_storage)?;
            Ok(())
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn delete_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<u64, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            let n = sqlx::query(
                "DELETE FROM idempotency_keys WHERE tenant_id = $1 AND principal_id = $2",
            )
            .bind(tenant_id)
            .bind(principal_id)
            .execute(&mut *tx)
            .await
            .map_err(map_storage)?
            .rows_affected();
            Ok(n)
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn delete_expired_any(&self, cutoff_ms: u64) -> Result<u64, PortError> {
        // Deliberately unscoped (privileged sweep path, not request traffic).
        (async {
            let n = sqlx::query("DELETE FROM idempotency_keys WHERE created_at_ms <= $1")
                .bind(cutoff_ms as i64)
                .execute(self.global())
                .await
                .map_err(map_storage)?
                .rows_affected();
            Ok(n)
        })
        .await
    }
}
#[async_trait::async_trait]
impl sovir_ports::AuditLog for PgStore {
    async fn record(&self, event: sovir_domain::AuditEvent) -> Result<(), PortError> {
        let mut tx = self.tenant_tx(&event.tenant_id).await?;
        let res = (async {
            sqlx::query(
                "INSERT INTO audit_events
             (audit_id, tenant_id, principal_id, action, detail, at_ms)
             VALUES ($1,$2,$3,$4,$5,$6)",
            )
            .bind(&event.audit_id)
            .bind(&event.tenant_id)
            .bind(&event.principal_id)
            .bind(audit_action_str(event.action))
            .bind(&event.detail)
            .bind(event.at_ms as i64)
            .execute(&mut *tx)
            .await
            .map_err(map_storage)?;
            Ok(())
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn list_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<sovir_domain::AuditEvent>, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            let rows = sqlx::query_as::<_, (String, String, String, i64)>(
                "SELECT audit_id, action, detail, at_ms FROM audit_events
             WHERE tenant_id = $1 AND principal_id = $2 ORDER BY at_ms",
            )
            .bind(tenant_id)
            .bind(principal_id)
            .fetch_all(&mut *tx)
            .await
            .map_err(map_storage)?;
            Ok(rows
                .into_iter()
                .map(
                    |(audit_id, action, detail, at_ms)| sovir_domain::AuditEvent {
                        audit_id,
                        tenant_id: tenant_id.to_string(),
                        principal_id: principal_id.to_string(),
                        action: audit_action_from(&action),
                        detail,
                        at_ms: at_ms as u64,
                    },
                )
                .collect())
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
}
fn audit_action_str(a: sovir_domain::AuditAction) -> &'static str {
    use sovir_domain::AuditAction::*;
    match a {
        SessionIssued => "session_issued",
        ConsentGranted => "consent_granted",
        ConsentRevoked => "consent_revoked",
        EventIngested => "event_ingested",
        DeviceRegistered => "device_registered",
        DeviceRevoked => "device_revoked",
        WebhookRegistered => "webhook_registered",
        WebhookRevoked => "webhook_revoked",
        DataPurged => "data_purged",
        RetentionEnforced => "retention_enforced",
        DispatchRan => "dispatch_ran",
        InferenceCalled => "inference_called",
        IntelPulled => "intel_pulled",
    }
}
fn audit_action_from(s: &str) -> sovir_domain::AuditAction {
    use sovir_domain::AuditAction::*;
    match s {
        "session_issued" => SessionIssued,
        "consent_granted" => ConsentGranted,
        "consent_revoked" => ConsentRevoked,
        "event_ingested" => EventIngested,
        "device_registered" => DeviceRegistered,
        "device_revoked" => DeviceRevoked,
        "webhook_registered" => WebhookRegistered,
        "webhook_revoked" => WebhookRevoked,
        "data_purged" => DataPurged,
        "retention_enforced" => RetentionEnforced,
        "inference_called" => InferenceCalled,
        "intel_pulled" => IntelPulled,
        _ => DispatchRan,
    }
}
#[async_trait::async_trait]
impl sovir_ports::BudgetLedger for PgStore {
    async fn spent_micro_usd(&self, tenant_id: &str) -> Result<u64, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            let row: Option<(i64,)> =
                sqlx::query_as("SELECT spent_micro_usd FROM inference_budget WHERE tenant_id = $1")
                    .bind(tenant_id)
                    .fetch_optional(&mut *tx)
                    .await
                    .map_err(map_storage)?;
            Ok(row.map(|r| r.0.max(0) as u64).unwrap_or(0))
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn cap_micro_usd(&self, tenant_id: &str) -> Result<u64, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            let row: Option<(i64,)> =
                sqlx::query_as("SELECT cap_micro_usd FROM inference_budget WHERE tenant_id = $1")
                    .bind(tenant_id)
                    .fetch_optional(&mut *tx)
                    .await
                    .map_err(map_storage)?;
            // No provisioned row => cap 0. Fail closed, like the dev adapter.
            Ok(row.map(|r| r.0.max(0) as u64).unwrap_or(0))
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn record_spend(&self, tenant_id: &str, micro_usd: u64) -> Result<(), PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            sqlx::query(
                "INSERT INTO inference_budget (tenant_id, spent_micro_usd, cap_micro_usd)
             VALUES ($1, $2, $3)
             ON CONFLICT (tenant_id) DO UPDATE
             SET spent_micro_usd = inference_budget.spent_micro_usd + $2",
            )
            .bind(tenant_id)
            .bind(micro_usd.min(i64::MAX as u64) as i64)
            .bind(self.budget_cap_micro_usd)
            .execute(&mut *tx)
            .await
            .map_err(map_storage)?;
            Ok(())
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
}
#[async_trait::async_trait]
impl sovir_ports::ThreatIntelFeed for PgStore {
    /// No external feed is wired: pulling returns nothing. Candidates
    /// only enter through application-layer validation + `record`.
    async fn pull(&self, _since_ms: u64) -> Result<Vec<sovir_domain::IntelIndicator>, PortError> {
        Ok(Vec::new())
    }
    async fn record(&self, ind: sovir_domain::IntelIndicator) -> Result<(), PortError> {
        let mut tx = self.tenant_tx(&ind.tenant_id).await?;
        let res = (async {
            sqlx::query(
                "INSERT INTO intel_indicators
             (indicator_id, tenant_id, kind, value, confidence_bp, provenance, at_ms)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (indicator_id) DO NOTHING",
            )
            .bind(&ind.indicator_id)
            .bind(&ind.tenant_id)
            .bind(&ind.kind)
            .bind(&ind.value)
            .bind(ind.confidence_bp as i32)
            .bind(&ind.provenance)
            .bind(ind.at_ms as i64)
            .execute(&mut *tx)
            .await
            .map_err(map_storage)?;
            Ok(())
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    async fn list(&self, tenant_id: &str) -> Result<Vec<sovir_domain::IntelIndicator>, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            let rows = sqlx::query_as::<_, (String, String, String, i32, String, i64)>(
                "SELECT indicator_id, kind, value, confidence_bp, provenance, at_ms
             FROM intel_indicators WHERE tenant_id = $1 ORDER BY at_ms",
            )
            .bind(tenant_id)
            .fetch_all(&mut *tx)
            .await
            .map_err(map_storage)?;
            Ok(rows
                .into_iter()
                .map(
                    |(indicator_id, kind, value, confidence_bp, provenance, at_ms)| {
                        sovir_domain::IntelIndicator {
                            indicator_id,
                            tenant_id: tenant_id.to_string(),
                            kind,
                            value,
                            confidence_bp: confidence_bp.max(0) as u16,
                            provenance,
                            at_ms: at_ms as u64,
                        }
                    },
                )
                .collect())
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
}

#[async_trait::async_trait]
impl BudgetReservations for PgStore {
    /// Atomic reserve (B21): the cap check and the pending-row insert live
    /// in the same tenant transaction, serialized by `FOR UPDATE` on the
    /// budget row — two concurrent calls cannot both pass under the cap.
    async fn reserve(
        &self,
        tenant_id: &str,
        request_id: &str,
        est_micro_usd: u64,
    ) -> Result<ReserveOutcome, PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            // Idempotent ingress: same (tenant, request_id) returns its row.
            let existing: Option<(String, String, i64)> = sqlx::query_as(
                "SELECT reservation_id, state, est_micro_usd
                 FROM inference_reservations
                 WHERE tenant_id = $1 AND request_id = $2",
            )
            .bind(tenant_id)
            .bind(request_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(map_storage)?;
            if let Some((rid, state, est)) = existing {
                return Ok(ReserveOutcome::Reserved(InferenceReservation {
                    reservation_id: rid,
                    tenant_id: tenant_id.to_string(),
                    request_id: request_id.to_string(),
                    state: reservation_state(&state),
                    est_micro_usd: est.max(0) as u64,
                    actual_micro_usd: None,
                    usage: None,
                    created_at_ms: 0,
                    settled_at_ms: None,
                }));
            }
            // Lock the tenant's budget row. No row yet ⇒ provision with the
            // store default cap (0 = fail closed, ADR-0012).
            sqlx::query(
                "INSERT INTO inference_budget (tenant_id, spent_micro_usd, cap_micro_usd)
                 VALUES ($1, 0, $2) ON CONFLICT (tenant_id) DO NOTHING",
            )
            .bind(tenant_id)
            .bind(self.budget_cap_micro_usd)
            .execute(&mut *tx)
            .await
            .map_err(map_storage)?;
            let (spent, cap): (i64, i64) = sqlx::query_as(
                "SELECT spent_micro_usd, cap_micro_usd FROM inference_budget
                 WHERE tenant_id = $1 FOR UPDATE",
            )
            .bind(tenant_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(map_storage)?;
            let pending: i64 = sqlx::query_scalar(
                "SELECT COALESCE(SUM(est_micro_usd),0)::bigint
                 FROM inference_reservations
                 WHERE tenant_id = $1 AND state = 'pending'",
            )
            .bind(tenant_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(map_storage)?;
            let est_i = est_micro_usd.min(i64::MAX as u64) as i64;
            if spent
                .saturating_add(pending)
                .saturating_add(est_i)
                > cap
            {
                return Ok(ReserveOutcome::BudgetExceeded);
            }
            let rid = format!("rsv-{}", uuid::Uuid::new_v4().simple());
            let now: i64 = sqlx::query_scalar("SELECT (EXTRACT(EPOCH FROM NOW())*1000)::bigint")
                .fetch_one(&mut *tx)
                .await
                .map_err(map_storage)?;
            sqlx::query(
                "INSERT INTO inference_reservations
                 (reservation_id, tenant_id, request_id, state, est_micro_usd, created_at_ms)
                 VALUES ($1,$2,$3,'pending',$4,$5)",
            )
            .bind(&rid)
            .bind(tenant_id)
            .bind(request_id)
            .bind(est_i)
            .bind(now)
            .execute(&mut *tx)
            .await
            .map_err(map_storage)?;
            Ok(ReserveOutcome::Reserved(InferenceReservation {
                reservation_id: rid,
                tenant_id: tenant_id.to_string(),
                request_id: request_id.to_string(),
                state: ReservationState::Pending,
                est_micro_usd,
                actual_micro_usd: None,
                usage: None,
                created_at_ms: now as u64,
                settled_at_ms: None,
            }))
        })
        .await;
        match res {
            Ok(outcome) => {
                tx.commit().await.map_err(map_storage)?;
                Ok(outcome)
            }
            Err(e) => Err(e),
        }
    }
    /// Settle: mark the pending row settled with actual spend + usage and
    /// credit `inference_budget.spent` — same transaction, idempotent.
    async fn settle(
        &self,
        tenant_id: &str,
        request_id: &str,
        actual_micro_usd: u64,
        usage: InferenceUsage,
    ) -> Result<(), PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            let now: i64 = sqlx::query_scalar("SELECT (EXTRACT(EPOCH FROM NOW())*1000)::bigint")
                .fetch_one(&mut *tx)
                .await
                .map_err(map_storage)?;
            let n = sqlx::query(
                "UPDATE inference_reservations SET
                   state = 'settled', actual_micro_usd = $3,
                   provider = $4, model = $5, tokens_est = $6,
                   tokens_actual = $7, cache_hit = $8, redaction_tier = $9,
                   settled_at_ms = $10
                 WHERE tenant_id = $1 AND request_id = $2 AND state = 'pending'",
            )
            .bind(tenant_id)
            .bind(request_id)
            .bind(actual_micro_usd.min(i64::MAX as u64) as i64)
            .bind(&usage.provider)
            .bind(&usage.model)
            .bind(usage.tokens_est as i32)
            .bind(usage.tokens_actual.map(|t| t as i32))
            .bind(usage.cache_hit)
            .bind(&usage.redaction_tier)
            .bind(now)
            .execute(&mut *tx)
            .await
            .map_err(map_storage)?
            .rows_affected();
            if n == 1 {
                sqlx::query(
                    "UPDATE inference_budget
                     SET spent_micro_usd = spent_micro_usd + $2
                     WHERE tenant_id = $1",
                )
                .bind(tenant_id)
                .bind(actual_micro_usd.min(i64::MAX as u64) as i64)
                .execute(&mut *tx)
                .await
                .map_err(map_storage)?;
            }
            Ok(())
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
    /// Refund: release a pending reservation without charging. Terminal —
    /// pending only; settles elsewhere are untouched.
    async fn refund(&self, tenant_id: &str, request_id: &str) -> Result<(), PortError> {
        let mut tx = self.tenant_tx(tenant_id).await?;
        let res = (async {
            sqlx::query(
                "UPDATE inference_reservations SET state = 'refunded'
                 WHERE tenant_id = $1 AND request_id = $2 AND state = 'pending'",
            )
            .bind(tenant_id)
            .bind(request_id)
            .execute(&mut *tx)
            .await
            .map_err(map_storage)?;
            Ok(())
        })
        .await;
        if res.is_ok() {
            tx.commit().await.map_err(map_storage)?;
        }
        res
    }
}
fn reservation_state(s: &str) -> ReservationState {
    match s {
        "settled" => ReservationState::Settled,
        "refunded" => ReservationState::Refunded,
        _ => ReservationState::Pending,
    }
}
