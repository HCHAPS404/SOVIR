//! In-memory development adapters. NOT durable, tenant-safe or production-ready.
use sovir_domain::{evaluate_signals, Assessment, ConsentGrant, Device, ObservedEvent, Session};
use sovir_ports::{
    Clock, ConsentRepository, DeviceRegistry, EventRepository, PortError, RiskAnalyzer,
    SessionStore,
};
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
    fn revoke_by_device(&self, device_id: &str) -> Result<u64, PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        let mut n = 0u64;
        for g in guard.values_mut() {
            if g.device_id == device_id && !g.revoked {
                g.revoked = true;
                n += 1;
            }
        }
        Ok(n)
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
pub struct InMemorySessionStore(RwLock<HashMap<String, Session>>);
impl SessionStore for InMemorySessionStore {
    fn issue(&self, session: Session) -> Result<(), PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        if guard.contains_key(&session.token) {
            return Err(PortError::Duplicate);
        }
        guard.insert(session.token.clone(), session);
        Ok(())
    }
    fn resolve(&self, token: &str) -> Result<Option<Session>, PortError> {
        self.0
            .read()
            .map(|g| g.get(token).cloned())
            .map_err(|_| PortError::Storage)
    }
    fn revoke(&self, token: &str) -> Result<bool, PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        if let Some(s) = guard.get_mut(token) {
            s.revoked = true;
            Ok(true)
        } else {
            Ok(false)
        }
    }
    fn revoke_by_device(&self, device_id: &str) -> Result<u64, PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        let mut n = 0u64;
        for s in guard.values_mut() {
            if s.device_id == device_id && !s.revoked {
                s.revoked = true;
                n += 1;
            }
        }
        Ok(n)
    }
}
#[derive(Default)]
pub struct InMemoryDeviceRegistry(RwLock<HashMap<(String, String), Device>>);
impl DeviceRegistry for InMemoryDeviceRegistry {
    fn register(&self, device: Device) -> Result<(), PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        let key = (device.principal_id.clone(), device.device_id.clone());
        if guard.contains_key(&key) {
            return Err(PortError::Duplicate);
        }
        guard.insert(key, device);
        Ok(())
    }
    fn get(&self, principal_id: &str, device_id: &str) -> Result<Option<Device>, PortError> {
        self.0
            .read()
            .map(|g| {
                g.get(&(principal_id.to_string(), device_id.to_string()))
                    .cloned()
            })
            .map_err(|_| PortError::Storage)
    }
    fn list(&self, principal_id: &str) -> Result<Vec<Device>, PortError> {
        self.0
            .read()
            .map(|g| {
                let mut v: Vec<Device> = g
                    .values()
                    .filter(|d| d.principal_id == principal_id)
                    .cloned()
                    .collect();
                v.sort_by(|a, b| a.device_id.cmp(&b.device_id));
                v
            })
            .map_err(|_| PortError::Storage)
    }
    fn touch_seen(
        &self,
        principal_id: &str,
        device_id: &str,
        now_ms: u64,
    ) -> Result<(), PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        if let Some(d) = guard.get_mut(&(principal_id.to_string(), device_id.to_string())) {
            d.last_seen_at_ms = Some(now_ms);
        }
        Ok(())
    }
    fn revoke(&self, principal_id: &str, device_id: &str, now_ms: u64) -> Result<bool, PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        if let Some(d) = guard.get_mut(&(principal_id.to_string(), device_id.to_string())) {
            d.revoked_at_ms = Some(now_ms);
            Ok(true)
        } else {
            Ok(false)
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
