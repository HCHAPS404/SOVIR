//! Interface boundaries. Infrastructure implementations live in adapters.
//! I/O ports are async (ADR-0008); pure compute ports (Clock, RiskAnalyzer)
//! stay synchronous.
//!
//! Tenant isolation (B19): every principal-scoped lookup takes an explicit
//! `tenant_id` so a principal id that collides across tenants can never
//! resolve another tenant's rows. Records carry the sealed tenant binding.
use async_trait::async_trait;
use sovir_domain::{
    Assessment, ConsentGrant, DeletionReceipt, Device, IdempotentResponse, Intervention,
    InterventionKind, ObservedEvent, Session, WebhookEndpoint,
};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum PortError {
    #[error("storage failure")]
    Storage,
    #[error("event already processed")]
    Duplicate,
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
