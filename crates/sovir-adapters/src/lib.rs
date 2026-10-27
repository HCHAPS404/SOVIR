//! In-memory development adapters. NOT durable, tenant-safe or production-ready.
use sovir_domain::{evaluate_signals, Assessment, ConsentGrant, ObservedEvent};
use sovir_ports::{Clock, ConsentRepository, EventRepository, PortError, RiskAnalyzer};
use std::{
    collections::{HashMap, HashSet},
    sync::{Mutex, RwLock},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Default)]
pub struct SystemClock;
impl Clock for SystemClock {
    fn now_ms(&self) -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
            .min(u128::from(u64::MAX)) as u64
    }
}
#[derive(Default)]
pub struct InMemoryConsentRepository(RwLock<HashMap<String, ConsentGrant>>);
impl ConsentRepository for InMemoryConsentRepository {
    fn get(&self, id: &str) -> Result<Option<ConsentGrant>, PortError> {
        self.0
            .read()
            .map(|g| g.get(id).cloned())
            .map_err(|_| PortError::Storage)
    }
    fn put(&self, grant: ConsentGrant) -> Result<(), PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        if guard.contains_key(&grant.grant_id) {
            return Err(PortError::Duplicate);
        }
        guard.insert(grant.grant_id.clone(), grant);
        Ok(())
    }
    fn revoke(&self, id: &str) -> Result<bool, PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        if let Some(grant) = guard.get_mut(id) {
            grant.revoked = true;
            Ok(true)
        } else {
            Ok(false)
        }
    }
}
#[derive(Default)]
pub struct InMemoryEventRepository(Mutex<HashSet<String>>);
impl EventRepository for InMemoryEventRepository {
    fn insert_once(&self, event: ObservedEvent) -> Result<(), PortError> {
        let mut events = self.0.lock().map_err(|_| PortError::Storage)?;
        if events.insert(event.event_id) {
            Ok(())
        } else {
            Err(PortError::Duplicate)
        }
    }
}
#[derive(Default)]
pub struct DeterministicRiskAnalyzer;
impl RiskAnalyzer for DeterministicRiskAnalyzer {
    fn analyze(&self, event: &ObservedEvent) -> Assessment {
        evaluate_signals(&event.signals)
    }
}
