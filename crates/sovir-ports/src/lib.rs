//! Interface boundaries. Infrastructure implementations live in adapters.
use sovir_domain::{Assessment, ConsentGrant, ObservedEvent};
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
}
pub trait EventRepository: Send + Sync {
    fn insert_once(&self, event: ObservedEvent) -> Result<(), PortError>;
}
pub trait RiskAnalyzer: Send + Sync {
    fn analyze(&self, event: &ObservedEvent) -> Assessment;
}
