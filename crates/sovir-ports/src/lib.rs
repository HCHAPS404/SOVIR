//! Interface boundaries. Infrastructure implementations live in adapters.
use sovir_domain::{Assessment, ConsentGrant, Device, ObservedEvent, Session};
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
}
pub trait EventRepository: Send + Sync {
    fn insert_once(&self, event: ObservedEvent) -> Result<(), PortError>;
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
