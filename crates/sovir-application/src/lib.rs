//! Use cases and orchestrated policy checks. No Axum, SQL or model SDK dependencies.
use sovir_domain::{
    validate_consent, validate_event, ConsentGrant, DomainError, EventDecision, ObservedEvent,
};
use sovir_ports::{Clock, ConsentRepository, EventRepository, PortError, RiskAnalyzer};
use std::sync::Arc;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("{0}")]
    Domain(#[from] DomainError),
    #[error("consent grant not found")]
    ConsentNotFound,
    #[error("{0}")]
    Port(#[from] PortError),
    #[error("invalid consent grant")]
    InvalidGrant,
}

#[derive(Clone)]
pub struct SovirService {
    clock: Arc<dyn Clock>,
    grants: Arc<dyn ConsentRepository>,
    events: Arc<dyn EventRepository>,
    risk: Arc<dyn RiskAnalyzer>,
}
impl SovirService {
    pub fn new(
        clock: Arc<dyn Clock>,
        grants: Arc<dyn ConsentRepository>,
        events: Arc<dyn EventRepository>,
        risk: Arc<dyn RiskAnalyzer>,
    ) -> Self {
        Self {
            clock,
            grants,
            events,
            risk,
        }
    }
    pub fn grant(&self, grant: ConsentGrant) -> Result<(), AppError> {
        if grant.grant_id.trim().is_empty()
            || grant.source_id.trim().is_empty()
            || grant.grant_id.len() > 128
            || grant.source_id.len() > 128
            || grant.expires_at_ms <= self.clock.now_ms()
            || grant.revoked
        {
            return Err(AppError::InvalidGrant);
        }
        self.grants.put(grant)?;
        Ok(())
    }
    pub fn revoke(&self, grant_id: &str) -> Result<bool, AppError> {
        Ok(self.grants.revoke(grant_id)?)
    }
    pub fn ingest(&self, event: ObservedEvent) -> Result<EventDecision, AppError> {
        let now = self.clock.now_ms();
        validate_event(&event, now)?;
        let grant = self
            .grants
            .get(&event.consent_grant_id)?
            .ok_or(AppError::ConsentNotFound)?;
        validate_consent(&event, &grant, now)?;
        let assessment = self.risk.analyze(&event);
        let id = event.event_id.clone();
        self.events.insert_once(event)?;
        Ok(EventDecision {
            event_id: id,
            assessment,
            protected_action_executed: false,
        })
    }
}
