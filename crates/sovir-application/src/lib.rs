//! Use cases and orchestrated policy checks. No Axum, SQL or model SDK dependencies.
use sovir_domain::{
    intervention_for, next_attempt_ms, valid_identifier, validate_consent, validate_device,
    validate_event, ConsentGrant, DeliveryAuditEntry, DeliveryState, Device, DomainError,
    EventDecision, Intervention, ObservedEvent, Platform, Principal, Scope, Session,
    MAX_DELIVERY_ATTEMPTS,
};
use sovir_ports::{
    Clock, ConsentRepository, DeliveryChannel, DeviceRegistry, EventRepository, InterventionSink,
    PortError, RiskAnalyzer, SessionStore,
};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use thiserror::Error;

/// Development sessions are short-lived; production session TTL is a separate decision.
const DEV_SESSION_TTL_MS: u64 = 15 * 60 * 1000;

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
    #[error("invalid session or device request")]
    InvalidRequest,
    #[error("missing, expired or revoked session")]
    Unauthorized,
    #[error("session lacks the required scope")]
    Forbidden,
    #[error("device is revoked")]
    DeviceRevoked,
}

/// All port implementations the service depends on, injected by the adapter
/// layer (or test doubles).
pub struct ServicePorts {
    pub grants: Arc<dyn ConsentRepository>,
    pub events: Arc<dyn EventRepository>,
    pub risk: Arc<dyn RiskAnalyzer>,
    pub sessions: Arc<dyn SessionStore>,
    pub devices: Arc<dyn DeviceRegistry>,
    pub sink: Arc<dyn InterventionSink>,
    pub channel: Arc<dyn DeliveryChannel>,
}

#[derive(Clone)]
pub struct SovirService {
    clock: Arc<dyn Clock>,
    grants: Arc<dyn ConsentRepository>,
    events: Arc<dyn EventRepository>,
    risk: Arc<dyn RiskAnalyzer>,
    sessions: Arc<dyn SessionStore>,
    devices: Arc<dyn DeviceRegistry>,
    sink: Arc<dyn InterventionSink>,
    channel: Arc<dyn DeliveryChannel>,
    id_counter: Arc<AtomicU64>,
}
impl SovirService {
    pub fn new(clock: Arc<dyn Clock>, ports: ServicePorts) -> Self {
        Self {
            clock,
            grants: ports.grants,
            events: ports.events,
            risk: ports.risk,
            sessions: ports.sessions,
            devices: ports.devices,
            sink: ports.sink,
            channel: ports.channel,
            id_counter: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Dev-only token/id derivation: hash of clock + counter + inputs. NOT
    /// cryptographic; acceptable only because the API is loopback-bound and
    /// development-only (see ADR-0006).
    fn dev_token(&self, prefix: &str, parts: &[&str]) -> String {
        let n = self.id_counter.fetch_add(1, Ordering::Relaxed);
        let mut h = DefaultHasher::new();
        self.clock.now_ms().hash(&mut h);
        n.hash(&mut h);
        for p in parts {
            p.hash(&mut h);
        }
        format!("{prefix}-{:016x}", h.finish())
    }

    /// Issues a short-lived development session for a synthetic principal.
    /// If the device is registered it must belong to the principal and be active.
    pub fn issue_dev_session(
        &self,
        principal_id: &str,
        device_id: &str,
    ) -> Result<Session, AppError> {
        if !valid_identifier(principal_id) || !valid_identifier(device_id) {
            return Err(AppError::InvalidRequest);
        }
        if let Some(d) = self.devices.get(principal_id, device_id)? {
            if !d.is_active() {
                return Err(AppError::DeviceRevoked);
            }
        }
        let now = self.clock.now_ms();
        let session = Session {
            token: self.dev_token("svt", &[principal_id, device_id]),
            session_id: self.dev_token("ses", &[principal_id, device_id]),
            principal_id: principal_id.to_string(),
            // Dev sessions run in a single synthetic tenant; tenant isolation is
            // not implemented (see B21_PLATFORM_STATUS).
            tenant_id: "dev".to_string(),
            device_id: device_id.to_string(),
            scopes: vec![
                Scope::ConsentWrite,
                Scope::EventsWrite,
                Scope::DevicesWrite,
                Scope::SessionsWrite,
            ],
            expires_at_ms: now.saturating_add(DEV_SESSION_TTL_MS),
            revoked: false,
        };
        self.sessions.issue(session.clone())?;
        Ok(session)
    }

    /// Resolves a bearer token to a Principal. Fails closed on unknown,
    /// expired or revoked sessions, and on revoked registered devices.
    pub fn authenticate(&self, token: &str) -> Result<Principal, AppError> {
        let session = self
            .sessions
            .resolve(token)?
            .ok_or(AppError::Unauthorized)?;
        let principal = session
            .principal(self.clock.now_ms())
            .ok_or(AppError::Unauthorized)?;
        if let Some(d) = self
            .devices
            .get(&principal.principal_id, &principal.device_id)?
        {
            if !d.is_active() {
                return Err(AppError::DeviceRevoked);
            }
        }
        Ok(principal)
    }

    pub fn logout(&self, token: &str) -> Result<bool, AppError> {
        Ok(self.sessions.revoke(token)?)
    }

    pub fn register_device(
        &self,
        principal: &Principal,
        device_id: Option<&str>,
        platform: Platform,
        label: &str,
    ) -> Result<Device, AppError> {
        if !principal.has_scope(Scope::DevicesWrite) {
            return Err(AppError::Forbidden);
        }
        let now = self.clock.now_ms();
        let device = Device {
            device_id: device_id
                .map(str::to_string)
                .unwrap_or_else(|| self.dev_token("dev", &[&principal.principal_id, label])),
            principal_id: principal.principal_id.clone(),
            platform,
            label: label.to_string(),
            registered_at_ms: now,
            last_seen_at_ms: None,
            revoked_at_ms: None,
        };
        validate_device(&device)?;
        self.devices.register(device.clone())?;
        Ok(device)
    }

    pub fn list_devices(&self, principal: &Principal) -> Result<Vec<Device>, AppError> {
        Ok(self.devices.list(&principal.principal_id)?)
    }

    /// Revokes the device, every session bound to it and every consent grant
    /// bound to it. Revocation fails closed: after this call the device can
    /// neither authenticate nor ingest.
    pub fn revoke_device(&self, principal: &Principal, device_id: &str) -> Result<bool, AppError> {
        if !principal.has_scope(Scope::DevicesWrite) {
            return Err(AppError::Forbidden);
        }
        let revoked =
            self.devices
                .revoke(&principal.principal_id, device_id, self.clock.now_ms())?;
        if revoked {
            self.sessions.revoke_by_device(device_id)?;
            self.grants.revoke_by_device(device_id)?;
        }
        Ok(revoked)
    }

    /// Records a consent grant bound to the authenticated principal and device.
    /// The binding is sealed here; client-supplied binding fields are ignored
    /// at deserialization (`skip_deserializing`).
    pub fn grant(&self, principal: &Principal, mut grant: ConsentGrant) -> Result<(), AppError> {
        if !principal.has_scope(Scope::ConsentWrite) {
            return Err(AppError::Forbidden);
        }
        grant.principal_id = principal.principal_id.clone();
        grant.device_id = principal.device_id.clone();
        if !valid_identifier(&grant.grant_id)
            || !valid_identifier(&grant.source_id)
            || grant.expires_at_ms <= self.clock.now_ms()
            || grant.revoked
        {
            return Err(AppError::InvalidGrant);
        }
        self.grants.put(grant)?;
        Ok(())
    }
    pub fn revoke(&self, principal: &Principal, grant_id: &str) -> Result<bool, AppError> {
        if !principal.has_scope(Scope::ConsentWrite) {
            return Err(AppError::Forbidden);
        }
        // Only the owning principal may revoke: verify binding first.
        match self.grants.get(grant_id)? {
            Some(g) if g.principal_id == principal.principal_id => {
                Ok(self.grants.revoke(grant_id)?)
            }
            Some(_) => Err(AppError::Forbidden),
            None => Ok(false),
        }
    }
    /// Seals the event with the session's principal/device binding, then
    /// enforces the consent invariant (grant scope + same binding) before
    /// analysis and dedup-insert.
    pub fn ingest(
        &self,
        principal: &Principal,
        mut event: ObservedEvent,
    ) -> Result<EventDecision, AppError> {
        if !principal.has_scope(Scope::EventsWrite) {
            return Err(AppError::Forbidden);
        }
        event.principal_id = principal.principal_id.clone();
        event.device_id = principal.device_id.clone();
        let now = self.clock.now_ms();
        validate_event(&event, now)?;
        let grant = self
            .grants
            .get(&event.consent_grant_id)?
            .ok_or(AppError::ConsentNotFound)?;
        validate_consent(&event, &grant, now)?;
        self.devices
            .touch_seen(&principal.principal_id, &principal.device_id, now)?;
        let assessment = self.risk.analyze(&event);
        let id = event.event_id.clone();
        self.events.insert_once(event)?;
        let decision = EventDecision {
            event_id: id,
            assessment,
            protected_action_executed: false,
        };
        // Deterministic policy: warn/review decisions enqueue an intervention
        // for the device channel. `Observe` produces nothing; there is no
        // automated block path.
        if let Some(kind) = intervention_for(&decision) {
            let intervention = Intervention {
                intervention_id: self.dev_token("int", &[&decision.event_id]),
                event_id: decision.event_id.clone(),
                principal_id: principal.principal_id.clone(),
                device_id: principal.device_id.clone(),
                kind,
                state: DeliveryState::Pending,
                attempts: 0,
                created_at_ms: now,
                next_attempt_at_ms: now,
                last_error: None,
                audit: vec![],
            };
            self.sink.enqueue(intervention)?;
        }
        Ok(decision)
    }

    pub fn list_interventions(&self, principal: &Principal) -> Result<Vec<Intervention>, AppError> {
        Ok(self.sink.list(&principal.principal_id)?)
    }

    /// Delivers every due intervention through the channel, recording state
    /// transitions and audit entries. Failures reschedule with backoff and
    /// expire after MAX_DELIVERY_ATTEMPTS. Returns the count delivered.
    pub fn dispatch_due(&self, principal: &Principal) -> Result<u64, AppError> {
        if !principal.has_scope(Scope::EventsWrite) {
            return Err(AppError::Forbidden);
        }
        let now = self.clock.now_ms();
        let mut delivered = 0u64;
        for mut i in self.sink.due(now, 50)? {
            if i.principal_id != principal.principal_id {
                continue;
            }
            i.attempts = i.attempts.saturating_add(1);
            let from = i.state;
            match self.channel.send(&i) {
                Ok(()) => {
                    i.state = DeliveryState::Delivered;
                    i.last_error = None;
                    delivered += 1;
                }
                Err(e) => {
                    i.last_error = Some(e.to_string());
                    i.state = if i.attempts >= MAX_DELIVERY_ATTEMPTS {
                        DeliveryState::Expired
                    } else {
                        i.next_attempt_at_ms = next_attempt_ms(i.attempts, now);
                        DeliveryState::Failed
                    };
                }
            }
            i.audit.push(DeliveryAuditEntry {
                at_ms: now,
                from,
                to: i.state,
                detail: i.last_error.clone().unwrap_or_default(),
            });
            self.sink.update(i)?;
        }
        Ok(delivered)
    }
}
