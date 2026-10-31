//! Interface boundaries. Infrastructure implementations live in adapters.
//! I/O ports are async (ADR-0008); pure compute ports (Clock, RiskAnalyzer)
//! stay synchronous.
//!
//! Tenant isolation (B19): every principal-scoped lookup takes an explicit
//! `tenant_id` so a principal id that collides across tenants can never
//! resolve another tenant's rows. Records carry the sealed tenant binding.
use async_trait::async_trait;
use sovir_domain::{
    Assessment, AuditEvent, ConsentGrant, DeletionReceipt, Device, IdempotentResponse,
    InferenceRequest, InferenceVerdict, IntelIndicator, Intervention, InterventionKind,
    Investigation, ObservedEvent, PrivacyMode, Session, VerifiedIdentity, WebhookEndpoint,
};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum PortError {
    #[error("storage failure")]
    Storage,
    #[error("event already processed")]
    Duplicate,
    #[error("consent grant missing, revoked or expired at write time")]
    Consent,
    #[error("provider or capability not configured")]
    Unavailable,
    #[error("credential verification failed")]
    Unauthorized,
}

pub trait Clock: Send + Sync {
    fn now_ms(&self) -> u64;
}
#[async_trait]
pub trait ConsentRepository: Send + Sync {
    async fn get(&self, tenant_id: &str, grant_id: &str)
        -> Result<Option<ConsentGrant>, PortError>;
    async fn put(&self, grant: ConsentGrant) -> Result<(), PortError>;
    async fn revoke(&self, tenant_id: &str, grant_id: &str) -> Result<bool, PortError>;
    /// Revokes every grant bound to a device within a tenant. Returns count.
    async fn revoke_by_device(&self, tenant_id: &str, device_id: &str) -> Result<u64, PortError>;
    /// Data governance: every grant owned by a principal (export) and hard
    /// deletion of them (erasure). Returns count affected for delete.
    async fn list_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<ConsentGrant>, PortError>;
    async fn delete_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<u64, PortError>;
}
#[async_trait]
pub trait EventRepository: Send + Sync {
    async fn insert_once(&self, event: ObservedEvent) -> Result<(), PortError>;
    /// Data governance export/erasure over the principal's stored events.
    /// Stored events are metadata only (digests, classes) — never payloads.
    async fn list_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<ObservedEvent>, PortError>;
    async fn delete_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<u64, PortError>;
    /// Retention: hard-deletes events with `observed_at_ms` older than
    /// `cutoff_ms`. Scoped to a principal so retention is caller-owned.
    async fn delete_older_than(
        &self,
        tenant_id: &str,
        principal_id: &str,
        cutoff_ms: u64,
    ) -> Result<u64, PortError>;
    /// Global retention sweep: deletes every event older than `cutoff_ms`
    /// regardless of principal. Used only by the scheduled sweep job.
    async fn delete_older_than_any(&self, cutoff_ms: u64) -> Result<u64, PortError>;
    /// Evidence window (B2/ADR-0011): the principal's events observed at or
    /// after `since_ms`, used to detect escalation sequences on ingest.
    async fn list_recent(
        &self,
        tenant_id: &str,
        principal_id: &str,
        since_ms: u64,
    ) -> Result<Vec<ObservedEvent>, PortError>;
}
pub trait RiskAnalyzer: Send + Sync {
    fn analyze(&self, event: &ObservedEvent) -> Assessment;
}
/// Dev session lifecycle. Tokens are opaque; `resolve` returns the stored
/// session regardless of expiry — expiry/revocation is enforced by
/// `Session::principal(now)` so the decision stays in the domain.
#[async_trait]
pub trait SessionStore: Send + Sync {
    async fn issue(&self, session: Session) -> Result<(), PortError>;
    async fn resolve(&self, token: &str) -> Result<Option<Session>, PortError>;
    async fn revoke(&self, token: &str) -> Result<bool, PortError>;
    /// Revokes every live session bound to a device within a tenant.
    async fn revoke_by_device(&self, tenant_id: &str, device_id: &str) -> Result<u64, PortError>;
    /// Revokes every live session of a principal (used by erasure).
    async fn revoke_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<u64, PortError>;
    /// Global hygiene: hard-deletes session tombstones whose expiry
    /// timestamp is older than `cutoff_ms` (passed as now_ms). Revoked
    /// sessions persist as audit tombstones until their natural expiry also
    /// ages past the cutoff. Only the scheduled retention sweep calls this.
    async fn delete_expired(&self, now_ms: u64) -> Result<u64, PortError>;
}
/// Device inventory scoped by principal within a tenant. A device record is
/// never self-declared proof of authorization; registration only records
/// inventory.
#[async_trait]
pub trait DeviceRegistry: Send + Sync {
    async fn register(&self, device: Device) -> Result<(), PortError>;
    async fn get(
        &self,
        tenant_id: &str,
        principal_id: &str,
        device_id: &str,
    ) -> Result<Option<Device>, PortError>;
    async fn list(&self, tenant_id: &str, principal_id: &str) -> Result<Vec<Device>, PortError>;
    async fn touch_seen(
        &self,
        tenant_id: &str,
        principal_id: &str,
        device_id: &str,
        now_ms: u64,
    ) -> Result<(), PortError>;
    async fn revoke(
        &self,
        tenant_id: &str,
        principal_id: &str,
        device_id: &str,
        now_ms: u64,
    ) -> Result<bool, PortError>;
    /// Erasure support: replaces the user-supplied label with a redaction
    /// marker while keeping the revoked device tombstone. Returns count.
    async fn scrub_label(
        &self,
        tenant_id: &str,
        principal_id: &str,
        device_id: &str,
    ) -> Result<u64, PortError>;
}
/// Durable-ish queue of interventions awaiting delivery. State transitions,
/// retry scheduling and audit entries are applied by the application layer;
/// the sink only stores what it is given.
#[async_trait]
pub trait InterventionSink: Send + Sync {
    async fn enqueue(&self, intervention: Intervention) -> Result<(), PortError>;
    async fn due(&self, now_ms: u64, limit: usize) -> Result<Vec<Intervention>, PortError>;
    async fn list(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<Intervention>, PortError>;
    async fn update(&self, intervention: Intervention) -> Result<(), PortError>;
    /// Data governance: hard deletion of the principal's intervention records.
    async fn delete_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<u64, PortError>;
    /// Pending/failed interventions bound to a device (used to expire them
    /// when the device is revoked).
    async fn list_by_device(
        &self,
        tenant_id: &str,
        device_id: &str,
    ) -> Result<Vec<Intervention>, PortError>;
    /// Retention: hard-deletes interventions in a terminal state
    /// (Delivered/Expired) created before `cutoff_ms`, scoped to a principal.
    async fn delete_terminal_older_than(
        &self,
        tenant_id: &str,
        principal_id: &str,
        cutoff_ms: u64,
    ) -> Result<u64, PortError>;
    /// Global sweep: pending/failed interventions due at `now_ms` across
    /// all tenants (scheduled dispatcher; infra-only operation).
    async fn due_any(&self, now_ms: u64, limit: usize) -> Result<Vec<Intervention>, PortError>;
    /// Global retention sweep counterpart of `delete_terminal_older_than`.
    async fn delete_terminal_older_than_any(&self, cutoff_ms: u64) -> Result<u64, PortError>;
}
/// The actual delivery surface (notification, banner, inbox). The dev
/// adapter records attempts in memory; real channels are platform adapters.
#[async_trait]
pub trait DeliveryChannel: Send + Sync {
    async fn send(&self, intervention: &Intervention) -> Result<(), PortError>;
}
/// Registered webhook endpoints (B20).
#[async_trait]
pub trait WebhookRegistry: Send + Sync {
    async fn register(&self, endpoint: WebhookEndpoint) -> Result<(), PortError>;
    async fn list(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<WebhookEndpoint>, PortError>;
    /// Active endpoints of a principal subscribed to a given kind.
    async fn matching(
        &self,
        tenant_id: &str,
        principal_id: &str,
        kind: InterventionKind,
    ) -> Result<Vec<WebhookEndpoint>, PortError>;
    async fn revoke(
        &self,
        tenant_id: &str,
        principal_id: &str,
        endpoint_id: &str,
        now_ms: u64,
    ) -> Result<bool, PortError>;
}
/// Outbound HTTP egress. The dev adapter only records requests; a real HTTP
/// adapter is gated behind explicit egress policy (ADR-0010).
#[async_trait]
pub trait HttpEgress: Send + Sync {
    async fn post(
        &self,
        url: &str,
        body: &str,
        headers: &[(String, String)],
    ) -> Result<(), PortError>;
    /// POST that returns the response body (ADR-0012 inference path).
    /// Default refuses: recording egress must never fabricate a provider
    /// response, so gateways built on top fail closed unless a real
    /// transport implements this.
    async fn post_and_receive(
        &self,
        url: &str,
        body: &str,
        headers: &[(String, String)],
    ) -> Result<String, PortError> {
        let _ = (url, body, headers);
        Err(PortError::Unavailable)
    }
    /// GET that returns the response body (OIDC/JWKS public-key retrieval).
    /// Default refuses for the same reason: recording egress must never
    /// fabricate key material.
    async fn get(&self, url: &str, headers: &[(String, String)]) -> Result<String, PortError> {
        let _ = (url, headers);
        Err(PortError::Unavailable)
    }
}
/// Verified caller identity (OIDC/B6). Producing one requires a real
/// signature check against configured key material — dev sessions do NOT
/// go through this path and remain self-declared.
#[async_trait]
pub trait IdentityVerifier: Send + Sync {
    /// Verifies a bearer credential; returns typed claims or refuses.
    async fn verify(&self, token: &str) -> Result<VerifiedIdentity, PortError>;
}
/// Device attestation outcome (seam — no real provider wired yet).
/// `level` honestly reports what the provider actually proved.
#[derive(Debug, Clone)]
pub struct Attestation {
    /// "none" | "os" | "hardware" — anything stronger than none requires a
    /// real platform provider (Play Integrity, DeviceCheck, Windows attestation).
    pub level: String,
    pub provider: String,
}
/// Device attestation port. Implementations prove device integrity claims
/// via platform mechanisms; the Noop adapter always reports `none` so the
/// audit trail records honesty rather than an implied guarantee.
#[async_trait]
pub trait DeviceAttester: Send + Sync {
    async fn attest(&self, device: &Device) -> Result<Attestation, PortError>;
}
/// Unified sensitive-action audit trail. Entries are metadata tombstones:
/// they survive erasure (like deletion receipts) so administrative actions
/// remain provable after the underlying data is gone.
#[async_trait]
pub trait AuditLog: Send + Sync {
    async fn record(&self, event: AuditEvent) -> Result<(), PortError>;
    /// The principal's own audit history (export / `/v1/me/audit`).
    async fn list_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<AuditEvent>, PortError>;
}
/// Remote/local inference boundary (B4/ADR-0012). Implementations decide
/// which `PrivacyMode`s they may serve; the domain never picks providers.
#[async_trait]
pub trait InferenceGateway: Send + Sync {
    /// Typed signals in, typed hypotheses out. Never raw content.
    async fn assess(&self, req: &InferenceRequest) -> Result<InferenceVerdict, PortError>;
    /// Which privacy modes this gateway may serve under the egress policy.
    fn serves(&self, mode: PrivacyMode) -> bool;
}
/// Per-tenant inference budget, micro-USD (integer money). Fail closed:
/// a request that would exceed the cap is refused before any call.
#[async_trait]
pub trait BudgetLedger: Send + Sync {
    async fn spent_micro_usd(&self, tenant_id: &str) -> Result<u64, PortError>;
    async fn cap_micro_usd(&self, tenant_id: &str) -> Result<u64, PortError>;
    async fn record_spend(&self, tenant_id: &str, micro_usd: u64) -> Result<(), PortError>;
}
/// Outcome of an atomic reservation attempt (B21).
#[derive(Debug)]
pub enum ReserveOutcome {
    /// Reservation created (or the identical request_id already held one).
    /// Boxed: the row is much larger than `BudgetExceeded`.
    Reserved(Box<sovir_domain::InferenceReservation>),
    /// spent + pending + estimate would exceed the tenant cap — refused
    /// inside the same transaction that counted, so concurrent callers
    /// cannot both pass.
    BudgetExceeded,
}
/// Durable inference budget reservations. `reserve` is the atomic gate:
/// it checks the cap AND writes the pending row in one transaction,
/// so two simultaneous assess calls cannot both slip under the cap.
/// `settle` commits actual spend + usage accounting; `refund` releases
/// the hold when the gateway fails before producing a verdict.
#[async_trait]
pub trait BudgetReservations: Send + Sync {
    async fn reserve(
        &self,
        tenant_id: &str,
        request_id: &str,
        est_micro_usd: u64,
    ) -> Result<ReserveOutcome, PortError>;
    async fn settle(
        &self,
        tenant_id: &str,
        request_id: &str,
        actual_micro_usd: u64,
        usage: sovir_domain::InferenceUsage,
    ) -> Result<(), PortError>;
    async fn refund(&self, tenant_id: &str, request_id: &str) -> Result<(), PortError>;
    /// Global hygiene: refunds `pending` reservations created at or before
    /// `cutoff_ms` — a crash between reserve and settle must not hold the
    /// tenant's cap forever. Cross-tenant by design; only the scheduled
    /// sweep calls it (privileged path, like other `*_any` ops).
    async fn refund_expired(&self, cutoff_ms: u64) -> Result<u64, PortError>;
}
/// Threat-intel feed boundary (B5). `pull` returns candidate indicators
/// from a configured source; `record`/`list` persist the ones that pass
/// provenance validation in the application layer.
#[async_trait]
pub trait ThreatIntelFeed: Send + Sync {
    async fn pull(&self, since_ms: u64) -> Result<Vec<IntelIndicator>, PortError>;
    async fn record(&self, indicator: IntelIndicator) -> Result<(), PortError>;
    async fn list(&self, tenant_id: &str) -> Result<Vec<IntelIndicator>, PortError>;
}
/// Durable store for completed investigations (B5). Rows are metadata
/// reports (counts + typed hypotheses) — never event payloads.
#[async_trait]
pub trait InvestigationStore: Send + Sync {
    async fn insert(&self, inv: Investigation) -> Result<(), PortError>;
    /// Newest-first history for the calling principal only.
    async fn list_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<Investigation>, PortError>;
}
/// Idempotency-Key store (B10). Scoped by (tenant, principal) so keys of
/// one principal never collide with another's. `put` is insert-once: a
/// replayed key returns the existing record via `get`.
#[async_trait]
pub trait IdempotencyStore: Send + Sync {
    async fn get(
        &self,
        tenant_id: &str,
        principal_id: &str,
        idem_key: &str,
    ) -> Result<Option<IdempotentResponse>, PortError>;
    async fn put(&self, record: IdempotentResponse) -> Result<(), PortError>;
    /// Erasure support: drop the principal's keys on purge.
    async fn delete_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<u64, PortError>;
    /// Global hygiene: hard-delete keys older than `cutoff_ms` across all
    /// tenants — replay windows expire with retention. Cross-tenant by
    /// design; only the scheduled retention sweep calls it.
    async fn delete_expired_any(&self, cutoff_ms: u64) -> Result<u64, PortError>;
}
/// Audit tombstones produced by erasure (B16). Receipts persist after purge;
/// they carry counts and a pseudonymous principal id, never user content.
#[async_trait]
pub trait DeletionReceiptStore: Send + Sync {
    async fn record(&self, receipt: DeletionReceipt) -> Result<(), PortError>;
    async fn list_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<DeletionReceipt>, PortError>;
}
