//! Interface boundaries. Infrastructure implementations live in adapters.
use sovir_domain::{Assessment, ConsentGrant, Device, Intervention, ObservedEvent, Session};
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
pub trait ConsentRepository: Send + Sync {
    fn get(&self, grant_id: &str) -> Result<Option<ConsentGrant>, PortError>;
    fn put(&self, grant: ConsentGrant) -> Result<(), PortError>;
    fn revoke(&self, grant_id: &str) -> Result<bool, PortError>;
    /// Revokes every grant bound to a device. Returns count revoked.
    fn revoke_by_device(&self, device_id: &str) -> Result<u64, PortError>;
    /// Data governance: every grant owned by a principal (export) and hard
    /// deletion of them (erasure). Returns count affected for delete.
    fn list_by_principal(&self, principal_id: &str) -> Result<Vec<ConsentGrant>, PortError>;
    fn delete_by_principal(&self, principal_id: &str) -> Result<u64, PortError>;
}
pub trait EventRepository: Send + Sync {
    fn insert_once(&self, event: ObservedEvent) -> Result<(), PortError>;
    /// Data governance export/erasure over the principal's stored events.
    /// Stored events are metadata only (digests, classes) — never payloads.
    fn list_by_principal(&self, principal_id: &str) -> Result<Vec<ObservedEvent>, PortError>;
    fn delete_by_principal(&self, principal_id: &str) -> Result<u64, PortError>;
}
pub trait RiskAnalyzer: Send + Sync {
    fn analyze(&self, event: &ObservedEvent) -> Assessment;
}
/// Dev session lifecycle. Tokens are opaque; `resolve` returns the stored
/// session regardless of expiry — expiry/revocation is enforced by
/// `Session::principal(now)` so the decision stays in the domain.
pub trait SessionStore: Send + Sync {
    fn issue(&self, session: Session) -> Result<(), PortError>;
    fn resolve(&self, token: &str) -> Result<Option<Session>, PortError>;
    fn revoke(&self, token: &str) -> Result<bool, PortError>;
    /// Revokes every live session bound to a device. Returns count revoked.
    fn revoke_by_device(&self, device_id: &str) -> Result<u64, PortError>;
    /// Revokes every live session of a principal (used by erasure).
    fn revoke_by_principal(&self, principal_id: &str) -> Result<u64, PortError>;
}
/// Device inventory scoped by principal. A device record is never
/// self-declared proof of authorization; registration only records inventory.
pub trait DeviceRegistry: Send + Sync {
    fn register(&self, device: Device) -> Result<(), PortError>;
    fn get(&self, principal_id: &str, device_id: &str) -> Result<Option<Device>, PortError>;
    fn list(&self, principal_id: &str) -> Result<Vec<Device>, PortError>;
    fn touch_seen(&self, principal_id: &str, device_id: &str, now_ms: u64)
        -> Result<(), PortError>;
    fn revoke(&self, principal_id: &str, device_id: &str, now_ms: u64) -> Result<bool, PortError>;
}
/// Durable-ish queue of interventions awaiting delivery. State transitions,
/// retry scheduling and audit entries are applied by the application layer;
/// the sink only stores what it is given.
pub trait InterventionSink: Send + Sync {
    fn enqueue(&self, intervention: Intervention) -> Result<(), PortError>;
    fn due(&self, now_ms: u64, limit: usize) -> Result<Vec<Intervention>, PortError>;
    fn list(&self, principal_id: &str) -> Result<Vec<Intervention>, PortError>;
    fn update(&self, intervention: Intervention) -> Result<(), PortError>;
    /// Data governance: hard deletion of the principal's intervention records.
    fn delete_by_principal(&self, principal_id: &str) -> Result<u64, PortError>;
}
/// The actual delivery surface (notification, banner, inbox). The dev
/// adapter records attempts in memory; real channels are platform adapters.
pub trait DeliveryChannel: Send + Sync {
    fn send(&self, intervention: &Intervention) -> Result<(), PortError>;
}
