//! In-memory development adapters. NOT durable or production-ready.
//! Lookups are scoped by (tenant_id, principal_id) per B19.
use async_trait::async_trait;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use sovir_domain::{
    Assessment, AuditEvent, ConsentGrant, DeletionReceipt, DeliveryState, Device, EventFeedback,
    IdempotentResponse, InferenceReservation, InferenceUsage, Intervention, InterventionKind,
    Investigation, ObservedEvent, PolicyPack, ReservationState, Session, VerifiedIdentity,
    WebhookEndpoint,
};
use sovir_ports::{
    AuditLog, BudgetLedger, Clock, ConsentRepository, DeletionReceiptStore, DeliveryChannel,
    DeviceRegistry, EventRepository, HttpEgress, IdempotencyStore, InferenceGateway,
    InterventionSink, PortError, RiskAnalyzer, SessionStore, ThreatIntelFeed, WebhookRegistry,
};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, RwLock},
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
pub struct InMemoryConsentRepository(RwLock<HashMap<(String, String), ConsentGrant>>);
#[async_trait]
impl ConsentRepository for InMemoryConsentRepository {
    async fn get(
        &self,
        tenant_id: &str,
        grant_id: &str,
    ) -> Result<Option<ConsentGrant>, PortError> {
        self.0
            .read()
            .map(|g| {
                g.get(&(tenant_id.to_string(), grant_id.to_string()))
                    .cloned()
            })
            .map_err(|_| PortError::Storage)
    }
    async fn put(&self, grant: ConsentGrant) -> Result<(), PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        let key = (grant.tenant_id.clone(), grant.grant_id.clone());
        if guard.contains_key(&key) {
            return Err(PortError::Duplicate);
        }
        guard.insert(key, grant);
        Ok(())
    }
    async fn refresh(
        &self,
        tenant_id: &str,
        grant_id: &str,
        principal_id: &str,
        device_id: &str,
        expires_at_ms: u64,
    ) -> Result<bool, PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        match guard.get_mut(&(tenant_id.to_string(), grant_id.to_string())) {
            Some(g) if !g.revoked && g.principal_id == principal_id && g.device_id == device_id => {
                g.expires_at_ms = expires_at_ms;
                Ok(true)
            }
            _ => Ok(false),
        }
    }
    async fn revoke(&self, tenant_id: &str, grant_id: &str) -> Result<bool, PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        if let Some(grant) = guard.get_mut(&(tenant_id.to_string(), grant_id.to_string())) {
            grant.revoked = true;
            Ok(true)
        } else {
            Ok(false)
        }
    }
    async fn revoke_by_device(&self, tenant_id: &str, device_id: &str) -> Result<u64, PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        let mut n = 0u64;
        for g in guard.values_mut() {
            if g.tenant_id == tenant_id && g.device_id == device_id && !g.revoked {
                g.revoked = true;
                n += 1;
            }
        }
        Ok(n)
    }

    async fn list_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<ConsentGrant>, PortError> {
        self.0
            .read()
            .map(|g| {
                g.values()
                    .filter(|x| x.tenant_id == tenant_id && x.principal_id == principal_id)
                    .cloned()
                    .collect()
            })
            .map_err(|_| PortError::Storage)
    }
    async fn delete_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<u64, PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        let before = guard.len();
        guard.retain(|_, g| !(g.tenant_id == tenant_id && g.principal_id == principal_id));
        Ok((before - guard.len()) as u64)
    }
}
#[derive(Default)]
pub struct InMemoryEventRepository {
    events: Mutex<HashMap<String, ObservedEvent>>,
    feedback: Mutex<HashMap<String, EventFeedback>>,
}
#[async_trait]
impl EventRepository for InMemoryEventRepository {
    async fn put_feedback(&self, fb: EventFeedback) -> Result<bool, PortError> {
        let events = self.events.lock().map_err(|_| PortError::Storage)?;
        let owned = events
            .get(&fb.event_id)
            .is_some_and(|e| e.tenant_id == fb.tenant_id && e.principal_id == fb.principal_id);
        if !owned {
            return Ok(false);
        }
        drop(events);
        self.feedback
            .lock()
            .map_err(|_| PortError::Storage)?
            .insert(fb.event_id.clone(), fb);
        Ok(true)
    }
    async fn list_feedback(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<EventFeedback>, PortError> {
        self.feedback
            .lock()
            .map(|f| {
                f.values()
                    .filter(|x| x.tenant_id == tenant_id && x.principal_id == principal_id)
                    .cloned()
                    .collect()
            })
            .map_err(|_| PortError::Storage)
    }
    async fn insert_once(&self, event: ObservedEvent) -> Result<(), PortError> {
        let mut events = self.events.lock().map_err(|_| PortError::Storage)?;
        if events.contains_key(&event.event_id) {
            return Err(PortError::Duplicate);
        }
        events.insert(event.event_id.clone(), event);
        Ok(())
    }
    async fn list_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<ObservedEvent>, PortError> {
        self.events
            .lock()
            .map(|e| {
                e.values()
                    .filter(|x| x.tenant_id == tenant_id && x.principal_id == principal_id)
                    .cloned()
                    .collect()
            })
            .map_err(|_| PortError::Storage)
    }
    async fn delete_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<u64, PortError> {
        let mut events = self.events.lock().map_err(|_| PortError::Storage)?;
        let before = events.len();
        events.retain(|_, e| !(e.tenant_id == tenant_id && e.principal_id == principal_id));
        let deleted = (before - events.len()) as u64;
        // FK-cascade equivalent: feedback rows die with their events.
        self.feedback
            .lock()
            .map_err(|_| PortError::Storage)?
            .retain(|id, _| events.contains_key(id));
        Ok(deleted)
    }
    async fn delete_older_than(
        &self,
        tenant_id: &str,
        principal_id: &str,
        cutoff_ms: u64,
    ) -> Result<u64, PortError> {
        let mut events = self.events.lock().map_err(|_| PortError::Storage)?;
        let before = events.len();
        events.retain(|_, e| {
            !(e.tenant_id == tenant_id && e.principal_id == principal_id)
                || e.observed_at_ms >= cutoff_ms
        });
        Ok((before - events.len()) as u64)
    }
    async fn delete_older_than_any(&self, cutoff_ms: u64) -> Result<u64, PortError> {
        let mut events = self.events.lock().map_err(|_| PortError::Storage)?;
        let before = events.len();
        events.retain(|_, e| e.observed_at_ms >= cutoff_ms);
        Ok((before - events.len()) as u64)
    }
    async fn list_recent(
        &self,
        tenant_id: &str,
        principal_id: &str,
        since_ms: u64,
    ) -> Result<Vec<ObservedEvent>, PortError> {
        self.events
            .lock()
            .map(|e| {
                e.values()
                    .filter(|x| {
                        x.tenant_id == tenant_id
                            && x.principal_id == principal_id
                            && x.observed_at_ms >= since_ms
                    })
                    .cloned()
                    .collect()
            })
            .map_err(|_| PortError::Storage)
    }
}
#[derive(Default)]
pub struct InMemorySessionStore(RwLock<HashMap<String, Session>>);
#[async_trait]
impl SessionStore for InMemorySessionStore {
    async fn issue(&self, session: Session) -> Result<(), PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        if guard.contains_key(&session.token) {
            return Err(PortError::Duplicate);
        }
        guard.insert(session.token.clone(), session);
        Ok(())
    }
    async fn resolve(&self, token: &str) -> Result<Option<Session>, PortError> {
        self.0
            .read()
            .map(|g| g.get(token).cloned())
            .map_err(|_| PortError::Storage)
    }
    async fn revoke(&self, token: &str) -> Result<bool, PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        if let Some(s) = guard.get_mut(token) {
            s.revoked = true;
            Ok(true)
        } else {
            Ok(false)
        }
    }
    async fn revoke_by_device(&self, tenant_id: &str, device_id: &str) -> Result<u64, PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        let mut n = 0u64;
        for s in guard.values_mut() {
            if s.tenant_id == tenant_id && s.device_id == device_id && !s.revoked {
                s.revoked = true;
                n += 1;
            }
        }
        Ok(n)
    }

    async fn revoke_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<u64, PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        let mut n = 0u64;
        for s in guard.values_mut() {
            if s.tenant_id == tenant_id && s.principal_id == principal_id && !s.revoked {
                s.revoked = true;
                n += 1;
            }
        }
        Ok(n)
    }
    async fn delete_expired(&self, now_ms: u64) -> Result<u64, PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        let before = guard.len();
        guard.retain(|_, s| s.expires_at_ms > now_ms);
        Ok((before - guard.len()) as u64)
    }
}
type DeviceKey = (String, String, String);
fn device_key(tenant_id: &str, principal_id: &str, device_id: &str) -> DeviceKey {
    (
        tenant_id.to_string(),
        principal_id.to_string(),
        device_id.to_string(),
    )
}
#[derive(Default)]
pub struct InMemoryDeviceRegistry(RwLock<HashMap<DeviceKey, Device>>);
#[async_trait]
impl DeviceRegistry for InMemoryDeviceRegistry {
    async fn register(&self, device: Device) -> Result<(), PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        let key = device_key(&device.tenant_id, &device.principal_id, &device.device_id);
        if guard.contains_key(&key) {
            return Err(PortError::Duplicate);
        }
        guard.insert(key, device);
        Ok(())
    }
    async fn get(
        &self,
        tenant_id: &str,
        principal_id: &str,
        device_id: &str,
    ) -> Result<Option<Device>, PortError> {
        self.0
            .read()
            .map(|g| {
                g.get(&device_key(tenant_id, principal_id, device_id))
                    .cloned()
            })
            .map_err(|_| PortError::Storage)
    }
    async fn list(&self, tenant_id: &str, principal_id: &str) -> Result<Vec<Device>, PortError> {
        self.0
            .read()
            .map(|g| {
                let mut v: Vec<Device> = g
                    .values()
                    .filter(|d| d.tenant_id == tenant_id && d.principal_id == principal_id)
                    .cloned()
                    .collect();
                v.sort_by(|a, b| a.device_id.cmp(&b.device_id));
                v
            })
            .map_err(|_| PortError::Storage)
    }
    async fn touch_seen(
        &self,
        tenant_id: &str,
        principal_id: &str,
        device_id: &str,
        now_ms: u64,
    ) -> Result<(), PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        if let Some(d) = guard.get_mut(&device_key(tenant_id, principal_id, device_id)) {
            d.last_seen_at_ms = Some(now_ms);
        }
        Ok(())
    }
    async fn revoke(
        &self,
        tenant_id: &str,
        principal_id: &str,
        device_id: &str,
        now_ms: u64,
    ) -> Result<bool, PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        if let Some(d) = guard.get_mut(&device_key(tenant_id, principal_id, device_id)) {
            d.revoked_at_ms = Some(now_ms);
            Ok(true)
        } else {
            Ok(false)
        }
    }
    async fn scrub_label(
        &self,
        tenant_id: &str,
        principal_id: &str,
        device_id: &str,
    ) -> Result<u64, PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        if let Some(d) = guard.get_mut(&device_key(tenant_id, principal_id, device_id)) {
            if d.label != "[redacted]" {
                d.label = "[redacted]".to_string();
                return Ok(1);
            }
        }
        Ok(0)
    }
}
#[derive(Default)]
pub struct InMemoryInterventionSink(RwLock<HashMap<String, Intervention>>);
#[async_trait]
impl InterventionSink for InMemoryInterventionSink {
    async fn enqueue(&self, intervention: Intervention) -> Result<(), PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        if guard.contains_key(&intervention.intervention_id) {
            return Err(PortError::Duplicate);
        }
        guard.insert(intervention.intervention_id.clone(), intervention);
        Ok(())
    }
    async fn due(&self, now_ms: u64, limit: usize) -> Result<Vec<Intervention>, PortError> {
        self.0
            .read()
            .map(|g| {
                let mut v: Vec<Intervention> = g
                    .values()
                    .filter(|i| {
                        matches!(i.state, DeliveryState::Pending | DeliveryState::Failed)
                            && i.next_attempt_at_ms <= now_ms
                    })
                    .cloned()
                    .collect();
                v.sort_by_key(|a| a.next_attempt_at_ms);
                v.truncate(limit);
                v
            })
            .map_err(|_| PortError::Storage)
    }
    async fn due_any(&self, now_ms: u64, limit: usize) -> Result<Vec<Intervention>, PortError> {
        self.due(now_ms, limit).await
    }
    async fn list(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<Intervention>, PortError> {
        self.0
            .read()
            .map(|g| {
                let mut v: Vec<Intervention> = g
                    .values()
                    .filter(|i| i.tenant_id == tenant_id && i.principal_id == principal_id)
                    .cloned()
                    .collect();
                v.sort_by_key(|a| a.created_at_ms);
                v
            })
            .map_err(|_| PortError::Storage)
    }
    async fn update(&self, intervention: Intervention) -> Result<(), PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        guard.insert(intervention.intervention_id.clone(), intervention);
        Ok(())
    }
    async fn delete_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<u64, PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        let before = guard.len();
        guard.retain(|_, i| !(i.tenant_id == tenant_id && i.principal_id == principal_id));
        Ok((before - guard.len()) as u64)
    }
    async fn list_by_device(
        &self,
        tenant_id: &str,
        device_id: &str,
    ) -> Result<Vec<Intervention>, PortError> {
        self.0
            .read()
            .map(|g| {
                let mut v: Vec<Intervention> = g
                    .values()
                    .filter(|i| {
                        i.tenant_id == tenant_id
                            && i.device_id == device_id
                            && matches!(i.state, DeliveryState::Pending | DeliveryState::Failed)
                    })
                    .cloned()
                    .collect();
                v.sort_by_key(|i| i.created_at_ms);
                v
            })
            .map_err(|_| PortError::Storage)
    }
    async fn delete_terminal_older_than(
        &self,
        tenant_id: &str,
        principal_id: &str,
        cutoff_ms: u64,
    ) -> Result<u64, PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        let before = guard.len();
        guard.retain(|_, i| {
            !(i.tenant_id == tenant_id && i.principal_id == principal_id)
                || i.created_at_ms >= cutoff_ms
                || matches!(i.state, DeliveryState::Pending | DeliveryState::Failed)
        });
        Ok((before - guard.len()) as u64)
    }
    async fn delete_terminal_older_than_any(&self, cutoff_ms: u64) -> Result<u64, PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        let before = guard.len();
        guard.retain(|_, i| {
            i.created_at_ms >= cutoff_ms
                || matches!(i.state, DeliveryState::Pending | DeliveryState::Failed)
        });
        Ok((before - guard.len()) as u64)
    }
}
/// Audit tombstones from erasure (B16).
#[derive(Default)]
pub struct InMemoryDeletionReceiptStore(RwLock<Vec<DeletionReceipt>>);
#[async_trait]
impl DeletionReceiptStore for InMemoryDeletionReceiptStore {
    async fn record(&self, receipt: DeletionReceipt) -> Result<(), PortError> {
        self.0
            .write()
            .map_err(|_| PortError::Storage)?
            .push(receipt);
        Ok(())
    }
    async fn list_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<DeletionReceipt>, PortError> {
        self.0
            .read()
            .map(|g| {
                g.iter()
                    .filter(|r| r.tenant_id == tenant_id && r.principal_id == principal_id)
                    .cloned()
                    .collect()
            })
            .map_err(|_| PortError::Storage)
    }
}
/// Unified sensitive-action audit trail (in-memory dev adapter).
#[derive(Default)]
pub struct InMemoryAuditLog(RwLock<Vec<AuditEvent>>);
#[async_trait]
impl AuditLog for InMemoryAuditLog {
    async fn record(&self, event: AuditEvent) -> Result<(), PortError> {
        self.0.write().map_err(|_| PortError::Storage)?.push(event);
        Ok(())
    }
    async fn list_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<AuditEvent>, PortError> {
        self.0
            .read()
            .map(|g| {
                g.iter()
                    .filter(|a| a.tenant_id == tenant_id && a.principal_id == principal_id)
                    .cloned()
                    .collect()
            })
            .map_err(|_| PortError::Storage)
    }
}
/// Idempotency-Key store, scoped by (tenant, principal, key) (B10/B19).
#[derive(Default)]
pub struct InMemoryIdempotencyStore(RwLock<HashMap<(String, String, String), IdempotentResponse>>);
#[async_trait]
impl IdempotencyStore for InMemoryIdempotencyStore {
    async fn get(
        &self,
        tenant_id: &str,
        principal_id: &str,
        idem_key: &str,
    ) -> Result<Option<IdempotentResponse>, PortError> {
        self.0
            .read()
            .map(|g| {
                g.get(&(
                    tenant_id.to_string(),
                    principal_id.to_string(),
                    idem_key.to_string(),
                ))
                .cloned()
            })
            .map_err(|_| PortError::Storage)
    }
    async fn put(&self, record: IdempotentResponse) -> Result<(), PortError> {
        self.0.write().map_err(|_| PortError::Storage)?.insert(
            (
                record.tenant_id.clone(),
                record.principal_id.clone(),
                record.idem_key.clone(),
            ),
            record,
        );
        Ok(())
    }
    async fn delete_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<u64, PortError> {
        let mut g = self.0.write().map_err(|_| PortError::Storage)?;
        let before = g.len();
        g.retain(|(t, p, _), _| t != tenant_id || p != principal_id);
        Ok((before - g.len()) as u64)
    }
    async fn delete_expired_any(&self, cutoff_ms: u64) -> Result<u64, PortError> {
        let mut g = self.0.write().map_err(|_| PortError::Storage)?;
        let before = g.len();
        g.retain(|_, r| r.created_at_ms > cutoff_ms);
        Ok((before - g.len()) as u64)
    }
}
/// Development channel: pretends delivery always succeeds and keeps a count.
/// Real delivery surfaces (OS notification, inbox) are platform adapters.
#[derive(Default)]
pub struct RecordingDeliveryChannel(pub Mutex<Vec<String>>);
#[async_trait]
impl DeliveryChannel for RecordingDeliveryChannel {
    async fn send(&self, intervention: &Intervention) -> Result<(), PortError> {
        self.0
            .lock()
            .map_err(|_| PortError::Storage)?
            .push(intervention.intervention_id.clone());
        Ok(())
    }
}
/// Fans a delivery out to several channels; the first failure aborts with
/// error so the retry policy reschedules.
pub struct CompositeDeliveryChannel(pub Vec<std::sync::Arc<dyn DeliveryChannel>>);
#[async_trait]
impl DeliveryChannel for CompositeDeliveryChannel {
    async fn send(&self, intervention: &Intervention) -> Result<(), PortError> {
        for c in &self.0 {
            c.send(intervention).await?;
        }
        Ok(())
    }
}
#[derive(Default)]
pub struct InMemoryWebhookRegistry(RwLock<HashMap<String, WebhookEndpoint>>);
#[async_trait]
impl WebhookRegistry for InMemoryWebhookRegistry {
    async fn register(&self, endpoint: WebhookEndpoint) -> Result<(), PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        if guard.contains_key(&endpoint.endpoint_id) {
            return Err(PortError::Duplicate);
        }
        guard.insert(endpoint.endpoint_id.clone(), endpoint);
        Ok(())
    }
    async fn list(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<WebhookEndpoint>, PortError> {
        self.0
            .read()
            .map(|g| {
                let mut v: Vec<WebhookEndpoint> = g
                    .values()
                    .filter(|e| e.tenant_id == tenant_id && e.principal_id == principal_id)
                    .cloned()
                    .collect();
                v.sort_by_key(|e| e.created_at_ms);
                v
            })
            .map_err(|_| PortError::Storage)
    }
    async fn matching(
        &self,
        tenant_id: &str,
        principal_id: &str,
        kind: InterventionKind,
    ) -> Result<Vec<WebhookEndpoint>, PortError> {
        self.0
            .read()
            .map(|g| {
                g.values()
                    .filter(|e| {
                        e.tenant_id == tenant_id
                            && e.principal_id == principal_id
                            && e.is_active()
                            && e.kinds.contains(&kind)
                    })
                    .cloned()
                    .collect()
            })
            .map_err(|_| PortError::Storage)
    }
    async fn revoke(
        &self,
        tenant_id: &str,
        principal_id: &str,
        endpoint_id: &str,
        now_ms: u64,
    ) -> Result<bool, PortError> {
        let mut guard = self.0.write().map_err(|_| PortError::Storage)?;
        if let Some(e) = guard.get_mut(endpoint_id) {
            if e.tenant_id != tenant_id || e.principal_id != principal_id {
                return Ok(false);
            }
            e.revoked_at_ms = Some(now_ms);
            Ok(true)
        } else {
            Ok(false)
        }
    }
}
/// Dev egress: records every would-be request. No network calls are made.
#[derive(Debug, Clone)]
pub struct RecordedRequest {
    pub url: String,
    pub body: String,
    pub headers: Vec<(String, String)>,
}
#[derive(Default)]
pub struct RecordingHttpEgress(pub Mutex<Vec<RecordedRequest>>);
#[async_trait]
impl HttpEgress for RecordingHttpEgress {
    async fn post(
        &self,
        url: &str,
        body: &str,
        headers: &[(String, String)],
    ) -> Result<(), PortError> {
        self.0
            .lock()
            .map_err(|_| PortError::Storage)?
            .push(RecordedRequest {
                url: url.to_string(),
                body: body.to_string(),
                headers: headers.to_vec(),
            });
        Ok(())
    }
}
type HmacSha256 = Hmac<Sha256>;
/// DeliveryChannel that POSTs signed intervention payloads to matching
/// webhook endpoints. Signing: HMAC-SHA256 over the exact body, sent as
/// `x-sovir-signature: sha256=<hex>`.
pub struct WebhookChannel {
    registry: std::sync::Arc<dyn WebhookRegistry>,
    egress: std::sync::Arc<dyn HttpEgress>,
}
impl WebhookChannel {
    pub fn new(
        registry: std::sync::Arc<dyn WebhookRegistry>,
        egress: std::sync::Arc<dyn HttpEgress>,
    ) -> Self {
        Self { registry, egress }
    }
    pub fn sign(secret: &str, body: &str) -> String {
        let mut mac =
            HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepts keys of any size");
        mac.update(body.as_bytes());
        hex::encode(mac.finalize().into_bytes())
    }
}
#[async_trait]
impl DeliveryChannel for WebhookChannel {
    async fn send(&self, intervention: &Intervention) -> Result<(), PortError> {
        let endpoints = self
            .registry
            .matching(
                &intervention.tenant_id,
                &intervention.principal_id,
                intervention.kind,
            )
            .await?;
        if endpoints.is_empty() {
            return Ok(());
        }
        let body = serde_json::json!({
            "intervention_id": intervention.intervention_id,
            "event_id": intervention.event_id,
            "kind": intervention.kind,
            "principal_id": intervention.principal_id,
            "device_id": intervention.device_id,
            "created_at_ms": intervention.created_at_ms,
        })
        .to_string();
        for ep in endpoints {
            let sig = Self::sign(&ep.secret, &body);
            self.egress
                .post(
                    &ep.url,
                    &body,
                    &[
                        ("content-type".to_string(), "application/json".to_string()),
                        ("x-sovir-signature".to_string(), format!("sha256={sig}")),
                    ],
                )
                .await?;
        }
        Ok(())
    }
}
/// Signal evaluator backed by a versioned `PolicyPack` (ADR-0011).
/// Defaults to the built-in dev pack; a loaded pack can be injected for
/// eval or future config-driven deployments.
pub struct DeterministicRiskAnalyzer {
    pub pack: PolicyPack,
}
impl Default for DeterministicRiskAnalyzer {
    fn default() -> Self {
        Self {
            pack: PolicyPack::dev_pack(),
        }
    }
}
impl DeterministicRiskAnalyzer {
    pub fn with_pack(pack: PolicyPack) -> Self {
        Self { pack }
    }
}
impl RiskAnalyzer for DeterministicRiskAnalyzer {
    fn analyze(&self, event: &ObservedEvent) -> Assessment {
        self.pack.evaluate(&event.signals)
    }
}

/// Real HTTP egress (ADR-0010). Only constructed when explicitly enabled;
/// re-validates every URL against the allowlist per request, disables
/// redirects and applies a fixed timeout. Never carries user payloads —
/// callers pass the typed webhook body produced by `WebhookChannel`.
pub struct ReqwestHttpEgress {
    client: reqwest::Client,
    allowed_hosts: Vec<String>,
}
impl ReqwestHttpEgress {
    pub fn new(allowed_hosts: Vec<String>) -> Self {
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .expect("reqwest client build");
        Self {
            client,
            allowed_hosts,
        }
    }
}
#[async_trait]
impl HttpEgress for ReqwestHttpEgress {
    async fn post(
        &self,
        url: &str,
        body: &str,
        headers: &[(String, String)],
    ) -> Result<(), PortError> {
        // Defense in depth: the allowlist is enforced again at send time,
        // not only at endpoint registration.
        sovir_domain::validate_url_for_egress(url, &self.allowed_hosts)
            .map_err(|_| PortError::Storage)?;
        let mut req = self
            .client
            .post(url)
            .body(body.to_string())
            .header(reqwest::header::CONTENT_TYPE, "application/json");
        for (k, v) in headers {
            req = req.header(k.as_str(), v.as_str());
        }
        let res = req.send().await.map_err(|_| PortError::Storage)?;
        if res.status().is_success() {
            Ok(())
        } else {
            Err(PortError::Storage)
        }
    }
    async fn post_and_receive(
        &self,
        url: &str,
        body: &str,
        headers: &[(String, String)],
    ) -> Result<String, PortError> {
        sovir_domain::validate_url_for_egress(url, &self.allowed_hosts)
            .map_err(|_| PortError::Storage)?;
        let mut req = self
            .client
            .post(url)
            // Inference calls to reasoning models need headroom the client-wide
            // 5s cap can't give (muse-spark reasons ~10s before answering).
            // Webhook fan-out keeps the short client timeout.
            .timeout(std::time::Duration::from_secs(30))
            .body(body.to_string())
            .header(reqwest::header::CONTENT_TYPE, "application/json");
        for (k, v) in headers {
            req = req.header(k.as_str(), v.as_str());
        }
        let res = req.send().await.map_err(|_| PortError::Storage)?;
        if !res.status().is_success() {
            return Err(PortError::Unavailable);
        }
        res.text().await.map_err(|_| PortError::Storage)
    }
    async fn get(&self, url: &str, headers: &[(String, String)]) -> Result<String, PortError> {
        sovir_domain::validate_url_for_egress(url, &self.allowed_hosts)
            .map_err(|_| PortError::Storage)?;
        let mut req = self.client.get(url);
        for (k, v) in headers {
            req = req.header(k.as_str(), v.as_str());
        }
        let res = req.send().await.map_err(|_| PortError::Storage)?;
        if !res.status().is_success() {
            return Err(PortError::Unavailable);
        }
        res.text().await.map_err(|_| PortError::Storage)
    }
}
/// OIDC seam (B6): verifies JWT bearer credentials against a JWKS document
/// fetched through the controlled egress port (allowlisted GET, public key
/// material only — no API key or client secret is involved). Verifies
/// signature, `kid` selection, allowed algorithms, issuer, audience and
/// expiry; tenant/principal come ONLY from validated claims — never from
/// client-supplied fields. This is a seam, not a finished authn story:
/// claim→scope mapping, key-rotation policy and the identity-provider
/// decision remain maintainer decisions (ADR-0013).
pub struct JwksIdentityVerifier {
    jwks_url: String,
    issuer: String,
    audience: String,
    /// Claim carrying tenant binding (e.g. "tenant_id" or an org claim).
    tenant_claim: String,
    /// Claim carrying the subject; defaults to "sub".
    principal_claim: String,
    algorithms: Vec<jsonwebtoken::Algorithm>,
    egress: Arc<dyn HttpEgress>,
    /// kid → JWK cache. Rotation is pull-based: an unknown kid triggers one
    /// refetch, then fails closed.
    keys: std::sync::RwLock<HashMap<String, jsonwebtoken::jwk::Jwk>>,
}
impl JwksIdentityVerifier {
    pub fn new(
        jwks_url: impl Into<String>,
        issuer: impl Into<String>,
        audience: impl Into<String>,
        tenant_claim: impl Into<String>,
        principal_claim: impl Into<String>,
        algorithms: Vec<jsonwebtoken::Algorithm>,
        egress: Arc<dyn HttpEgress>,
    ) -> Self {
        Self {
            jwks_url: jwks_url.into(),
            issuer: issuer.into(),
            audience: audience.into(),
            tenant_claim: tenant_claim.into(),
            principal_claim: principal_claim.into(),
            algorithms,
            egress,
            keys: std::sync::RwLock::new(HashMap::new()),
        }
    }
    async fn fetch_jwks(&self) -> Result<Vec<jsonwebtoken::jwk::Jwk>, PortError> {
        let body = self.egress.get(&self.jwks_url, &[]).await?;
        let set: jsonwebtoken::jwk::JwkSet =
            serde_json::from_str(&body).map_err(|_| PortError::Storage)?;
        Ok(set.keys)
    }
    fn cached(&self, kid: &str) -> Option<jsonwebtoken::jwk::Jwk> {
        self.keys.read().ok()?.get(kid).cloned()
    }
}
/// Device attestation seam default: no platform provider configured, so it
/// honestly reports `level: none`. Real providers (Play Integrity,
/// DeviceCheck, Windows attestation) land behind this port per platform.
pub struct NoopAttester;
#[async_trait]
impl sovir_ports::DeviceAttester for NoopAttester {
    async fn attest(&self, _device: &Device) -> Result<sovir_ports::Attestation, PortError> {
        Ok(sovir_ports::Attestation {
            level: "none".to_string(),
            provider: "noop".to_string(),
        })
    }
}
#[async_trait]
impl sovir_ports::IdentityVerifier for JwksIdentityVerifier {
    async fn verify(&self, token: &str) -> Result<VerifiedIdentity, PortError> {
        let header = jsonwebtoken::decode_header(token).map_err(|_| PortError::Unauthorized)?;
        if !self.algorithms.contains(&header.alg) {
            return Err(PortError::Unauthorized); // alg not allowlisted
        }
        let kid = header.kid.ok_or(PortError::Unauthorized)?;
        // Key lookup: cache first, one refetch on miss (rotation), then fail.
        let jwk = match self.cached(&kid) {
            Some(j) => j,
            None => {
                let fetched = self.fetch_jwks().await?;
                if let Ok(mut keys) = self.keys.write() {
                    for j in fetched.iter().cloned() {
                        if let Some(k) = j.common.key_id.clone() {
                            keys.insert(k, j);
                        }
                    }
                }
                self.cached(&kid).ok_or(PortError::Unauthorized)?
            }
        };
        let key = jsonwebtoken::DecodingKey::from_jwk(&jwk).map_err(|_| PortError::Unauthorized)?;
        let mut validation = jsonwebtoken::Validation::new(header.alg);
        validation.set_issuer(&[&self.issuer]);
        validation.set_audience(&[&self.audience]);
        let claims: serde_json::Map<String, serde_json::Value> =
            jsonwebtoken::decode(token, &key, &validation)
                .map_err(|_| PortError::Unauthorized)?
                .claims;
        let get_str =
            |name: &str| -> Option<String> { claims.get(name)?.as_str().map(str::to_string) };
        let exp = claims
            .get("exp")
            .and_then(serde_json::Value::as_u64)
            .ok_or(PortError::Unauthorized)?;
        Ok(VerifiedIdentity {
            tenant_id: get_str(&self.tenant_claim).ok_or(PortError::Unauthorized)?,
            principal_id: get_str(&self.principal_claim).ok_or(PortError::Unauthorized)?,
            expires_at_ms: exp.saturating_mul(1000),
        })
    }
}
/// Local-only inference adapter (ADR-0012). It can only serve `Private`
/// mode and no local model is installed, so every call honestly refuses.
/// A real local model or a vetted provider would implement this port.
#[derive(Default)]
pub struct LocalOnlyInferenceGateway;
#[async_trait]
impl InferenceGateway for LocalOnlyInferenceGateway {
    async fn assess(
        &self,
        _req: &sovir_domain::InferenceRequest,
    ) -> Result<sovir_domain::InferenceVerdict, PortError> {
        Err(PortError::Unavailable)
    }
    fn serves(&self, mode: sovir_domain::PrivacyMode) -> bool {
        mode == sovir_domain::PrivacyMode::Private
    }
}
/// Local heuristic inference (B4, ADR-0012): a transparent rule table over
/// typed signals that serves `Private` mode with ZERO egress — this is the
/// local-first inference path working end to end. It is NOT an ML model:
/// every hypothesis maps to a documented rule, `model_id` says so, and
/// `provenance` discloses the heuristic origin. A real local model or a
/// vetted provider replaces this adapter without touching the boundary.
/// One row of the weighted evidence table: emit `label` when the summed
/// weights of present signals reach `threshold`.
struct WeightedHypothesis {
    label: &'static str,
    threshold: u16,
    weights: &'static [(sovir_domain::RiskSignal, u16)],
}
#[derive(Default)]
pub struct HeuristicLocalInferenceGateway;
impl HeuristicLocalInferenceGateway {
    /// Weighted evidence model v0.2 (was first-match rules v0.1).
    /// Each row: (hypothesis, emission threshold, [(signal, weight)]).
    /// A hypothesis is emitted when the summed weights of the PRESENT
    /// signals reach the threshold — partial evidence below threshold
    /// stays silent, corroborating signals graduate the score.
    ///
    /// Calibration method (documented in the model card): anchor signals
    /// carry most of a hypothesis's weight so the *required combination*
    /// crosses the threshold while any strict subset cannot; helper
    /// signals add margin. The eval corpus fixes every threshold — the
    /// ambiguous cases (`cred_plus_urgency_no_identity`,
    /// `payment_plus_identity_no_urgency`, `exposure_limit_user_set`)
    /// exist precisely to pin that no strict subset fires.
    /// `USER_DEFINED_EXPOSURE_LIMIT` carries no weight anywhere: it is a
    /// governance signal, never threat evidence.
    const HYPOTHESES: &'static [WeightedHypothesis] = &[
        WeightedHypothesis {
            label: "credential_phishing",
            threshold: 7000,
            weights: &[
                (sovir_domain::RiskSignal::CredentialRequest, 5500),
                (sovir_domain::RiskSignal::IdentityUnverified, 3500),
                (sovir_domain::RiskSignal::UrgentAction, 1000),
                (sovir_domain::RiskSignal::SuspiciousDomain, 1000),
                (sovir_domain::RiskSignal::LinkDestinationMismatch, 1000),
                (sovir_domain::RiskSignal::SeedPhraseRequest, 1500),
                (sovir_domain::RiskSignal::AuthorityImpersonation, 1000),
            ],
        },
        // Fake-link phishing: a deceptive destination alone is not a verdict
        // (mismatch 5500 < 6000); corroborated by an abusive domain or an
        // identity context it graduates.
        WeightedHypothesis {
            label: "link_spoofing",
            threshold: 6000,
            weights: &[
                (sovir_domain::RiskSignal::LinkDestinationMismatch, 5500),
                (sovir_domain::RiskSignal::SuspiciousDomain, 5000),
                (sovir_domain::RiskSignal::IdentityUnverified, 2000),
                (sovir_domain::RiskSignal::CredentialRequest, 1500),
            ],
        },
        // Sextortion/ransom shape: threat language alone stays silent; a
        // payment demand or manufactured urgency is what makes it an attempt.
        WeightedHypothesis {
            label: "extortion_attempt",
            threshold: 7000,
            weights: &[
                (sovir_domain::RiskSignal::ExtortionLanguage, 5000),
                (sovir_domain::RiskSignal::PaymentRequest, 3000),
                (sovir_domain::RiskSignal::UrgentAction, 2000),
                (sovir_domain::RiskSignal::CredentialRequest, 500),
            ],
        },
        // Scareware: a fake infection scare needs an action hook (urgency,
        // credentials, payment or fake authority) to be a lure, not noise.
        WeightedHypothesis {
            label: "scareware_lure",
            threshold: 6000,
            weights: &[
                (sovir_domain::RiskSignal::ScarewareClaim, 4500),
                (sovir_domain::RiskSignal::UrgentAction, 2500),
                (sovir_domain::RiskSignal::CredentialRequest, 2000),
                (sovir_domain::RiskSignal::PaymentRequest, 2000),
                (sovir_domain::RiskSignal::AuthorityImpersonation, 2000),
            ],
        },
        // Wallet theft: asking for a seed/recovery phrase is damning alone —
        // no legitimate webpage requests it.
        WeightedHypothesis {
            label: "seed_phrase_theft",
            threshold: 6500,
            weights: &[(sovir_domain::RiskSignal::SeedPhraseRequest, 7000)],
        },
        // "You won — pay/claim now": prize claim alone stays silent; any
        // monetary or credential hook graduates it to advance-fee fraud.
        WeightedHypothesis {
            label: "prize_advance_fee",
            threshold: 6500,
            weights: &[
                (sovir_domain::RiskSignal::PrizeLotteryClaim, 4500),
                (sovir_domain::RiskSignal::PaymentRequest, 2500),
                (sovir_domain::RiskSignal::HiddenFeePattern, 2000),
                (sovir_domain::RiskSignal::DeliveryCustomsFee, 2000),
                (sovir_domain::RiskSignal::UrgentAction, 2000),
                (sovir_domain::RiskSignal::CredentialRequest, 1500),
            ],
        },
        // Parcel-hold phishing: a customs/delivery fee claim alone is noise;
        // a payment or urgency hook makes it the classic fee phish.
        WeightedHypothesis {
            label: "customs_fee_phish",
            threshold: 6500,
            weights: &[
                (sovir_domain::RiskSignal::DeliveryCustomsFee, 4500),
                (sovir_domain::RiskSignal::PaymentRequest, 3000),
                (sovir_domain::RiskSignal::UrgentAction, 2000),
                (sovir_domain::RiskSignal::PrizeLotteryClaim, 1500),
            ],
        },
        // Guaranteed-returns pitch: the promise alone stays silent; a money
        // or credential ask is what turns it into investment fraud.
        WeightedHypothesis {
            label: "guaranteed_investment",
            threshold: 6500,
            weights: &[
                (sovir_domain::RiskSignal::InvestmentPromise, 4000),
                (sovir_domain::RiskSignal::PaymentRequest, 3000),
                (sovir_domain::RiskSignal::CredentialRequest, 2000),
                (sovir_domain::RiskSignal::UrgentAction, 2000),
                (sovir_domain::RiskSignal::GiftCardPayment, 2000),
            ],
        },
        // Fake authority + a demand (payment, gift card, threat, urgency).
        WeightedHypothesis {
            label: "authority_coercion",
            threshold: 6500,
            weights: &[
                (sovir_domain::RiskSignal::AuthorityImpersonation, 4000),
                (sovir_domain::RiskSignal::GiftCardPayment, 3000),
                (sovir_domain::RiskSignal::ExtortionLanguage, 3000),
                (sovir_domain::RiskSignal::UrgentAction, 2500),
                (sovir_domain::RiskSignal::PaymentRequest, 2500),
            ],
        },
        // Love-bait fused with a money demand — romance-scam shape.
        WeightedHypothesis {
            label: "romance_money_bait",
            threshold: 7000,
            weights: &[
                (sovir_domain::RiskSignal::RomanceBait, 5000),
                (sovir_domain::RiskSignal::PaymentRequest, 3000),
                (sovir_domain::RiskSignal::GiftCardPayment, 2500),
            ],
        },
        // Easy-money job plus a fee or credential ask — pay-to-work scam.
        WeightedHypothesis {
            label: "job_fee_bait",
            threshold: 6500,
            weights: &[
                (sovir_domain::RiskSignal::JobScamOffer, 4000),
                (sovir_domain::RiskSignal::PaymentRequest, 3000),
                (sovir_domain::RiskSignal::CredentialRequest, 2500),
                (sovir_domain::RiskSignal::HiddenFeePattern, 2500),
            ],
        },
        // Health fraud: miracle-cure claim monetized by payment or urgency.
        WeightedHypothesis {
            label: "health_fraud_pitch",
            threshold: 6500,
            weights: &[
                (sovir_domain::RiskSignal::MiracleCureClaim, 4500),
                (sovir_domain::RiskSignal::PaymentRequest, 3000),
                (sovir_domain::RiskSignal::UrgentAction, 2000),
            ],
        },
        // Gift-card demand under pressure/threat/fake-authority — shakedown.
        WeightedHypothesis {
            label: "gift_card_shakedown",
            threshold: 7000,
            weights: &[
                (sovir_domain::RiskSignal::GiftCardPayment, 4500),
                (sovir_domain::RiskSignal::AuthorityImpersonation, 3000),
                (sovir_domain::RiskSignal::ExtortionLanguage, 3000),
                (sovir_domain::RiskSignal::UrgentAction, 2500),
                (sovir_domain::RiskSignal::ScarewareClaim, 2500),
            ],
        },
        // Over-broad PII harvesting on a deceptive or unverified surface.
        WeightedHypothesis {
            label: "data_harvesting",
            threshold: 6500,
            weights: &[
                (sovir_domain::RiskSignal::DataHarvesting, 4500),
                (sovir_domain::RiskSignal::SuspiciousDomain, 3000),
                (sovir_domain::RiskSignal::IdentityUnverified, 2500),
                (sovir_domain::RiskSignal::LinkDestinationMismatch, 2000),
                (sovir_domain::RiskSignal::CredentialRequest, 1000),
            ],
        },
        // "Escríbeme por WhatsApp" fused with any money/credential ask or
        // a bulk-buyer lure — the marketplace off-platform shakedown.
        WeightedHypothesis {
            label: "offplatform_lure",
            threshold: 6000,
            weights: &[
                (sovir_domain::RiskSignal::OffPlatformMove, 3500),
                (sovir_domain::RiskSignal::BulkBuyerLure, 3000),
                (sovir_domain::RiskSignal::PaymentRequest, 3000),
                (sovir_domain::RiskSignal::CredentialRequest, 2500),
                (sovir_domain::RiskSignal::UrgentAction, 2500),
            ],
        },
        // Bulk-buyer pitch fused with off-platform move, urgency or a
        // payment ask — fencing / advance-fee marketplace lure.
        WeightedHypothesis {
            label: "bulk_buyer_lure",
            threshold: 6000,
            weights: &[
                (sovir_domain::RiskSignal::BulkBuyerLure, 3500),
                (sovir_domain::RiskSignal::OffPlatformMove, 3000),
                (sovir_domain::RiskSignal::PaymentRequest, 2500),
                (sovir_domain::RiskSignal::UrgentAction, 1500),
            ],
        },
        // QR code on a money, credential, off-platform or unverified
        // surface — "quishing". QrPresent alone is weak evidence and its
        // weight stays below threshold: corroboration is mandatory.
        WeightedHypothesis {
            label: "qr_phishing_lure",
            threshold: 6000,
            weights: &[
                (sovir_domain::RiskSignal::QrPresent, 3500),
                (sovir_domain::RiskSignal::PaymentRequest, 3000),
                (sovir_domain::RiskSignal::CredentialRequest, 2500),
                (sovir_domain::RiskSignal::OffPlatformMove, 2500),
            ],
        },
        WeightedHypothesis {
            label: "payment_fraud_attempt",
            threshold: 7000,
            weights: &[
                (sovir_domain::RiskSignal::PaymentRequest, 5000),
                (sovir_domain::RiskSignal::UrgentAction, 3500),
                (sovir_domain::RiskSignal::HiddenFeePattern, 1500),
                (sovir_domain::RiskSignal::IdentityUnverified, 1000),
            ],
        },
        WeightedHypothesis {
            label: "manipulative_pattern",
            threshold: 6000,
            weights: &[
                (sovir_domain::RiskSignal::ConsentDarkPattern, 6500),
                (sovir_domain::RiskSignal::HiddenFeePattern, 6500),
                (sovir_domain::RiskSignal::UrgentAction, 1000),
                (sovir_domain::RiskSignal::ScarcityPressure, 1500),
                (sovir_domain::RiskSignal::PrizeLotteryClaim, 1500),
            ],
        },
        WeightedHypothesis {
            label: "credential_request_unverified",
            threshold: 5000,
            weights: &[(sovir_domain::RiskSignal::CredentialRequest, 6000)],
        },
        WeightedHypothesis {
            label: "payment_request_unverified",
            threshold: 5000,
            weights: &[(sovir_domain::RiskSignal::PaymentRequest, 6000)],
        },
        WeightedHypothesis {
            label: "privacy_tracking_exposure",
            threshold: 5000,
            weights: &[(sovir_domain::RiskSignal::TrackingObserved, 5500)],
        },
        WeightedHypothesis {
            label: "identity_unverified",
            threshold: 3500,
            weights: &[(sovir_domain::RiskSignal::IdentityUnverified, 4000)],
        },
        WeightedHypothesis {
            label: "urgency_pressure",
            threshold: 3500,
            weights: &[(sovir_domain::RiskSignal::UrgentAction, 4000)],
        },
    ];
}
#[async_trait]
impl InferenceGateway for HeuristicLocalInferenceGateway {
    async fn assess(
        &self,
        req: &sovir_domain::InferenceRequest,
    ) -> Result<sovir_domain::InferenceVerdict, PortError> {
        if !self.serves(req.privacy) {
            return Err(PortError::Unavailable); // standard must never hit local
        }
        // Dedup signals first — a repeated enum must not double-count
        // evidence (adversarial corpus case).
        let present: std::collections::HashSet<sovir_domain::RiskSignal> =
            req.signals.iter().copied().collect();
        let mut hypotheses: Vec<&'static str> = Vec::new();
        let mut confidence_bp: u16 = 0;
        for rule in Self::HYPOTHESES {
            let score: u64 = rule
                .weights
                .iter()
                .filter(|(s, _)| present.contains(s))
                .map(|(_, w)| u64::from(*w))
                .sum();
            if score >= u64::from(rule.threshold) {
                hypotheses.push(rule.label);
                // Verdict confidence = the strongest hypothesis's raw
                // evidence score, capped — graduated, not fixed.
                confidence_bp = confidence_bp.max(score.min(10_000) as u16);
            }
        }
        if hypotheses.is_empty() {
            hypotheses.push("no_pattern_detected");
            confidence_bp = 1000;
        }
        Ok(sovir_domain::InferenceVerdict {
            request_id: req.request_id.clone(),
            model_id: "sovir-heuristic-local-0.2".into(),
            hypotheses: hypotheses.into_iter().map(str::to_string).collect(),
            confidence_bp,
            provenance: "local_heuristic_weighted_rules; no model, no egress; deterministic".into(),
            // Measured-zero, not None: a local vote provably cost $0 of
            // provider spend — None would settle at the estimate as if a
            // billable call had happened.
            usage: Some(sovir_domain::ReportedUsage {
                tokens_input: 0,
                tokens_output: 0,
                cost_micro_usd: Some(0),
            }),
            votes: None,
        })
    }
    fn serves(&self, mode: sovir_domain::PrivacyMode) -> bool {
        // Both modes (ADR-0025): as a council voter it only reads typed
        // signals and never egresses — a local vote on a Standard
        // envelope is proposal material, not a privacy change.
        mode == sovir_domain::PrivacyMode::Private || mode == sovir_domain::PrivacyMode::Standard
    }
}
/// Privacy-mode router (ADR-0012): `Private` requests always go to the
/// local gateway — a `Private` request can NEVER egress, even when a
/// remote provider is configured. `Standard` goes to the remote gateway
/// when present, else refuses.
pub struct CompositeInferenceGateway {
    local: Arc<dyn InferenceGateway>,
    remote: Option<Arc<dyn InferenceGateway>>,
}
impl CompositeInferenceGateway {
    pub fn new(
        local: Arc<dyn InferenceGateway>,
        remote: Option<Arc<dyn InferenceGateway>>,
    ) -> Self {
        Self { local, remote }
    }
}
#[async_trait]
impl InferenceGateway for CompositeInferenceGateway {
    async fn assess(
        &self,
        req: &sovir_domain::InferenceRequest,
    ) -> Result<sovir_domain::InferenceVerdict, PortError> {
        match req.privacy {
            sovir_domain::PrivacyMode::Private => self.local.assess(req).await,
            sovir_domain::PrivacyMode::Standard => match &self.remote {
                Some(r) if r.serves(req.privacy) => r.assess(req).await,
                _ => Err(PortError::Unavailable),
            },
        }
    }
    fn serves(&self, mode: sovir_domain::PrivacyMode) -> bool {
        match mode {
            sovir_domain::PrivacyMode::Private => self.local.serves(mode),
            sovir_domain::PrivacyMode::Standard => {
                self.remote.as_ref().is_some_and(|r| r.serves(mode))
            }
        }
    }
}
/// Council voter gateway (ADR-0025): fans the request out to every voter
/// that serves the request's privacy mode, merges typed hypotheses
/// deterministically and records each vote for audit. Models only
/// propose — policy code still arbitrates action. Merge rules are fixed
/// and inspectable: hypothesis union ranked by voter confidence,
/// confidence = strongest single vote (conservative under dispute), and
/// a `council:` provenance naming the agreement outcome. A voter that
/// fails is skipped (its absence shows in `votes`), so a remote outage
/// cannot block local voters — and under Private the remote is filtered
/// by `serves` before any call happens.
pub struct CouncilGateway {
    /// Voters that always vote when they serve the privacy mode.
    voters: Vec<(String, Arc<dyn InferenceGateway>)>,
    /// Deferred voters (typically remote): invoked ONLY when the base
    /// voters did not settle the case — the ADR-0025 token-saver. They
    /// are still filtered by `serves(privacy)` before any call.
    deferred: Vec<(String, Arc<dyn InferenceGateway>)>,
    /// Local confidence that settles a case without deferred voters.
    settle_confidence_bp: u16,
    /// Hard bound per voter call. A slow remote cannot stall the
    /// council: on expiry the voter is recorded as an auditable
    /// abstention (`provenance: "abstain:voter_timeout"`, hypothesis
    /// `no_pattern_detected`) so arbitration, union and settle logic
    /// all ignore it while `votes` still shows what happened.
    voter_timeout: std::time::Duration,
}
impl CouncilGateway {
    /// Flat council: every serving voter votes on every request.
    pub fn new(voters: Vec<(String, Arc<dyn InferenceGateway>)>) -> Self {
        Self {
            voters,
            deferred: Vec::new(),
            settle_confidence_bp: 10_000,
            voter_timeout: std::time::Duration::from_secs(8),
        }
    }
    /// Two-tier council: `voters` always vote; `deferred` vote only when
    /// the base votes do not settle (dispute, or under-confidence).
    pub fn deferred(
        voters: Vec<(String, Arc<dyn InferenceGateway>)>,
        deferred: Vec<(String, Arc<dyn InferenceGateway>)>,
        settle_confidence_bp: u16,
    ) -> Self {
        Self {
            voters,
            deferred,
            settle_confidence_bp,
            voter_timeout: std::time::Duration::from_secs(8),
        }
    }
    /// Override the per-voter hard bound (`SOVIR_COUNCIL_VOTER_TIMEOUT_MS`).
    pub fn with_voter_timeout(mut self, timeout: std::time::Duration) -> Self {
        self.voter_timeout = timeout;
        self
    }
    async fn collect(
        &self,
        group: &[(String, Arc<dyn InferenceGateway>)],
        req: &sovir_domain::InferenceRequest,
        votes: &mut Vec<sovir_domain::VoterVerdict>,
    ) {
        for (name, voter) in group {
            if !voter.serves(req.privacy) {
                continue;
            }
            match tokio::time::timeout(self.voter_timeout, voter.assess(req)).await {
                Ok(Ok(v)) => votes.push(sovir_domain::VoterVerdict {
                    voter: name.clone(),
                    model_id: v.model_id,
                    hypotheses: v.hypotheses,
                    confidence_bp: v.confidence_bp,
                    provenance: v.provenance,
                    usage: v.usage,
                }),
                Err(_) => votes.push(sovir_domain::VoterVerdict {
                    voter: name.clone(),
                    model_id: "unavailable".into(),
                    hypotheses: vec!["no_pattern_detected".into()],
                    confidence_bp: 0,
                    provenance: "abstain:voter_timeout".into(),
                    usage: None,
                }),
                Ok(Err(_)) => {}
            }
        }
    }
}
#[async_trait]
impl InferenceGateway for CouncilGateway {
    async fn assess(
        &self,
        req: &sovir_domain::InferenceRequest,
    ) -> Result<sovir_domain::InferenceVerdict, PortError> {
        let mut votes: Vec<sovir_domain::VoterVerdict> = Vec::new();
        self.collect(&self.voters, req, &mut votes).await;
        if votes.is_empty() {
            return Err(PortError::Unavailable); // no serving voter answered
        }
        let mut outcome = sovir_domain::arbitrate_votes(&votes);
        // Deferred voters are consulted ONLY when the base votes did not
        // settle — agreement or a confident local vote saves the call.
        if !self.deferred.is_empty() {
            if sovir_domain::local_votes_settle(&votes, self.settle_confidence_bp) {
                outcome = sovir_domain::CouncilOutcome::LocalSettled;
            } else {
                self.collect(&self.deferred, req, &mut votes).await;
                outcome = sovir_domain::arbitrate_votes(&votes);
            }
        }
        if votes.is_empty() {
            return Err(PortError::Unavailable);
        }
        // Union of hypotheses ranked by the confidence of the voter that
        // produced each (ties keep first-seen order — deterministic).
        let mut ranked: Vec<(u16, String)> = Vec::new();
        for v in &votes {
            for h in &v.hypotheses {
                if h != "no_pattern_detected" && !ranked.iter().any(|(_, x)| x == h) {
                    ranked.push((v.confidence_bp, h.clone()));
                }
            }
        }
        ranked.sort_by_key(|a| std::cmp::Reverse(a.0));
        let mut hypotheses: Vec<String> = ranked.into_iter().map(|(_, h)| h).collect();
        if hypotheses.is_empty() {
            hypotheses.push("no_pattern_detected".into());
        }
        let confidence_bp = votes.iter().map(|v| v.confidence_bp).max().unwrap_or(0);
        let outcome_str = match outcome {
            sovir_domain::CouncilOutcome::Single => "single",
            sovir_domain::CouncilOutcome::Agree => "agree",
            sovir_domain::CouncilOutcome::Disputed => "disputed:no_shared_hypothesis",
            sovir_domain::CouncilOutcome::LocalSettled => "local_settled",
        };
        // Aggregate usage only when EVERY vote carried metering. A vote
        // without usage means an unpriced call happened (e.g. a remote
        // provider that returned no usage fields) — then usage stays
        // None and the reservation settles at the estimate rather than
        // under-billing real egress. All-local councils report an
        // explicit measured zero, so they aggregate to Some(0).
        let mut usage: Option<sovir_domain::ReportedUsage> = None;
        if votes.iter().all(|v| v.usage.is_some()) {
            for v in &votes {
                if let Some(u) = v.usage {
                    let agg = usage.get_or_insert(sovir_domain::ReportedUsage {
                        tokens_input: 0,
                        tokens_output: 0,
                        cost_micro_usd: Some(0),
                    });
                    agg.tokens_input += u.tokens_input;
                    agg.tokens_output += u.tokens_output;
                    agg.cost_micro_usd = match (agg.cost_micro_usd, u.cost_micro_usd) {
                        (Some(a), Some(b)) => Some(a + b),
                        _ => None,
                    };
                }
            }
        }
        Ok(sovir_domain::InferenceVerdict {
            request_id: req.request_id.clone(),
            model_id: "sovir-council-v1".into(),
            hypotheses,
            confidence_bp,
            provenance: format!("council:{outcome_str}; voters:{}", votes.len()),
            usage,
            votes: Some(votes),
        })
    }
    fn serves(&self, mode: sovir_domain::PrivacyMode) -> bool {
        self.voters.iter().any(|(_, v)| v.serves(mode))
            || self.deferred.iter().any(|(_, v)| v.serves(mode))
    }
}
/// Bounded TTL verdict cache (B4 token-saver). Wraps any gateway: an
/// identical repeat — same signal set, privacy mode and text hint — is
/// served from memory so the provider is never re-billed for a duplicate
/// call. The key hashes canonical signal labels plus a digest of the
/// local-only `text_hint`; raw hint text is never stored. A hit answers
/// under the caller's request_id with `cache:`-prefixed provenance and an
/// explicit zero `ReportedUsage`, so audits tell a served-from-memory
/// verdict from a real call.
pub struct CachingInferenceGateway {
    inner: Arc<dyn InferenceGateway>,
    clock: Arc<dyn Clock>,
    ttl_ms: u64,
    cap: usize,
    entries: Mutex<HashMap<u64, CacheEntry>>,
}
struct CacheEntry {
    stored_at_ms: u64,
    model_id: String,
    hypotheses: Vec<String>,
    confidence_bp: u16,
    provenance: String,
    votes: Option<Vec<sovir_domain::VoterVerdict>>,
}
impl CachingInferenceGateway {
    pub fn new(
        inner: Arc<dyn InferenceGateway>,
        clock: Arc<dyn Clock>,
        ttl_ms: u64,
        cap: usize,
    ) -> Self {
        Self {
            inner,
            clock,
            ttl_ms,
            cap,
            entries: Mutex::new(HashMap::new()),
        }
    }
    /// Deterministic key over sorted signal labels + privacy + the hint
    /// digest. `DefaultHasher` is fixed-key SipHash — stable within the
    /// process, which is all a local cache needs.
    fn key(req: &sovir_domain::InferenceRequest) -> u64 {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut sig: Vec<&str> = req
            .signals
            .iter()
            .map(|s| sovir_domain::risk_signal_label(*s))
            .collect();
        sig.sort_unstable();
        let mut h = DefaultHasher::new();
        sig.hash(&mut h);
        match req.privacy {
            sovir_domain::PrivacyMode::Private => 0u8.hash(&mut h),
            sovir_domain::PrivacyMode::Standard => 1u8.hash(&mut h),
        }
        // The hint lands in the key only as a hash — never stored raw.
        req.text_hint.as_deref().unwrap_or("").hash(&mut h);
        h.finish()
    }
}
#[async_trait]
impl InferenceGateway for CachingInferenceGateway {
    async fn assess(
        &self,
        req: &sovir_domain::InferenceRequest,
    ) -> Result<sovir_domain::InferenceVerdict, PortError> {
        let key = Self::key(req);
        let now = self.clock.now_ms();
        {
            let mut map = self.entries.lock().map_err(|_| PortError::Storage)?;
            if let Some(e) = map.get(&key) {
                if now.saturating_sub(e.stored_at_ms) <= self.ttl_ms {
                    return Ok(sovir_domain::InferenceVerdict {
                        request_id: req.request_id.clone(),
                        model_id: e.model_id.clone(),
                        hypotheses: e.hypotheses.clone(),
                        confidence_bp: e.confidence_bp,
                        provenance: format!("cache:{}", e.provenance),
                        usage: Some(sovir_domain::ReportedUsage {
                            tokens_input: 0,
                            tokens_output: 0,
                            cost_micro_usd: Some(0),
                        }),
                        votes: e.votes.clone(),
                    });
                }
                map.remove(&key); // expired
            }
        }
        let v = self.inner.assess(req).await?;
        let mut map = self.entries.lock().map_err(|_| PortError::Storage)?;
        if map.len() >= self.cap {
            map.retain(|_, e| now.saturating_sub(e.stored_at_ms) <= self.ttl_ms);
            if map.len() >= self.cap {
                if let Some(oldest) = map
                    .iter()
                    .min_by_key(|(_, e)| e.stored_at_ms)
                    .map(|(k, _)| *k)
                {
                    map.remove(&oldest);
                }
            }
        }
        map.insert(
            key,
            CacheEntry {
                stored_at_ms: now,
                model_id: v.model_id.clone(),
                hypotheses: v.hypotheses.clone(),
                confidence_bp: v.confidence_bp,
                provenance: v.provenance.clone(),
                votes: v.votes.clone(),
            },
        );
        Ok(v)
    }
    fn serves(&self, mode: sovir_domain::PrivacyMode) -> bool {
        self.inner.serves(mode)
    }
}
/// Visual ONNX voter seam (ADR-0024 + ADR-0025). Fails CLOSED by
/// construction: `serves()` is false until BOTH an approved, licensed
/// artifact path is configured (`SOVIR_ONNX_VISION_MODEL`) AND the
/// crate is built with the `onnx` feature that carries the `ort`
/// runtime — a missing feature or missing artifact means the voter is
/// registered but never votes. It also cannot vote until the request
/// type carries a modality-typed visual payload (signals alone have no
/// pixels); that contract change needs its own ADR-level review.
/// Honest "not yet" — never a guessed `image_lure` label.
pub struct OnnxVisualVoter {
    artifact_present: bool,
}
impl OnnxVisualVoter {
    /// Reads `SOVIR_ONNX_VISION_MODEL`; absent or non-file → no artifact.
    pub fn from_env() -> Self {
        let artifact_present = std::env::var("SOVIR_ONNX_VISION_MODEL")
            .ok()
            .map(std::path::PathBuf::from)
            .is_some_and(|p| p.is_file());
        Self { artifact_present }
    }
}
#[async_trait]
impl InferenceGateway for OnnxVisualVoter {
    async fn assess(
        &self,
        _req: &sovir_domain::InferenceRequest,
    ) -> Result<sovir_domain::InferenceVerdict, PortError> {
        // No runtime + no visual payload contract yet — refuse honestly.
        Err(PortError::Unavailable)
    }
    fn serves(&self, _mode: sovir_domain::PrivacyMode) -> bool {
        // The whole gate in one line: runtime feature AND artifact AND
        // (future) request payload — false until every condition lands.
        cfg!(feature = "onnx") && self.artifact_present
    }
}
/// Text ONNX voter (ADR-0025): a licensed local classifier scoring the
/// request's `text_hint`. Fails closed like the visual seam — without
/// the `onnx` feature or a configured artifact dir it never votes.
/// LOCAL ONLY: it reads raw text and never egresses; the remote
/// envelope is built field-by-field and cannot carry `text_hint`
/// (asserted in `remote_envelope_never_carries_text_hint`).
///
/// Artifact dir (SOVIR_ONNX_TEXT_DIR) — two accepted layouts:
///   legacy softmax: model_quantized.onnx + tokenizer.json + config.json
///                   (id2label read, never guessed)
///   multi-label v1: model.onnx + tokenizer.json + thresholds.json
///                   (signals[] + per-signal calibrated thresholds; sigmoid
///                   decode — the council's typed-signal taxonomy directly)
pub struct OnnxTextVoter {
    artifact_dir: Option<std::path::PathBuf>,
    #[cfg(feature = "onnx")]
    inner: std::sync::Mutex<Option<OnnxTextInner>>,
}
#[cfg(feature = "onnx")]
enum TextDecode {
    /// index -> label, from config.json id2label (softmax argmax).
    Softmax { id2label: Vec<String> },
    /// thresholds.json: signals[] + thresholds{signal: prob} (sigmoid).
    MultiLabel {
        signals: Vec<String>,
        thresholds: Vec<f32>,
    },
}
#[cfg(feature = "onnx")]
struct OnnxTextInner {
    _env: ort::environment::Environment,
    session: ort::session::Session,
    tokenizer: tokenizers::Tokenizer,
    decode: TextDecode,
}
impl OnnxTextVoter {
    pub fn from_env() -> Self {
        let artifact_dir = std::env::var("SOVIR_ONNX_TEXT_DIR")
            .ok()
            .map(std::path::PathBuf::from)
            .filter(|p| {
                (p.join("model.onnx").is_file() || p.join("model_quantized.onnx").is_file())
                    && p.join("tokenizer.json").is_file()
            });
        Self {
            artifact_dir,
            #[cfg(feature = "onnx")]
            inner: std::sync::Mutex::new(None),
        }
    }
    #[cfg(feature = "onnx")]
    fn load(dir: &std::path::Path) -> Result<OnnxTextInner, PortError> {
        let multilabel = dir.join("thresholds.json").is_file() && dir.join("model.onnx").is_file();
        let model_path = if multilabel {
            dir.join("model.onnx")
        } else {
            dir.join("model_quantized.onnx")
        };
        let env = ort::init().build().map_err(|_| PortError::Unavailable)?;
        let session = ort::session::Session::builder(&env)
            .map_err(|_| PortError::Unavailable)?
            .commit_from_file(model_path)
            .map_err(|_| PortError::Unavailable)?;
        let tokenizer = tokenizers::Tokenizer::from_file(dir.join("tokenizer.json"))
            .map_err(|_| PortError::Unavailable)?;
        let decode = if multilabel {
            let th: serde_json::Value = serde_json::from_str(
                &std::fs::read_to_string(dir.join("thresholds.json"))
                    .map_err(|_| PortError::Unavailable)?,
            )
            .map_err(|_| PortError::Unavailable)?;
            let signals: Vec<String> = th["signals"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|s| s.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            let tm = th["thresholds"].as_object();
            let thresholds: Vec<f32> = signals
                .iter()
                .map(|s| {
                    tm.and_then(|m| m.get(s))
                        .and_then(|v| v.as_f64())
                        .unwrap_or(0.9) as f32
                })
                .collect();
            if signals.is_empty() {
                return Err(PortError::Unavailable); // label space unknown = refuse
            }
            TextDecode::MultiLabel {
                signals,
                thresholds,
            }
        } else {
            let cfg: serde_json::Value = serde_json::from_str(
                &std::fs::read_to_string(dir.join("config.json"))
                    .map_err(|_| PortError::Unavailable)?,
            )
            .map_err(|_| PortError::Unavailable)?;
            let id2label = cfg["id2label"]
                .as_object()
                .map(|m| {
                    let mut v: Vec<(usize, String)> = m
                        .iter()
                        .filter_map(|(k, val)| {
                            k.parse::<usize>()
                                .ok()
                                .map(|i| (i, val.as_str().unwrap_or("").to_string()))
                        })
                        .collect();
                    v.sort_by_key(|(i, _)| *i);
                    v.into_iter().map(|(_, s)| s).collect::<Vec<_>>()
                })
                .unwrap_or_default();
            if id2label.is_empty() {
                return Err(PortError::Unavailable); // class order unknown = refuse
            }
            TextDecode::Softmax { id2label }
        };
        Ok(OnnxTextInner {
            _env: env,
            session,
            tokenizer,
            decode,
        })
    }
    #[cfg(feature = "onnx")]
    fn score(&self, text: &str) -> Result<(Vec<String>, u16), PortError> {
        let dir = self.artifact_dir.as_ref().ok_or(PortError::Unavailable)?;
        let mut guard = self.inner.lock().map_err(|_| PortError::Storage)?;
        if guard.is_none() {
            *guard = Some(Self::load(dir)?);
        }
        let inner = guard.as_mut().ok_or(PortError::Unavailable)?;
        let enc = inner
            .tokenizer
            .encode(text, true)
            .map_err(|_| PortError::Unavailable)?;
        let ids: Vec<i64> = enc.get_ids().iter().map(|&t| t as i64).collect();
        let mask: Vec<i64> = enc.get_attention_mask().iter().map(|&t| t as i64).collect();
        let seq = ids.len();
        // Feed exactly the inputs the graph declares — never guess names.
        let mut feed: Vec<(String, ort::session::SessionInputValue)> = Vec::new();
        for input in inner.session.inputs() {
            let name = input.name().to_string();
            if name.contains("mask") {
                let mask_t = ort::value::Tensor::from_array(([1usize, seq], mask.clone()))
                    .map_err(|_| PortError::Unavailable)?;
                feed.push((name, mask_t.into()));
            } else if name.contains("token_type") {
                let zeros = ort::value::Tensor::from_array(([1usize, seq], vec![0i64; seq]))
                    .map_err(|_| PortError::Unavailable)?;
                feed.push((name, zeros.into()));
            } else {
                let ids_t = ort::value::Tensor::from_array(([1usize, seq], ids.clone()))
                    .map_err(|_| PortError::Unavailable)?;
                feed.push((name, ids_t.into()));
            }
        }
        let outputs = inner
            .session
            .run(feed)
            .map_err(|_| PortError::Unavailable)?;
        let logits = outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|_| PortError::Unavailable)?
            .1
            .to_vec();
        match &inner.decode {
            TextDecode::Softmax { id2label } => {
                let max = logits.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
                let exps: Vec<f32> = logits.iter().map(|&x| (x - max).exp()).collect();
                let sum: f32 = exps.iter().sum();
                let (top_i, _) = exps
                    .iter()
                    .enumerate()
                    .max_by(|(_, a), (_, b)| a.total_cmp(b))
                    .ok_or(PortError::Unavailable)?;
                let prob = exps[top_i] / sum;
                let label = id2label.get(top_i).cloned().unwrap_or_default();
                Ok((vec![label], (prob * 10_000.0).min(10_000.0) as u16))
            }
            TextDecode::MultiLabel {
                signals,
                thresholds,
            } => {
                // Fused export emits sigmoid probs — no softmax re-normalize.
                let fired: Vec<(String, f32)> = signals
                    .iter()
                    .zip(thresholds.iter())
                    .enumerate()
                    .filter_map(|(i, (s, t))| {
                        logits.get(i).filter(|&&p| p >= *t).map(|&p| (s.clone(), p))
                    })
                    .collect();
                if fired.is_empty() {
                    return Ok((vec!["__none__".into()], 0));
                }
                let best = fired.iter().map(|(_, p)| *p).fold(0.0_f32, f32::max);
                Ok((
                    fired.into_iter().map(|(s, _)| s).collect(),
                    (best * 10_000.0).min(10_000.0) as u16,
                ))
            }
        }
    }
}
#[async_trait]
impl InferenceGateway for OnnxTextVoter {
    async fn assess(
        &self,
        req: &sovir_domain::InferenceRequest,
    ) -> Result<sovir_domain::InferenceVerdict, PortError> {
        #[cfg(feature = "onnx")]
        {
            let text = req
                .text_hint
                .as_deref()
                .filter(|t| !t.trim().is_empty())
                .ok_or(PortError::Unavailable)?; // no text = abstain
            let (labels, bp) = self.score(text)?;
            let (hypotheses, model_id, prov) =
                if labels.first().map(String::as_str) == Some("__none__") {
                    (
                        vec!["no_pattern_detected".to_string()],
                        "sovir-onnx-text-v1",
                        "onnx-text-v1 local; 21-signal sigmoid; no fire".to_string(),
                    )
                } else if matches!(
                    labels.first().map(String::as_str),
                    Some("fraud") | Some("spam") | Some("legitimate")
                ) {
                    (
                        vec![match labels[0].as_str() {
                            "fraud" => "text_classifier_fraud",
                            "spam" => "text_classifier_spam",
                            _ => "no_pattern_detected",
                        }
                        .to_string()],
                        "horizon-phishing-scam-detector-base",
                        format!("onnx-text local; label:{}; no egress", labels[0]),
                    )
                } else {
                    // Multi-label v1: fired signal names ARE the typed taxonomy.
                    (
                        labels.clone(),
                        "sovir-onnx-text-v1",
                        format!(
                            "onnx-text-v1 local; signals:{}; no egress",
                            labels.join(",")
                        ),
                    )
                };
            return Ok(sovir_domain::InferenceVerdict {
                request_id: req.request_id.clone(),
                model_id: model_id.into(),
                hypotheses,
                confidence_bp: bp,
                provenance: prov,
                // Local artifact, zero provider metering — measured $0,
                // never an unpriced None that would bill the estimate.
                usage: Some(sovir_domain::ReportedUsage {
                    tokens_input: 0,
                    tokens_output: 0,
                    cost_micro_usd: Some(0),
                }),
                votes: None,
            });
        }
        #[cfg(not(feature = "onnx"))]
        {
            let _ = req;
            Err(PortError::Unavailable)
        }
    }
    fn serves(&self, mode: sovir_domain::PrivacyMode) -> bool {
        let _ = mode;
        cfg!(feature = "onnx") && self.artifact_dir.is_some()
    }
}
/// Per-tenant inference budget in micro-USD (B4). Dev adapter: a shared
/// cap for every tenant; production needs per-plan caps (B7 decision).
pub struct InMemoryBudgetLedger {
    spend: std::sync::Arc<RwLock<std::collections::HashMap<String, u64>>>,
    cap_micro_usd: u64,
}
impl InMemoryBudgetLedger {
    /// `cap_micro_usd`: 1_000_000 = USD 1.00.
    pub fn with_cap(cap_micro_usd: u64) -> Self {
        Self {
            spend: std::sync::Arc::new(RwLock::new(std::collections::HashMap::new())),
            cap_micro_usd,
        }
    }
    /// Ledger reporting over a shared spend counter. Pair with
    /// `InMemoryBudgetReservations::spend_handle()` so `me_budget` reports
    /// the same spend the reservation gate enforces — without it the
    /// ledger reports $0 while actual spend accrues elsewhere.
    pub fn with_shared_spend(
        spend: std::sync::Arc<RwLock<std::collections::HashMap<String, u64>>>,
        cap_micro_usd: u64,
    ) -> Self {
        Self {
            spend,
            cap_micro_usd,
        }
    }
}
impl Default for InMemoryBudgetLedger {
    fn default() -> Self {
        Self::with_cap(0) // dev default: no spend allowed at all
    }
}
#[async_trait]
impl BudgetLedger for InMemoryBudgetLedger {
    async fn spent_micro_usd(&self, tenant_id: &str) -> Result<u64, PortError> {
        self.spend
            .read()
            .map(|g| *g.get(tenant_id).unwrap_or(&0))
            .map_err(|_| PortError::Storage)
    }
    async fn cap_micro_usd(&self, _tenant_id: &str) -> Result<u64, PortError> {
        Ok(self.cap_micro_usd)
    }
    async fn record_spend(&self, tenant_id: &str, micro_usd: u64) -> Result<(), PortError> {
        *self
            .spend
            .write()
            .map_err(|_| PortError::Storage)?
            .entry(tenant_id.to_string())
            .or_insert(0) += micro_usd;
        Ok(())
    }
}
/// In-memory durable-reservation adapter (B21). The whole check+insert
/// happens under one write-lock — same atomicity contract as the PG
/// transaction version, so the concurrency test is meaningful here too.
pub struct InMemoryBudgetReservations {
    inner: RwLock<InMemoryReservationState>,
    // Settled spend lives behind its own handle so the reporting ledger
    // (BudgetLedger::spent_micro_usd) reads the SAME counter the cap gate
    // enforces — the PG adapter gets this for free from one table; the
    // in-memory pair must share it explicitly or spend reports as $0.
    // Lock order is always `inner` → `spent` — never the reverse.
    spent: std::sync::Arc<RwLock<std::collections::HashMap<String, u64>>>,
    cap_micro_usd: u64,
}
#[derive(Default)]
struct InMemoryReservationState {
    rows: std::collections::HashMap<(String, String), InferenceReservation>,
}
impl InMemoryBudgetReservations {
    pub fn with_cap(cap_micro_usd: u64) -> Self {
        Self {
            inner: RwLock::new(InMemoryReservationState::default()),
            spent: std::sync::Arc::new(RwLock::new(std::collections::HashMap::new())),
            cap_micro_usd,
        }
    }
    /// Shared spend view for pairing with `InMemoryBudgetLedger`
    /// (`with_shared_spend`) — the enforced counter becomes the reported
    /// counter, matching the single-table semantics of the PG adapter.
    pub fn spend_handle(&self) -> std::sync::Arc<RwLock<std::collections::HashMap<String, u64>>> {
        self.spent.clone()
    }
}
impl Default for InMemoryBudgetReservations {
    fn default() -> Self {
        Self::with_cap(0)
    }
}
#[async_trait]
impl sovir_ports::BudgetReservations for InMemoryBudgetReservations {
    async fn reserve(
        &self,
        tenant_id: &str,
        request_id: &str,
        est_micro_usd: u64,
    ) -> Result<sovir_ports::ReserveOutcome, PortError> {
        let mut g = self.inner.write().map_err(|_| PortError::Storage)?;
        let key = (tenant_id.to_string(), request_id.to_string());
        if let Some(existing) = g.rows.get(&key) {
            return Ok(sovir_ports::ReserveOutcome::Reserved(Box::new(
                existing.clone(),
            )));
        }
        let spent = self
            .spent
            .read()
            .map_err(|_| PortError::Storage)?
            .get(tenant_id)
            .copied()
            .unwrap_or(0);
        let pending: u64 = g
            .rows
            .values()
            .filter(|r| r.tenant_id == tenant_id && r.state == ReservationState::Pending)
            .map(|r| r.est_micro_usd)
            .sum();
        if spent.saturating_add(pending).saturating_add(est_micro_usd) > self.cap_micro_usd {
            return Ok(sovir_ports::ReserveOutcome::BudgetExceeded);
        }
        let r = InferenceReservation {
            reservation_id: format!("rsv-{}", uuid::Uuid::new_v4().simple()),
            tenant_id: tenant_id.to_string(),
            request_id: request_id.to_string(),
            state: ReservationState::Pending,
            est_micro_usd,
            actual_micro_usd: None,
            usage: None,
            created_at_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            settled_at_ms: None,
        };
        g.rows.insert(key, r.clone());
        Ok(sovir_ports::ReserveOutcome::Reserved(Box::new(r)))
    }
    async fn settle(
        &self,
        tenant_id: &str,
        request_id: &str,
        actual_micro_usd: u64,
        usage: InferenceUsage,
    ) -> Result<(), PortError> {
        let mut g = self.inner.write().map_err(|_| PortError::Storage)?;
        let key = (tenant_id.to_string(), request_id.to_string());
        let Some(r) = g.rows.get_mut(&key) else {
            return Err(PortError::Storage);
        };
        if r.state != ReservationState::Pending {
            return Ok(()); // already terminal — idempotent settle
        }
        r.state = ReservationState::Settled;
        r.actual_micro_usd = Some(actual_micro_usd);
        r.usage = Some(usage);
        *self
            .spent
            .write()
            .map_err(|_| PortError::Storage)?
            .entry(tenant_id.to_string())
            .or_insert(0) += actual_micro_usd;
        Ok(())
    }
    async fn refund(&self, tenant_id: &str, request_id: &str) -> Result<(), PortError> {
        let mut g = self.inner.write().map_err(|_| PortError::Storage)?;
        let key = (tenant_id.to_string(), request_id.to_string());
        if let Some(r) = g.rows.get_mut(&key) {
            if r.state == ReservationState::Pending {
                r.state = ReservationState::Refunded;
            }
        }
        Ok(())
    }
    async fn spent_since(&self, tenant_id: &str, since_ms: u64) -> Result<u64, PortError> {
        let g = self.inner.read().map_err(|_| PortError::Storage)?;
        Ok(g.rows
            .values()
            .filter(|r| {
                r.tenant_id == tenant_id
                    && r.created_at_ms >= since_ms
                    && r.state != ReservationState::Refunded
            })
            .map(|r| r.actual_micro_usd.unwrap_or(r.est_micro_usd))
            .sum())
    }
    async fn refund_expired(&self, cutoff_ms: u64) -> Result<u64, PortError> {
        let mut g = self.inner.write().map_err(|_| PortError::Storage)?;
        let mut n = 0u64;
        for r in g.rows.values_mut() {
            if r.state == ReservationState::Pending && r.created_at_ms <= cutoff_ms {
                r.state = ReservationState::Refunded;
                n += 1;
            }
        }
        Ok(n)
    }
}
/// In-memory threat-intel adapter (B5). `pending` is the candidate feed
/// (seeded in tests); `stored` holds what the application validated and
/// recorded. Pulling drains pending — items are consumed, not replayed.
#[derive(Default)]
pub struct InMemoryThreatIntel {
    pending: RwLock<Vec<sovir_domain::IntelIndicator>>,
    stored: RwLock<Vec<sovir_domain::IntelIndicator>>,
}
impl InMemoryThreatIntel {
    /// Test helper: inject candidate items as the pull source.
    pub fn seed(&self, items: Vec<sovir_domain::IntelIndicator>) {
        if let Ok(mut g) = self.pending.write() {
            g.extend(items);
        }
    }
}
#[async_trait]
impl ThreatIntelFeed for InMemoryThreatIntel {
    async fn pull(&self, _since_ms: u64) -> Result<Vec<sovir_domain::IntelIndicator>, PortError> {
        self.pending
            .write()
            .map(|mut g| std::mem::take(&mut *g))
            .map_err(|_| PortError::Storage)
    }
    async fn record(&self, indicator: sovir_domain::IntelIndicator) -> Result<(), PortError> {
        let mut g = self.stored.write().map_err(|_| PortError::Storage)?;
        // PG parity: insert-once on indicator_id (ON CONFLICT DO NOTHING) so
        // repeated sweeps over the same source do not duplicate rows.
        if !g.iter().any(|i| i.indicator_id == indicator.indicator_id) {
            g.push(indicator);
        }
        Ok(())
    }
    async fn list(&self, tenant_id: &str) -> Result<Vec<sovir_domain::IntelIndicator>, PortError> {
        self.stored
            .read()
            .map(|g| {
                g.iter()
                    .filter(|i| i.tenant_id == tenant_id)
                    .cloned()
                    .collect()
            })
            .map_err(|_| PortError::Storage)
    }
}
/// In-memory investigation store (B5). Insert-once rows; listing returns
/// the calling principal's reports newest-first. One lock per call —
/// insert and list cannot interleave mid-operation.
#[derive(Default)]
pub struct InMemoryInvestigationStore(RwLock<Vec<Investigation>>);
#[async_trait]
impl sovir_ports::InvestigationStore for InMemoryInvestigationStore {
    async fn insert(&self, inv: Investigation) -> Result<(), PortError> {
        self.0.write().map_err(|_| PortError::Storage)?.push(inv);
        Ok(())
    }
    async fn list_by_principal(
        &self,
        tenant_id: &str,
        principal_id: &str,
    ) -> Result<Vec<Investigation>, PortError> {
        self.0
            .read()
            .map(|g| {
                let mut v: Vec<Investigation> = g
                    .iter()
                    .filter(|i| i.tenant_id == tenant_id && i.principal_id == principal_id)
                    .cloned()
                    .collect();
                v.sort_by_key(|i| std::cmp::Reverse(i.created_at_ms));
                v
            })
            .map_err(|_| PortError::Storage)
    }
}

/// Generic remote inference adapter (B4/ADR-0012). Provider-agnostic:
/// any endpoint that accepts the versioned request shape and returns the
/// versioned verdict shape works. Serves ONLY `Standard` mode —
/// `Private` content never leaves the local boundary by design.
/// All traffic goes through the `HttpEgress` port, so allowlist,
/// timeout and redirect policy apply exactly like webhooks.
pub struct RemoteInferenceGateway {
    egress: Arc<dyn HttpEgress>,
    endpoint: String,
    api_key: String,
    model_id: String,
}
impl RemoteInferenceGateway {
    pub fn new(
        egress: Arc<dyn HttpEgress>,
        endpoint: String,
        api_key: String,
        model_id: String,
    ) -> Self {
        Self {
            egress,
            endpoint,
            api_key,
            model_id,
        }
    }
}
/// Provider response schema (contracts/schemas/inference-verdict.v0).
#[derive(serde::Deserialize)]
struct ProviderVerdict {
    request_id: String,
    model_id: String,
    #[serde(default)]
    hypotheses: Vec<String>,
    #[serde(default)]
    confidence_bp: u16,
}
#[async_trait]
impl InferenceGateway for RemoteInferenceGateway {
    async fn assess(
        &self,
        req: &sovir_domain::InferenceRequest,
    ) -> Result<sovir_domain::InferenceVerdict, PortError> {
        // Injection guard before egress (B21): app-layer validation is the
        // first gate, but the gateway re-checks so a malicious request_id
        // can never reach the wire even if a future caller skips the
        // application layer.
        if !sovir_domain::egress_safe_identifier(&req.request_id) {
            return Err(PortError::Unauthorized);
        }
        let body = serde_json::json!({
            "request_id": req.request_id,
            "model": self.model_id,
            "signals": req.signals,
            "privacy": req.privacy,
        })
        .to_string();
        let headers = vec![(
            "authorization".to_string(),
            format!("Bearer {}", self.api_key),
        )];
        let text = self
            .egress
            .post_and_receive(&self.endpoint, &body, &headers)
            .await?;
        let v: ProviderVerdict = serde_json::from_str(&text).map_err(|_| PortError::Storage)?;
        if v.request_id != req.request_id {
            return Err(PortError::Storage); // response not bound to request
        }
        let host = sovir_domain::host_of(&self.endpoint).unwrap_or_default();
        Ok(sovir_domain::InferenceVerdict {
            request_id: v.request_id,
            model_id: v.model_id,
            hypotheses: v.hypotheses,
            confidence_bp: v.confidence_bp.min(10_000),
            provenance: format!("remote:{host}"),
            usage: None,
            votes: None,
        })
    }
    fn serves(&self, mode: sovir_domain::PrivacyMode) -> bool {
        // Invariant: remote gateways may only ever serve Standard.
        mode == sovir_domain::PrivacyMode::Standard
    }
}

/// Closed hypothesis taxonomy shared by the heuristic and remote reasoners.
/// Remote model output is filtered against this list — a label outside the
/// taxonomy is dropped, never trusted.
pub const KNOWN_HYPOTHESIS_LABELS: &[&str] = &[
    "credential_phishing",
    "payment_fraud_attempt",
    "manipulative_pattern",
    "credential_request_unverified",
    "payment_request_unverified",
    "privacy_tracking_exposure",
    "identity_unverified",
    "urgency_pressure",
    "qr_phishing_lure",
    "no_pattern_detected",
];
/// OpenAI-compatible chat/completions inference gateway (Baseten deployments,
/// event LLM endpoints exposing /v1/chat/completions). The request body
/// carries typed signals + request_id inside a JSON user message — never
/// content, digests, tenant ids or device ids. The model is instructed to
/// answer a strict JSON verdict; the echoed request_id must match and the
/// hypotheses are filtered to the closed taxonomy above.
pub struct ChatCompletionInferenceGateway {
    egress: Arc<dyn HttpEgress>,
    endpoint: String,
    api_key: String,
    model_id: String,
    /// Optional micro-USD per million input/output tokens — when set, the
    /// gateway prices each call from the provider's `usage` counters and
    /// the reservation settles at the real cost instead of the flat
    /// per-request estimate. Unset means "price unknown, charge estimate".
    price_in_micros_per_mtok: Option<u64>,
    price_out_micros_per_mtok: Option<u64>,
}
impl ChatCompletionInferenceGateway {
    pub fn new(
        egress: Arc<dyn HttpEgress>,
        endpoint: String,
        api_key: String,
        model_id: String,
        price_in_micros_per_mtok: Option<u64>,
        price_out_micros_per_mtok: Option<u64>,
    ) -> Self {
        Self {
            egress,
            endpoint,
            api_key,
            model_id,
            price_in_micros_per_mtok,
            price_out_micros_per_mtok,
        }
    }
    /// Cost in micro-USD for a token pair; ceil-div so partial usage never
    /// rounds down to free. None when pricing is unconfigured.
    fn priced_cost(&self, tokens_in: u32, tokens_out: u32) -> Option<u64> {
        let (pin, pout) = (
            self.price_in_micros_per_mtok?,
            self.price_out_micros_per_mtok?,
        );
        let in_cost = (u64::from(tokens_in) * pin).div_ceil(1_000_000);
        let out_cost = (u64::from(tokens_out) * pout).div_ceil(1_000_000);
        Some(in_cost.saturating_add(out_cost))
    }
}
/// Wire format of an OpenAI-compatible chat/completions response — only the
/// fields SOVIR consumes. Anything else in the provider payload is ignored.
#[derive(serde::Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
    /// Provider metering — the honest cost signal. Absent on some
    /// providers; verdict then reports usage None and settles at estimate.
    #[serde(default)]
    usage: Option<ChatUsage>,
}
#[derive(serde::Deserialize)]
struct ChatUsage {
    #[serde(default)]
    prompt_tokens: u32,
    #[serde(default)]
    completion_tokens: u32,
}
#[derive(serde::Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}
#[derive(serde::Deserialize)]
struct ChatMessage {
    /// Null when the provider truncates on max_tokens before answering
    /// (reasoning models) — treated as an error, never as a verdict.
    content: Option<String>,
}
/// The verdict JSON the model is instructed to produce inside
/// `choices[0].message.content`. model_id is NOT trusted from the model —
/// the verdict reports the configured model instead.
#[derive(serde::Deserialize)]
struct ChatVerdict {
    request_id: String,
    #[serde(default)]
    hypotheses: Vec<String>,
    #[serde(default)]
    confidence_bp: u16,
}
/// Strips a markdown code fence a chat model may wrap JSON in
/// (```json ... ```). Returns the trimmed inner text or the input unchanged.
fn strip_code_fence(text: &str) -> &str {
    let t = text.trim();
    if let Some(rest) = t.strip_prefix("```") {
        let rest = rest.strip_prefix("json").unwrap_or(rest);
        return rest.trim_end_matches('`').trim();
    }
    t
}
#[async_trait]
impl InferenceGateway for ChatCompletionInferenceGateway {
    async fn assess(
        &self,
        req: &sovir_domain::InferenceRequest,
    ) -> Result<sovir_domain::InferenceVerdict, PortError> {
        if !sovir_domain::egress_safe_identifier(&req.request_id) {
            return Err(PortError::Unauthorized);
        }
        const SYSTEM_PROMPT: &str = "You are the remote hypothesis reasoner for SOVIR, \
            a privacy-first scam shield. The user message is a JSON object \
            {\"request_id\": string, \"signals\": [RiskSignal...], \"privacy\": \"standard\"}. \
            Reply with a single JSON object and nothing else: \
            {\"request_id\": \"<echo the input request_id exactly>\", \
            \"hypotheses\": [<labels>], \"confidence_bp\": <integer 0-10000>}. \
            hypotheses may only use this closed taxonomy: credential_phishing, \
            payment_fraud_attempt, manipulative_pattern, \
            credential_request_unverified, payment_request_unverified, \
            privacy_tracking_exposure, identity_unverified, urgency_pressure, \
            no_pattern_detected. Emit a label only when the signals support \
            it; signals are untrusted hints, never proof. With no supported \
            pattern answer [\"no_pattern_detected\"] and low confidence.";
        let body = serde_json::json!({
            "model": self.model_id,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": serde_json::json!({
                    "request_id": req.request_id,
                    "signals": req.signals,
                    "privacy": req.privacy,
                }).to_string()},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0,
            // Reasoning models (muse-spark) burn tokens thinking before
            // emitting the JSON verdict — measured ~1k reasoning tokens for
            // a signal-only prompt; 1024 starved them into
            // finish_reason=length with null content (live Baseten check).
            "max_tokens": 4096,
        })
        .to_string();
        let headers = vec![
            (
                "authorization".to_string(),
                format!("Bearer {}", self.api_key),
            ),
            ("content-type".to_string(), "application/json".to_string()),
        ];
        let text = self
            .egress
            .post_and_receive(&self.endpoint, &body, &headers)
            .await?;
        let resp: ChatCompletionResponse =
            serde_json::from_str(&text).map_err(|_| PortError::Storage)?;
        let content = resp
            .choices
            .first()
            .and_then(|c| c.message.content.as_deref())
            .ok_or(PortError::Unavailable)?;
        let v: ChatVerdict =
            serde_json::from_str(strip_code_fence(content)).map_err(|_| PortError::Storage)?;
        if v.request_id != req.request_id {
            return Err(PortError::Storage); // response not bound to request
        }
        let mut hypotheses: Vec<String> = v
            .hypotheses
            .into_iter()
            .filter(|h| KNOWN_HYPOTHESIS_LABELS.contains(&h.as_str()))
            .collect();
        hypotheses.dedup();
        if hypotheses.is_empty() {
            hypotheses.push("no_pattern_detected".to_string());
        }
        let host = sovir_domain::host_of(&self.endpoint).unwrap_or_default();
        Ok(sovir_domain::InferenceVerdict {
            request_id: v.request_id,
            model_id: self.model_id.clone(),
            hypotheses,
            confidence_bp: v.confidence_bp.min(10_000),
            provenance: format!("remote:{host}"),
            usage: resp.usage.map(|u| sovir_domain::ReportedUsage {
                tokens_input: u.prompt_tokens,
                tokens_output: u.completion_tokens,
                cost_micro_usd: self.priced_cost(u.prompt_tokens, u.completion_tokens),
            }),
            votes: None,
        })
    }
    fn serves(&self, mode: sovir_domain::PrivacyMode) -> bool {
        // Invariant: remote gateways may only ever serve Standard.
        mode == sovir_domain::PrivacyMode::Standard
    }
}
/// Ordered remote-provider fallback chain (ADR-0012/ADR-0016). The
/// primary gateway is tried first; ANY typed failure — transport error,
/// non-2xx, malformed/unbound response or a provider abstention
/// surfaced as `PortError` — hands the same typed envelope to the next
/// provider, exactly once each. A provider is never retried, so the
/// chain can neither loop nor stall: at most `providers.len()` billable
/// attempts per request, and the council's per-voter timeout wraps the
/// whole chain. When every provider fails the gateway returns the last
/// error — the council then records no remote vote and settles on
/// local votes (fail closed, never an invented verdict).
///
/// `serves` is the union of provider modes; remote providers still only
/// ever serve Standard, so Private requests are filtered before any
/// call exactly like a single remote — the invariant is unchanged.
pub struct FallbackInferenceGateway {
    /// `(label, gateway)` pairs in try-order — first entry is the
    /// primary. The label names the answering provider in provenance
    /// (`remote/{label}:{host}`) so audits show which chain entry —
    /// and therefore which configured endpoint — actually produced
    /// the verdict (`remote/fallback:…` is the degradation signal).
    providers: Vec<(String, Arc<dyn InferenceGateway>)>,
}
impl FallbackInferenceGateway {
    pub fn new(providers: Vec<(String, Arc<dyn InferenceGateway>)>) -> Self {
        Self { providers }
    }
}
#[async_trait]
impl InferenceGateway for FallbackInferenceGateway {
    async fn assess(
        &self,
        req: &sovir_domain::InferenceRequest,
    ) -> Result<sovir_domain::InferenceVerdict, PortError> {
        let mut last_err = PortError::Unavailable;
        for (label, gateway) in &self.providers {
            // Same pre-call privacy gate the council applies — a provider
            // that cannot serve this mode is skipped before any egress.
            if !gateway.serves(req.privacy) {
                continue;
            }
            match gateway.assess(req).await {
                Ok(mut verdict) => {
                    // Remote gateways stamp `remote:{host}`; annotate the
                    // winning chain entry so the audit trail records WHICH
                    // provider answered, not just "a remote".
                    let detail = verdict
                        .provenance
                        .strip_prefix("remote:")
                        .map(str::to_string)
                        .unwrap_or_else(|| verdict.provenance.clone());
                    verdict.provenance = format!("remote/{label}:{detail}");
                    return Ok(verdict);
                }
                Err(e) => last_err = e,
            }
        }
        Err(last_err)
    }
    fn serves(&self, mode: sovir_domain::PrivacyMode) -> bool {
        self.providers.iter().any(|(_, g)| g.serves(mode))
    }
}
/// Threat-intel candidate source from a local JSON fixture file
/// (`SOVIR_INTEL_FIXTURE`). Each pull re-reads the file and returns
/// items with `at_ms >= since_ms`; provenance must already be present
/// in the fixture — this adapter never fabricates it. Missing or
/// unreadable file = empty feed (fail closed), never an error.
pub struct FileThreatIntelFeed {
    path: std::path::PathBuf,
    /// Optional expected sha256 (hex) of the fixture file — integrity check
    /// against a configured digest, NOT signature/authenticity verification.
    expected_sha256: Option<String>,
}
impl FileThreatIntelFeed {
    pub fn new(path: impl Into<std::path::PathBuf>) -> Self {
        Self {
            path: path.into(),
            expected_sha256: None,
        }
    }
    /// Fail closed on digest mismatch or malformed expected hash.
    pub fn with_expected_sha256(mut self, hex_digest: &str) -> Result<Self, PortError> {
        let d = hex_digest.trim().to_ascii_lowercase();
        if d.len() != 64 || !d.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(PortError::Unavailable);
        }
        self.expected_sha256 = Some(d);
        Ok(self)
    }
}
#[async_trait]
impl ThreatIntelFeed for FileThreatIntelFeed {
    async fn pull(&self, since_ms: u64) -> Result<Vec<sovir_domain::IntelIndicator>, PortError> {
        let raw = match std::fs::read(&self.path) {
            Ok(b) => b,
            Err(_) if self.expected_sha256.is_some() => {
                return Err(PortError::Unavailable); // pinned fixture unreadable
            }
            Err(_) => return Ok(Vec::new()),
        };
        if let Some(expected) = &self.expected_sha256 {
            use sha2::Digest;
            let actual = hex::encode(sha2::Sha256::digest(&raw));
            if &actual != expected {
                return Err(PortError::Unavailable); // tampered fixture — fail closed
            }
        }
        let items: Vec<sovir_domain::IntelIndicator> =
            serde_json::from_slice(&raw).map_err(|_| PortError::Storage)?;
        Ok(items.into_iter().filter(|i| i.at_ms >= since_ms).collect())
    }
    async fn record(&self, _ind: sovir_domain::IntelIndicator) -> Result<(), PortError> {
        Err(PortError::Unavailable) // source is read-only; store handles record
    }
    async fn list(&self, _tenant_id: &str) -> Result<Vec<sovir_domain::IntelIndicator>, PortError> {
        Ok(Vec::new()) // store handles list
    }
}

/// Composes a candidate source (pull) with a durable store
/// (record/list). Lets a fixture/remote feed feed the PG or in-memory
/// indicator table without either knowing about the other.
pub struct CompositeThreatIntelFeed {
    source: Arc<dyn ThreatIntelFeed>,
    store: Arc<dyn ThreatIntelFeed>,
}
impl CompositeThreatIntelFeed {
    pub fn new(source: Arc<dyn ThreatIntelFeed>, store: Arc<dyn ThreatIntelFeed>) -> Self {
        Self { source, store }
    }
}
#[async_trait]
impl ThreatIntelFeed for CompositeThreatIntelFeed {
    async fn pull(&self, since_ms: u64) -> Result<Vec<sovir_domain::IntelIndicator>, PortError> {
        self.source.pull(since_ms).await
    }
    async fn record(&self, ind: sovir_domain::IntelIndicator) -> Result<(), PortError> {
        self.store.record(ind).await
    }
    async fn list(&self, tenant_id: &str) -> Result<Vec<sovir_domain::IntelIndicator>, PortError> {
        self.store.list(tenant_id).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sovir_domain::{InferenceRequest, IntelIndicator, PrivacyMode, RiskSignal};
    use std::sync::Mutex as StdMutex;

    /// Egress fake that returns a canned body on post_and_receive and
    /// records what it was asked to send (no network, ever).
    struct FakeEgress {
        response: String,
        sent: StdMutex<Vec<(String, String)>>,
    }
    #[async_trait]
    impl HttpEgress for FakeEgress {
        async fn post(&self, _u: &str, _b: &str, _h: &[(String, String)]) -> Result<(), PortError> {
            Ok(())
        }
        async fn post_and_receive(
            &self,
            url: &str,
            body: &str,
            _h: &[(String, String)],
        ) -> Result<String, PortError> {
            self.sent
                .lock()
                .unwrap()
                .push((url.to_string(), body.to_string()));
            Ok(self.response.clone())
        }
    }

    fn req() -> InferenceRequest {
        InferenceRequest {
            request_id: "r-1".into(),
            signals: vec![RiskSignal::UrgentAction, RiskSignal::PaymentRequest],
            privacy: PrivacyMode::Standard,
            est_cost_micro_usd: 10_000,
            text_hint: None,
        }
    }

    #[tokio::test]
    async fn remote_gateway_serves_standard_only() {
        let gw = RemoteInferenceGateway::new(
            Arc::new(FakeEgress {
                response: "{}".into(),
                sent: StdMutex::new(vec![]),
            }),
            "https://provider.example.com/v1/assess".into(),
            "k".into(),
            "m".into(),
        );
        assert!(gw.serves(PrivacyMode::Standard));
        assert!(!gw.serves(PrivacyMode::Private)); // private never egresses
    }

    #[tokio::test]
    async fn remote_gateway_maps_verdict_with_provenance() {
        let egress = Arc::new(FakeEgress {
            response:
                r#"{"request_id":"r-1","model_id":"m-9","hypotheses":["h1"],"confidence_bp":7000}"#
                    .into(),
            sent: StdMutex::new(vec![]),
        });
        let gw = RemoteInferenceGateway::new(
            egress.clone(),
            "https://provider.example.com/v1/assess".into(),
            "k".into(),
            "m-9".into(),
        );
        let v = gw.assess(&req()).await.unwrap();
        assert_eq!(v.request_id, "r-1");
        assert_eq!(v.model_id, "m-9");
        assert_eq!(v.confidence_bp, 7_000);
        assert_eq!(v.provenance, "remote:provider.example.com");
        // The request carried typed signals only — never content.
        let sent = egress.sent.lock().unwrap();
        let body: serde_json::Value = serde_json::from_str(&sent[0].1).unwrap();
        assert_eq!(body["signals"][0], "URGENT_ACTION");
        assert!(body.get("content").is_none() && body.get("payload").is_none());
    }

    #[tokio::test]
    async fn remote_gateway_rejects_mismatched_request_id() {
        let gw = RemoteInferenceGateway::new(
            Arc::new(FakeEgress {
                response:
                    r#"{"request_id":"other","model_id":"m","hypotheses":[],"confidence_bp":0}"#
                        .into(),
                sent: StdMutex::new(vec![]),
            }),
            "https://provider.example.com/v1/assess".into(),
            "k".into(),
            "m".into(),
        );
        assert!(gw.assess(&req()).await.is_err());
    }

    #[tokio::test]
    async fn remote_gateway_fails_closed_on_recording_egress() {
        // Recording egress has no post_and_receive -> Unavailable, and the
        // verdict can never be fabricated.
        let gw = RemoteInferenceGateway::new(
            Arc::new(RecordingHttpEgress::default()),
            "http://127.0.0.1:9/assess".into(),
            "k".into(),
            "m".into(),
        );
        assert!(matches!(
            gw.assess(&req()).await,
            Err(PortError::Unavailable)
        ));
    }

    fn chat_gw(response_json_content: &str) -> ChatCompletionInferenceGateway {
        let body = format!(
            r#"{{"choices":[{{"message":{{"content":{}}}}}]}}"#,
            serde_json::to_string(response_json_content).unwrap()
        );
        ChatCompletionInferenceGateway::new(
            Arc::new(FakeEgress {
                response: body,
                sent: StdMutex::new(vec![]),
            }),
            "https://inference.baseten.co/v1/chat/completions".into(),
            "k".into(),
            "muse-spark-1.3".into(),
            None,
            None,
        )
    }

    #[tokio::test]
    async fn chat_gateway_serves_standard_only() {
        let gw = chat_gw(r#"{"request_id":"r-1","hypotheses":[],"confidence_bp":0}"#);
        assert!(gw.serves(PrivacyMode::Standard));
        assert!(!gw.serves(PrivacyMode::Private));
    }

    #[tokio::test]
    async fn chat_gateway_maps_verdict_and_filters_taxonomy() {
        let gw = chat_gw(
            r#"{"request_id":"r-1","hypotheses":["credential_phishing","invented_label","urgency_pressure"],"confidence_bp":8200}"#,
        );
        let v = gw.assess(&req()).await.unwrap();
        assert_eq!(v.request_id, "r-1");
        assert_eq!(v.model_id, "muse-spark-1.3"); // configured, not model-claimed
        assert_eq!(
            v.hypotheses,
            vec![
                "credential_phishing".to_string(),
                "urgency_pressure".to_string()
            ]
        );
        assert_eq!(v.confidence_bp, 8_200);
        assert_eq!(v.provenance, "remote:inference.baseten.co");
    }

    #[tokio::test]
    async fn chat_gateway_reports_metered_usage_and_priced_cost() {
        let egress = Arc::new(FakeEgress {
            response: r#"{"choices":[{"message":{"content":"{\"request_id\":\"r-1\",\"hypotheses\":[\"urgency_pressure\"],\"confidence_bp\":4100}"}}],"usage":{"prompt_tokens":320,"completion_tokens":180}}"#
                .into(),
            sent: StdMutex::new(vec![]),
        });
        let gw = ChatCompletionInferenceGateway::new(
            egress,
            "https://inference.baseten.co/v1/chat/completions".into(),
            "k".into(),
            "m".into(),
            Some(2_000_000), // $2 per Mtok input
            Some(6_000_000), // $6 per Mtok output
        );
        let v = gw.assess(&req()).await.unwrap();
        let u = v.usage.expect("usage present in provider response");
        assert_eq!(u.tokens_input, 320);
        assert_eq!(u.tokens_output, 180);
        // 320*$2/M + 180*$6/M = 640 + 1080 = 1720 micro-USD
        assert_eq!(u.cost_micro_usd, Some(1_720));
    }

    #[tokio::test]
    async fn chat_gateway_unpriced_provider_reports_tokens_not_cost() {
        let egress = Arc::new(FakeEgress {
            response: r#"{"choices":[{"message":{"content":"{\"request_id\":\"r-1\",\"hypotheses\":[\"urgency_pressure\"],\"confidence_bp\":4100}"}}],"usage":{"prompt_tokens":10,"completion_tokens":5}}"#
                .into(),
            sent: StdMutex::new(vec![]),
        });
        let gw = ChatCompletionInferenceGateway::new(
            egress,
            "https://inference.baseten.co/v1/chat/completions".into(),
            "k".into(),
            "m".into(),
            None,
            None,
        );
        let v = gw.assess(&req()).await.unwrap();
        let u = v.usage.expect("usage present");
        assert_eq!(u.tokens_input, 10);
        assert_eq!(u.cost_micro_usd, None); // price unknown → settle at estimate
    }

    #[tokio::test]
    async fn chat_gateway_sends_signals_never_content() {
        let egress = Arc::new(FakeEgress {
            response:
                r#"{"choices":[{"message":{"content":"{\"request_id\":\"r-1\",\"hypotheses\":[\"urgency_pressure\"],\"confidence_bp\":4100}"}}]}"#
                    .into(),
            sent: StdMutex::new(vec![]),
        });
        let gw = ChatCompletionInferenceGateway::new(
            egress.clone(),
            "https://inference.baseten.co/v1/chat/completions".into(),
            "k".into(),
            "m".into(),
            None,
            None,
        );
        let _ = gw.assess(&req()).await.unwrap();
        let sent = egress.sent.lock().unwrap();
        let body: serde_json::Value = serde_json::from_str(&sent[0].1).unwrap();
        let user = body["messages"][1]["content"].as_str().unwrap();
        let user_json: serde_json::Value = serde_json::from_str(user).unwrap();
        assert_eq!(user_json["signals"][0], "URGENT_ACTION");
        assert!(user_json.get("content").is_none() && user_json.get("payload").is_none());
        assert!(body.get("tenant_id").is_none() && body.get("principal_id").is_none());
    }

    #[tokio::test]
    async fn chat_gateway_rejects_mismatched_request_id() {
        let gw = chat_gw(r#"{"request_id":"other","hypotheses":[],"confidence_bp":0}"#);
        assert!(gw.assess(&req()).await.is_err());
    }

    #[tokio::test]
    async fn chat_gateway_fails_closed_on_prose_answer() {
        // A chat model that ignores the JSON instruction must never produce
        // a verdict — parse failure is an error, not a guess.
        let gw = chat_gw("I think this looks like phishing, be careful!");
        assert!(gw.assess(&req()).await.is_err());
    }

    #[tokio::test]
    async fn chat_gateway_empty_hypotheses_become_no_pattern() {
        let gw = chat_gw(r#"{"request_id":"r-1","hypotheses":[],"confidence_bp":500}"#);
        let v = gw.assess(&req()).await.unwrap();
        assert_eq!(v.hypotheses, vec!["no_pattern_detected".to_string()]);
    }

    #[tokio::test]
    async fn chat_gateway_strips_code_fences() {
        let gw = chat_gw(
            "```json\n{\"request_id\":\"r-1\",\"hypotheses\":[\"urgency_pressure\"],\"confidence_bp\":4100}\n```",
        );
        let v = gw.assess(&req()).await.unwrap();
        assert_eq!(v.hypotheses, vec!["urgency_pressure".to_string()]);
    }

    #[tokio::test]
    async fn chat_gateway_rejects_injected_request_id() {
        let gw = chat_gw(r#"{"request_id":"r-1","hypotheses":[],"confidence_bp":0}"#);
        let mut bad = req();
        bad.request_id = "x\" onerror".into();
        assert!(matches!(
            gw.assess(&bad).await,
            Err(PortError::Unauthorized)
        ));
    }

    // ---- FallbackInferenceGateway: ordered provider chain (ADR-0012) ----
    fn chat_gw_at(
        endpoint: &str,
        egress: Arc<FakeEgress>,
    ) -> ChatCompletionInferenceGateway {
        ChatCompletionInferenceGateway::new(
            egress,
            endpoint.into(),
            "k".into(),
            "m".into(),
            None,
            None,
        )
    }
    const CHAT_OK: &str = r#"{"choices":[{"message":{"content":"{\"request_id\":\"r-1\",\"hypotheses\":[\"urgency_pressure\"],\"confidence_bp\":4100}"}}]}"#;

    /// Primary answers → its verdict wins, provenance names the primary
    /// chain entry, and the fallback is never called (never billed).
    #[tokio::test]
    async fn fallback_primary_answer_wins_and_fallback_never_called() {
        let fb_egress = Arc::new(FakeEgress {
            response: CHAT_OK.into(),
            sent: StdMutex::new(vec![]),
        });
        let gw = FallbackInferenceGateway::new(vec![
            (
                "primary".into(),
                Arc::new(chat_gw_at(
                    "https://api.llama.example/v1/chat/completions",
                    Arc::new(FakeEgress {
                        response: CHAT_OK.into(),
                        sent: StdMutex::new(vec![]),
                    }),
                )) as _,
            ),
            (
                "fallback".into(),
                Arc::new(chat_gw_at(
                    "https://inference.baseten.co/v1/chat/completions",
                    fb_egress.clone(),
                )) as _,
            ),
        ]);
        let v = gw.assess(&req()).await.unwrap();
        assert_eq!(v.provenance, "remote/primary:api.llama.example");
        assert_eq!(v.hypotheses, vec!["urgency_pressure".to_string()]);
        assert!(fb_egress.sent.lock().unwrap().is_empty());
    }

    /// Primary fails after egress (malformed body → typed error) → the
    /// fallback answers; each provider sees exactly one attempt.
    #[tokio::test]
    async fn fallback_hands_off_once_when_primary_fails() {
        let bad = Arc::new(FakeEgress {
            response: "this is not json".into(), // parse failure ⇒ Err
            sent: StdMutex::new(vec![]),
        });
        let good = Arc::new(FakeEgress {
            response: CHAT_OK.into(),
            sent: StdMutex::new(vec![]),
        });
        let gw = FallbackInferenceGateway::new(vec![
            (
                "primary".into(),
                Arc::new(chat_gw_at(
                    "https://api.llama.example/v1/chat/completions",
                    bad.clone(),
                )) as _,
            ),
            (
                "fallback".into(),
                Arc::new(chat_gw_at(
                    "https://inference.baseten.co/v1/chat/completions",
                    good.clone(),
                )) as _,
            ),
        ]);
        let v = gw.assess(&req()).await.unwrap();
        assert_eq!(v.provenance, "remote/fallback:inference.baseten.co");
        assert_eq!(v.hypotheses, vec!["urgency_pressure".to_string()]);
        // Bounded: one attempt per provider — never a retry loop.
        assert_eq!(bad.sent.lock().unwrap().len(), 1);
        assert_eq!(good.sent.lock().unwrap().len(), 1);
    }

    /// Every provider failing = the remote voter errors — the council
    /// records no remote vote and settles on local votes (fail closed).
    #[tokio::test]
    async fn fallback_all_providers_fail_is_fail_closed() {
        let gw = FallbackInferenceGateway::new(vec![
            (
                "primary".into(),
                Arc::new(chat_gw_at(
                    "https://api.llama.example/v1/chat/completions",
                    Arc::new(FakeEgress {
                        response: "junk".into(),
                        sent: StdMutex::new(vec![]),
                    }),
                )) as _,
            ),
            (
                "fallback".into(),
                Arc::new(chat_gw_at(
                    "https://inference.baseten.co/v1/chat/completions",
                    Arc::new(FakeEgress {
                        response: "junk".into(),
                        sent: StdMutex::new(vec![]),
                    }),
                )) as _,
            ),
        ]);
        assert!(gw.assess(&req()).await.is_err());
    }

    /// Privacy invariant survives the chain: remote providers only
    /// serve Standard, so a Private request errors WITHOUT touching any
    /// provider — same fail-closed posture as a single remote.
    #[tokio::test]
    async fn fallback_private_mode_never_egresses() {
        let e1 = Arc::new(FakeEgress {
            response: CHAT_OK.into(),
            sent: StdMutex::new(vec![]),
        });
        let e2 = Arc::new(FakeEgress {
            response: CHAT_OK.into(),
            sent: StdMutex::new(vec![]),
        });
        let gw = FallbackInferenceGateway::new(vec![
            (
                "primary".into(),
                Arc::new(chat_gw_at("https://a.example/v1/chat/completions", e1.clone()))
                    as _,
            ),
            (
                "fallback".into(),
                Arc::new(chat_gw_at("https://b.example/v1/chat/completions", e2.clone()))
                    as _,
            ),
        ]);
        assert!(gw.serves(PrivacyMode::Standard));
        assert!(!gw.serves(PrivacyMode::Private));
        let mut private_req = req();
        private_req.privacy = PrivacyMode::Private;
        assert!(gw.assess(&private_req).await.is_err());
        assert!(e1.sent.lock().unwrap().is_empty());
        assert!(e2.sent.lock().unwrap().is_empty());
    }

    fn fixture_file(items: &[IntelIndicator]) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "sovir-intel-{}-{}.json",
            std::process::id(),
            uuid::Uuid::new_v4().simple()
        ));
        std::fs::write(&path, serde_json::to_string(items).unwrap()).unwrap();
        path
    }
    fn ind(id: &str, at_ms: u64) -> IntelIndicator {
        IntelIndicator {
            indicator_id: id.into(),
            tenant_id: String::new(),
            kind: "domain".into(),
            value: "x.example.com".into(),
            confidence_bp: 9_000,
            provenance: "fixture:v1".into(),
            at_ms,
        }
    }

    #[tokio::test]
    async fn file_feed_pulls_and_filters_by_since() {
        let path = fixture_file(&[ind("old", 10), ind("new", 100)]);
        let feed = FileThreatIntelFeed::new(&path);
        let items = feed.pull(50).await.unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].indicator_id, "new");
        std::fs::remove_file(&path).ok();
    }

    #[tokio::test]
    async fn file_feed_missing_file_is_empty_not_error() {
        let feed = FileThreatIntelFeed::new("definitely-not-here.json");
        assert!(feed.pull(0).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn composite_feed_pulls_source_and_stores_to_sink() {
        let path = fixture_file(&[ind("i1", 100)]);
        let store = Arc::new(InMemoryThreatIntel::default());
        let feed =
            CompositeThreatIntelFeed::new(Arc::new(FileThreatIntelFeed::new(&path)), store.clone());
        assert_eq!(feed.pull(0).await.unwrap().len(), 1);
        let mut i = ind("i1", 100);
        i.tenant_id = "t".into();
        feed.record(i).await.unwrap();
        assert_eq!(feed.list("t").await.unwrap().len(), 1);
        std::fs::remove_file(&path).ok();
    }

    struct StaticGetEgress {
        body: Option<String>,
    }
    #[async_trait]
    impl HttpEgress for StaticGetEgress {
        async fn post(&self, _u: &str, _b: &str, _h: &[(String, String)]) -> Result<(), PortError> {
            Ok(())
        }
        async fn get(&self, _u: &str, _h: &[(String, String)]) -> Result<String, PortError> {
            self.body.clone().ok_or(PortError::Unavailable)
        }
    }
    const OIDC_SECRET: &[u8] = b"test-hs256-secret-do-not-use-in-prod";
    fn jwks_doc() -> String {
        // base64url(OIDC_SECRET) — precomputed, no padding (RFC 7518).
        let k = "dGVzdC1oczI1Ni1zZWNyZXQtZG8tbm90LXVzZS1pbi1wcm9k";
        format!(r#"{{"keys":[{{"kty":"oct","kid":"k1","alg":"HS256","k":"{k}"}}]}}"#)
    }
    fn oidc_verifier(body: Option<String>) -> JwksIdentityVerifier {
        JwksIdentityVerifier::new(
            "https://issuer.example/jwks.json",
            "https://issuer.example",
            "sovir-api",
            "tenant_id",
            "sub",
            vec![jsonwebtoken::Algorithm::HS256],
            Arc::new(StaticGetEgress { body }),
        )
    }
    fn oidc_token(iss: &str, aud: &str, exp: u64) -> String {
        #[derive(serde::Serialize)]
        struct C<'a> {
            iss: &'a str,
            aud: &'a str,
            exp: u64,
            sub: &'a str,
            tenant_id: &'a str,
        }
        let mut h = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::HS256);
        h.kid = Some("k1".into());
        jsonwebtoken::encode(
            &h,
            &C {
                iss,
                aud,
                exp,
                sub: "alice",
                tenant_id: "tenant-a",
            },
            &jsonwebtoken::EncodingKey::from_secret(OIDC_SECRET),
        )
        .unwrap()
    }
    fn future_exp() -> u64 {
        (std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs())
            + 600
    }
    use sovir_ports::IdentityVerifier;
    #[tokio::test]
    async fn jwks_verify_valid_token_yields_claims() {
        let v = oidc_verifier(Some(jwks_doc()));
        let t = oidc_token("https://issuer.example", "sovir-api", future_exp());
        let id = v.verify(&t).await.unwrap();
        assert_eq!(id.tenant_id, "tenant-a");
        assert_eq!(id.principal_id, "alice");
    }
    #[tokio::test]
    async fn jwks_rejects_wrong_issuer_audience_and_expiry() {
        let v = oidc_verifier(Some(jwks_doc()));
        for t in [
            oidc_token("https://evil.example", "sovir-api", future_exp()),
            oidc_token("https://issuer.example", "other-api", future_exp()),
            oidc_token("https://issuer.example", "sovir-api", 1),
        ] {
            assert!(matches!(v.verify(&t).await, Err(PortError::Unauthorized)));
        }
    }
    #[tokio::test]
    async fn jwks_rejects_unknown_kid_and_unavailable_jwks() {
        let mut h = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::HS256);
        h.kid = Some("missing".into());
        #[derive(serde::Serialize)]
        struct C {
            iss: &'static str,
            aud: &'static str,
            exp: u64,
            sub: &'static str,
            tenant_id: &'static str,
        }
        let c = C {
            iss: "https://issuer.example",
            aud: "sovir-api",
            exp: future_exp(),
            sub: "alice",
            tenant_id: "tenant-a",
        };
        let bad_kid =
            jsonwebtoken::encode(&h, &c, &jsonwebtoken::EncodingKey::from_secret(OIDC_SECRET))
                .unwrap();
        let v = oidc_verifier(Some(jwks_doc()));
        assert!(matches!(
            v.verify(&bad_kid).await,
            Err(PortError::Unauthorized)
        ));
        // JWKS endpoint unreachable -> fails closed (Unavailable propagates
        // honestly; it is transient, not a credential rejection).
        let v2 = oidc_verifier(None);
        assert!(v2
            .verify(&oidc_token(
                "https://issuer.example",
                "sovir-api",
                future_exp()
            ))
            .await
            .is_err());
    }
    #[tokio::test]
    async fn jwks_rejects_alg_not_allowlisted() {
        // HS512 signed token against an HS256-allowlisted verifier.
        let mut h = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::HS512);
        h.kid = Some("k1".into());
        #[derive(serde::Serialize)]
        struct C {
            iss: &'static str,
            aud: &'static str,
            exp: u64,
            sub: &'static str,
            tenant_id: &'static str,
        }
        let t = jsonwebtoken::encode(
            &h,
            &C {
                iss: "https://issuer.example",
                aud: "sovir-api",
                exp: future_exp(),
                sub: "a",
                tenant_id: "t",
            },
            &jsonwebtoken::EncodingKey::from_secret(OIDC_SECRET),
        )
        .unwrap();
        let v = oidc_verifier(Some(jwks_doc()));
        assert!(matches!(v.verify(&t).await, Err(PortError::Unauthorized)));
    }
    #[tokio::test]
    async fn file_feed_sha256_integrity() {
        use sha2::Digest;
        let path = fixture_file(&[ind("i1", 100)]);
        let digest = hex::encode(sha2::Sha256::digest(std::fs::read(&path).unwrap()));
        // Matching digest -> pulls.
        let ok = FileThreatIntelFeed::new(&path)
            .with_expected_sha256(&digest)
            .unwrap();
        assert_eq!(ok.pull(0).await.unwrap().len(), 1);
        // Mismatched digest -> fail closed.
        let bad = FileThreatIntelFeed::new(&path)
            .with_expected_sha256(&"0".repeat(64))
            .unwrap();
        assert!(matches!(bad.pull(0).await, Err(PortError::Unavailable)));
        // Malformed expected hash -> rejected at config time.
        assert!(FileThreatIntelFeed::new(&path)
            .with_expected_sha256("not-hex")
            .is_err());
        std::fs::remove_file(&path).ok();
    }

    fn inf_req(
        signals: &[sovir_domain::RiskSignal],
        privacy: sovir_domain::PrivacyMode,
    ) -> sovir_domain::InferenceRequest {
        sovir_domain::InferenceRequest {
            request_id: "req-t".into(),
            signals: signals.to_vec(),
            privacy,
            est_cost_micro_usd: 0,
            text_hint: None,
        }
    }
    #[tokio::test]
    async fn heuristic_local_serves_private_with_honest_hypotheses() {
        use sovir_domain::RiskSignal::*;
        let g = HeuristicLocalInferenceGateway;
        // Both modes (ADR-0025): as a council voter it reads typed signals
        // and never egresses — a Standard-mode vote is local proposal
        // material, not a privacy change.
        assert!(g.serves(sovir_domain::PrivacyMode::Private));
        assert!(g.serves(sovir_domain::PrivacyMode::Standard));
        // Credential + unverified identity -> phishing hypothesis.
        let v = g
            .assess(&inf_req(
                &[CredentialRequest, IdentityUnverified],
                sovir_domain::PrivacyMode::Private,
            ))
            .await
            .unwrap();
        assert!(v.hypotheses.contains(&"credential_phishing".to_string()));
        // v0.2 weighted evidence: credential 5500 + identity 3500 = 9000
        // (graduated score, not a fixed rule constant).
        assert_eq!(v.confidence_bp, 9000);
        assert_eq!(v.request_id, "req-t");
        assert!(v.model_id.contains("heuristic"));
        assert!(v.provenance.contains("local_heuristic"));
        // Standard mode produces the same deterministic local verdict —
        // under the council that vote competes with remote hypotheses.
        let v3 = g
            .assess(&inf_req(
                &[PaymentRequest, UrgentAction],
                sovir_domain::PrivacyMode::Standard,
            ))
            .await
            .unwrap();
        assert!(v3.hypotheses.contains(&"payment_fraud_attempt".to_string()));
        // Empty signal set -> honest low-confidence negative.
        let v2 = g
            .assess(&inf_req(&[], sovir_domain::PrivacyMode::Private))
            .await
            .unwrap();
        assert_eq!(v2.hypotheses, vec!["no_pattern_detected".to_string()]);
        assert_eq!(v2.confidence_bp, 1000);
    }
    #[tokio::test]
    async fn composite_routes_private_to_local_never_remote() {
        use sovir_domain::RiskSignal::*;
        // Remote absent: private served locally, standard refused.
        let g = CompositeInferenceGateway::new(Arc::new(HeuristicLocalInferenceGateway), None);
        assert!(g.serves(sovir_domain::PrivacyMode::Private));
        assert!(!g.serves(sovir_domain::PrivacyMode::Standard));
        let v = g
            .assess(&inf_req(
                &[PaymentRequest, UrgentAction],
                sovir_domain::PrivacyMode::Private,
            ))
            .await
            .unwrap();
        assert!(v.hypotheses.contains(&"payment_fraud_attempt".to_string()));
        // With remote present: private STILL routed local (never egresses).
        let g2 = CompositeInferenceGateway::new(
            Arc::new(HeuristicLocalInferenceGateway),
            Some(Arc::new(RemoteInferenceGateway::new(
                Arc::new(RecordingHttpEgress::default()),
                "https://provider.example/assess".to_string(),
                "key".to_string(),
                "model-x".to_string(),
            ))),
        );
        assert!(g2.serves(sovir_domain::PrivacyMode::Standard));
        let v2 = g2
            .assess(&inf_req(
                &[TrackingObserved],
                sovir_domain::PrivacyMode::Private,
            ))
            .await
            .unwrap();
        assert!(v2.provenance.contains("local_heuristic"));
    }
    // ---- ADR-0025: CouncilGateway — multi-voter fan-out, typed votes ----

    /// Programmable voter for council tests: fixed verdict or failure,
    /// serves a chosen privacy-mode set.
    struct StubVoter {
        hypotheses: Vec<String>,
        confidence_bp: u16,
        usage: Option<sovir_domain::ReportedUsage>,
        serve_standard: bool,
        fail: bool,
        delay_ms: u64,
    }
    #[async_trait]
    impl InferenceGateway for StubVoter {
        async fn assess(
            &self,
            req: &sovir_domain::InferenceRequest,
        ) -> Result<sovir_domain::InferenceVerdict, PortError> {
            if self.delay_ms > 0 {
                tokio::time::sleep(std::time::Duration::from_millis(self.delay_ms)).await;
            }
            if self.fail {
                return Err(PortError::Unavailable);
            }
            Ok(sovir_domain::InferenceVerdict {
                request_id: req.request_id.clone(),
                model_id: "stub-voter-1".into(),
                hypotheses: self.hypotheses.clone(),
                confidence_bp: self.confidence_bp,
                provenance: "stub".into(),
                usage: self.usage,
                votes: None,
            })
        }
        fn serves(&self, mode: sovir_domain::PrivacyMode) -> bool {
            match mode {
                sovir_domain::PrivacyMode::Private => true,
                sovir_domain::PrivacyMode::Standard => self.serve_standard,
            }
        }
    }
    fn stub_voter(hypotheses: &[&str], confidence_bp: u16) -> StubVoter {
        StubVoter {
            hypotheses: hypotheses.iter().map(|s| s.to_string()).collect(),
            confidence_bp,
            usage: None,
            serve_standard: true,
            fail: false,
            delay_ms: 0,
        }
    }
    /// A voter slower than the hard bound is recorded as an auditable
    /// abstention (provenance `abstain:voter_timeout`, hypothesis
    /// `no_pattern_detected`) instead of stalling the council.
    #[tokio::test]
    async fn council_slow_voter_records_abstention_not_stall() {
        use sovir_domain::RiskSignal::*;
        let mut slow = stub_voter(&["payment_fraud_attempt"], 9000);
        slow.delay_ms = 300;
        let fast = stub_voter(&["urgent_action"], 5000);
        let council = CouncilGateway::new(vec![
            ("slow".into(), Arc::new(slow) as _),
            ("fast".into(), Arc::new(fast) as _),
        ])
        .with_voter_timeout(std::time::Duration::from_millis(60));
        let started = std::time::Instant::now();
        let v = council
            .assess(&inf_req(
                &[UrgentAction],
                sovir_domain::PrivacyMode::Private,
            ))
            .await
            .unwrap();
        assert!(started.elapsed() < std::time::Duration::from_millis(300));
        let votes = v.votes.as_ref().unwrap();
        let abstain = votes.iter().find(|vote| vote.voter == "slow").unwrap();
        assert_eq!(abstain.provenance, "abstain:voter_timeout");
        assert_eq!(abstain.hypotheses, vec!["no_pattern_detected".to_string()]);
        assert!(votes.iter().any(|vote| vote.voter == "fast"));
        assert!(v.hypotheses.iter().all(|h| h != "abstain:voter_timeout"));
    }
    /// Private mode: the remote voter is filtered by `serves` BEFORE any
    /// call — the egress recorder must stay empty (invariant: Private can
    /// never reach a provider).
    #[tokio::test]
    async fn council_private_excludes_remote_before_call() {
        use sovir_domain::RiskSignal::*;
        let egress = Arc::new(RecordingHttpEgress::default());
        let remote: Arc<dyn InferenceGateway> = Arc::new(RemoteInferenceGateway::new(
            egress.clone(),
            "https://provider.example/assess".to_string(),
            "key".to_string(),
            "model-x".to_string(),
        ));
        let council = CouncilGateway::new(vec![
            (
                "heuristic".into(),
                Arc::new(HeuristicLocalInferenceGateway) as _,
            ),
            ("remote".into(), remote),
        ]);
        let v = council
            .assess(&inf_req(
                &[PaymentRequest, UrgentAction],
                sovir_domain::PrivacyMode::Private,
            ))
            .await
            .unwrap();
        assert!(egress.0.lock().unwrap().is_empty()); // remote never called
        let votes = v.votes.as_ref().unwrap();
        assert_eq!(votes.len(), 1);
        assert_eq!(votes[0].voter, "heuristic");
        assert!(v.provenance.contains("council:single"));
    }
    /// Standard mode: local + remote both vote; the verdict merges the
    /// hypothesis union (ranked by voter confidence) and records votes.
    #[tokio::test]
    async fn council_standard_merges_two_votes() {
        use sovir_domain::RiskSignal::*;
        let mut remote = stub_voter(&["payment_fraud_attempt", "romance_bait"], 8000);
        remote.usage = Some(sovir_domain::ReportedUsage {
            tokens_input: 100,
            tokens_output: 50,
            cost_micro_usd: Some(2000),
        });
        let council = CouncilGateway::new(vec![
            (
                "heuristic".into(),
                Arc::new(HeuristicLocalInferenceGateway) as _,
            ),
            ("remote".into(), Arc::new(remote) as _),
        ]);
        let v = council
            .assess(&inf_req(
                &[PaymentRequest, UrgentAction],
                sovir_domain::PrivacyMode::Standard,
            ))
            .await
            .unwrap();
        let votes = v.votes.as_ref().unwrap();
        assert_eq!(votes.len(), 2);
        assert!(votes.iter().any(|x| x.voter == "heuristic"));
        assert!(votes.iter().any(|x| x.voter == "remote"));
        // Shared hypothesis (payment_fraud_attempt) -> agree.
        assert!(v.provenance.contains("council:agree"));
        assert!(v.hypotheses.contains(&"payment_fraud_attempt".to_string()));
        assert!(v.hypotheses.contains(&"romance_bait".to_string()));
        // Aggregate usage = remote voter's priced cost.
        assert_eq!(v.usage.unwrap().cost_micro_usd, Some(2000));
    }
    /// No shared hypothesis across voters -> disputed, not majority.
    #[tokio::test]
    async fn council_marks_dispute_on_disjoint_votes() {
        use sovir_domain::RiskSignal::*;
        let remote = stub_voter(&["benign_page"], 9000);
        let council = CouncilGateway::new(vec![
            (
                "heuristic".into(),
                Arc::new(HeuristicLocalInferenceGateway) as _,
            ),
            ("remote".into(), Arc::new(remote) as _),
        ]);
        let v = council
            .assess(&inf_req(
                &[PaymentRequest],
                sovir_domain::PrivacyMode::Standard,
            ))
            .await
            .unwrap();
        assert!(v.provenance.contains("disputed"));
        // Dispute does not drop votes — arbitration sees both positions.
        assert_eq!(v.votes.as_ref().unwrap().len(), 2);
    }
    /// A failing voter is skipped: surviving voters still produce a
    /// verdict (fail-open per voter, fail-closed when ALL fail).
    #[tokio::test]
    async fn council_survives_voter_failure_and_all_fail_refuses() {
        use sovir_domain::RiskSignal::*;
        let mut broken = stub_voter(&[], 0);
        broken.fail = true;
        let council = CouncilGateway::new(vec![
            (
                "heuristic".into(),
                Arc::new(HeuristicLocalInferenceGateway) as _,
            ),
            ("remote".into(), Arc::new(broken) as _),
        ]);
        let v = council
            .assess(&inf_req(
                &[PaymentRequest],
                sovir_domain::PrivacyMode::Standard,
            ))
            .await
            .unwrap();
        assert_eq!(v.votes.as_ref().unwrap().len(), 1);
        assert!(v.provenance.contains("council:single"));
        // All voters fail -> Unavailable (no silent empty verdict).
        let mut b1 = stub_voter(&[], 0);
        b1.fail = true;
        let dead = CouncilGateway::new(vec![("only".into(), Arc::new(b1) as _)]);
        assert!(matches!(
            dead.assess(&inf_req(
                &[PaymentRequest],
                sovir_domain::PrivacyMode::Standard
            ))
            .await,
            Err(PortError::Unavailable)
        ));
    }
    /// ADR-0025 token-saver: a confident local verdict settles the case —
    /// the deferred remote voter is never invoked (egress stays empty).
    #[tokio::test]
    async fn council_confident_local_settles_without_remote_call() {
        use sovir_domain::RiskSignal::*;
        let egress = Arc::new(RecordingHttpEgress::default());
        let remote: Arc<dyn InferenceGateway> = Arc::new(RemoteInferenceGateway::new(
            egress.clone(),
            "https://provider.example/assess".to_string(),
            "key".to_string(),
            "model-x".to_string(),
        ));
        let council = CouncilGateway::deferred(
            vec![(
                "heuristic".into(),
                Arc::new(HeuristicLocalInferenceGateway) as _,
            )],
            vec![("remote".into(), remote)],
            8_000,
        );
        // credential 5500 + identity 3500 = 9000 >= settle_bp -> settled.
        let v = council
            .assess(&inf_req(
                &[CredentialRequest, IdentityUnverified],
                sovir_domain::PrivacyMode::Standard,
            ))
            .await
            .unwrap();
        assert!(egress.0.lock().unwrap().is_empty()); // remote NEVER called
        assert_eq!(v.votes.as_ref().unwrap().len(), 1);
        assert!(v.provenance.contains("council:local_settled"));
    }
    /// Under-confidence local votes do NOT settle: the deferred remote
    /// voter is consulted and its vote joins the verdict.
    #[tokio::test]
    async fn council_ambiguous_case_consults_deferred_remote() {
        use sovir_domain::RiskSignal::*;
        let mut remote = stub_voter(&["payment_fraud_attempt"], 7_500);
        remote.usage = Some(sovir_domain::ReportedUsage {
            tokens_input: 10,
            tokens_output: 5,
            cost_micro_usd: Some(100),
        });
        let council = CouncilGateway::deferred(
            vec![(
                "heuristic".into(),
                Arc::new(HeuristicLocalInferenceGateway) as _,
            )],
            vec![("remote".into(), Arc::new(remote) as _)],
            8_000,
        );
        // UrgentAction alone stays under the local threshold -> no
        // settled position -> the remote vote is collected.
        let v = council
            .assess(&inf_req(
                &[UrgentAction],
                sovir_domain::PrivacyMode::Standard,
            ))
            .await
            .unwrap();
        let votes = v.votes.as_ref().unwrap();
        assert!(votes.iter().any(|x| x.voter == "remote"));
        assert!(!v.provenance.contains("local_settled"));
        assert_eq!(v.usage.unwrap().cost_micro_usd, Some(100));
    }
    /// B21 metering regression: when only local voters decide, the
    /// verdict carries a measured ZERO cost — never an unpriced None that
    /// would settle at the configured estimate. (Private calls were being
    /// billed $0.01 each while a remote provider was merely configured.)
    #[tokio::test]
    async fn council_local_only_verdict_reports_measured_zero_cost() {
        use sovir_domain::RiskSignal::*;
        let egress = Arc::new(RecordingHttpEgress::default());
        let remote: Arc<dyn InferenceGateway> = Arc::new(RemoteInferenceGateway::new(
            egress.clone(),
            "https://provider.example/assess".to_string(),
            "key".to_string(),
            "model-x".to_string(),
        ));
        let council = CouncilGateway::deferred(
            vec![(
                "heuristic".into(),
                Arc::new(HeuristicLocalInferenceGateway) as _,
            )],
            vec![("remote".into(), remote)],
            8_000,
        );
        // Private: the remote voter is filtered before any call.
        // Standard + confident local: settled before the deferred voter.
        // Both produce local-only votes and must meter exactly $0.
        for privacy in [
            sovir_domain::PrivacyMode::Private,
            sovir_domain::PrivacyMode::Standard,
        ] {
            let v = council
                .assess(&inf_req(&[CredentialRequest, IdentityUnverified], privacy))
                .await
                .unwrap();
            let u = v.usage.expect("local council reports measured usage");
            assert_eq!(u.cost_micro_usd, Some(0));
            assert_eq!(u.tokens_input + u.tokens_output, 0);
        }
        assert!(egress.0.lock().unwrap().is_empty());
    }
    /// Conservative billing: a remote voter that answered but reported
    /// no metering keeps verdict usage None, so the reservation settles
    /// at the estimate instead of recording $0 for real egress.
    #[tokio::test]
    async fn council_unpriced_remote_vote_keeps_usage_unknown() {
        use sovir_domain::RiskSignal::*;
        let remote = stub_voter(&["payment_fraud_attempt"], 7_500); // usage: None
        let council = CouncilGateway::deferred(
            vec![(
                "heuristic".into(),
                Arc::new(HeuristicLocalInferenceGateway) as _,
            )],
            vec![("remote".into(), Arc::new(remote) as _)],
            8_000,
        );
        // UrgentAction alone stays under the local settle threshold →
        // the unpriced remote vote is collected.
        let v = council
            .assess(&inf_req(
                &[UrgentAction],
                sovir_domain::PrivacyMode::Standard,
            ))
            .await
            .unwrap();
        assert!(v
            .votes
            .as_ref()
            .unwrap()
            .iter()
            .any(|x| x.voter == "remote"));
        assert!(v.usage.is_none());
    }
    /// Privacy invariant (ADR-0025): a request carrying `text_hint` must
    /// never put raw text on the wire — the remote envelope is built
    /// field-by-field. Asserted at the egress recording.
    #[tokio::test]
    async fn remote_envelope_never_carries_text_hint() {
        use sovir_domain::RiskSignal::*;
        let egress = Arc::new(FakeEgress {
            response: r#"{"request_id":"req-t","model_id":"model-x","hypotheses":["x"],"confidence_bp":1,"provenance":"p"}"#.to_string(),
            sent: std::sync::Mutex::new(Vec::new()),
        });
        let remote = RemoteInferenceGateway::new(
            egress.clone(),
            "https://provider.example/assess".to_string(),
            "key".to_string(),
            "model-x".to_string(),
        );
        let mut req = inf_req(&[PaymentRequest], sovir_domain::PrivacyMode::Standard);
        req.text_hint = Some("si no pagas publicamos tus fotos".to_string());
        let _ = remote.assess(&req).await;
        let body = egress.sent.lock().unwrap()[0].1.clone();
        assert!(
            !body.contains("text_hint") && !body.contains("si no pagas"),
            "raw text leaked into the remote envelope: {body}"
        );
    }
    /// Registry coverage (ADR-0025): every voter NAME wired into the
    /// council must have a model card in `ml/model-cards/` — a voter
    /// without documented provenance is an audit gap.
    #[test]
    fn council_voter_names_have_model_cards() {
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../ml/model-cards");
        let registry: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(format!("{dir}/registry.json")).expect("read voter registry"),
        )
        .expect("parse voter registry");
        for voter in registry["voters"].as_array().unwrap() {
            let card = voter["card"].as_str().unwrap();
            assert!(
                voter["status"].is_string()
                    || std::path::Path::new(&format!("{dir}/{card}")).exists(),
                "voter {:?} registered without an existing card file {card}",
                voter["name"]
            );
        }
        // The names wired in services/api must all be registered.
        for wired in ["heuristic", "remote", "onnx-visual"] {
            assert!(
                registry["voters"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|v| v["name"] == wired),
                "wired voter {wired} missing from registry.json"
            );
        }
    }
    // ---- B21: RemoteInferenceGateway smoke against a real local stub ----

    /// Minimal HTTP/1.1 stub on loopback for the smoke suite. Serves a
    /// programmed response and counts accepted requests so tests can
    /// assert zero retries. std-only — no test dependencies.
    struct StubHttp {
        addr: std::net::SocketAddr,
        hits: std::sync::Arc<std::sync::atomic::AtomicUsize>,
        last_body: std::sync::Arc<std::sync::Mutex<String>>,
        stop: std::sync::Arc<std::sync::atomic::AtomicBool>,
    }
    impl StubHttp {
        /// `respond` maps an incoming request body to (status, body).
        /// `hold_ms` makes the handler sleep before answering (timeout test).
        fn spawn(respond: impl Fn(&str) -> (u16, String) + Send + 'static, hold_ms: u64) -> Self {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let addr = listener.local_addr().unwrap();
            let hits = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
            let last_body = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
            let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
            let (h2, b2, s2) = (hits.clone(), last_body.clone(), stop.clone());
            std::thread::spawn(move || {
                use std::io::{Read, Write};
                while !s2.load(std::sync::atomic::Ordering::Relaxed) {
                    let Ok((mut sock, _)) = listener.accept() else {
                        break;
                    };
                    h2.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    sock.set_read_timeout(Some(std::time::Duration::from_secs(8)))
                        .ok();
                    // Read headers (body may already share the segment).
                    let mut buf = Vec::new();
                    let mut chunk = [0u8; 4096];
                    let mut header_end = None;
                    loop {
                        let n = sock.read(&mut chunk).unwrap_or(0);
                        if n == 0 {
                            break;
                        }
                        buf.extend_from_slice(&chunk[..n]);
                        if let Some(pos) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                            header_end = Some(pos + 4);
                            break;
                        }
                    }
                    let Some(split) = header_end else { continue };
                    let text = String::from_utf8_lossy(&buf[..split]);
                    let len = text
                        .split("\r\n")
                        .find_map(|l| {
                            l.to_ascii_lowercase()
                                .strip_prefix("content-length: ")
                                .and_then(|v| v.trim().parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    let mut body_bytes = buf[split..].to_vec();
                    while body_bytes.len() < len {
                        let n = sock.read(&mut chunk).unwrap_or(0);
                        if n == 0 {
                            break;
                        }
                        body_bytes.extend_from_slice(&chunk[..n]);
                    }
                    let req_body = String::from_utf8_lossy(&body_bytes).to_string();
                    *b2.lock().unwrap() = req_body.clone();
                    let (status, payload) = respond(&req_body);
                    let reason = match status {
                        200 => "OK",
                        400 => "Bad Request",
                        500 => "Internal Server Error",
                        _ => "X",
                    };
                    if hold_ms > 0 {
                        std::thread::sleep(std::time::Duration::from_millis(hold_ms));
                    }
                    let res = format!(
                        "HTTP/1.1 {status} {reason}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{payload}",
                        payload.len()
                    );
                    let _ = sock.write_all(res.as_bytes());
                }
            });
            Self {
                addr,
                hits,
                last_body,
                stop,
            }
        }
        fn url(&self) -> String {
            format!("http://{}/assess", self.addr)
        }
        fn hits(&self) -> usize {
            self.hits.load(std::sync::atomic::Ordering::Relaxed)
        }
    }
    impl Drop for StubHttp {
        fn drop(&mut self) {
            self.stop.store(true, std::sync::atomic::Ordering::Relaxed);
            // Nudge the listener out of accept().
            let _ = std::net::TcpStream::connect(self.addr);
        }
    }

    fn remote_gw(url: &str) -> RemoteInferenceGateway {
        RemoteInferenceGateway::new(
            Arc::new(ReqwestHttpEgress::new(vec!["127.0.0.1".to_string()])),
            url.to_string(),
            "test-key".to_string(),
            "model-x".to_string(),
        )
    }
    fn inf_req_id(id: &str) -> InferenceRequest {
        InferenceRequest {
            request_id: id.to_string(),
            signals: vec![RiskSignal::UrgentAction],
            privacy: PrivacyMode::Standard,
            est_cost_micro_usd: 10,
            text_hint: None,
        }
    }

    #[tokio::test]
    async fn remote_gw_real_http_roundtrip() {
        let stub = StubHttp::spawn(
            |body| {
                let v: serde_json::Value = serde_json::from_str(body).unwrap();
                let rid = v["request_id"].as_str().unwrap_or("?").to_string();
                (
                    200,
                    serde_json::json!({
                        "request_id": rid, "model_id": "model-x",
                        "hypotheses": ["h1"], "confidence_bp": 9000
                    })
                    .to_string(),
                )
            },
            0,
        );
        let gw = remote_gw(&stub.url());
        let v = gw.assess(&inf_req_id("req-abc")).await.unwrap();
        assert_eq!(v.request_id, "req-abc");
        assert_eq!(v.model_id, "model-x");
        assert!(v.provenance.starts_with("remote:"));
        assert_eq!(stub.hits(), 1, "exactly one HTTP call — zero retries");
        // Real serialization reached the wire: signals + model present.
        let sent = stub.last_body.lock().unwrap().clone();
        assert!(
            sent.contains("request_id") && sent.contains("signals") && sent.contains("model-x")
        );
    }

    #[tokio::test]
    async fn remote_gw_5xx_and_4xx_map_to_port_errors() {
        let stub = StubHttp::spawn(|_| (500, "{}".into()), 0);
        let gw = remote_gw(&stub.url());
        let err = gw.assess(&inf_req_id("req-1")).await.unwrap_err();
        assert!(matches!(err, PortError::Unavailable));
        assert_eq!(stub.hits(), 1);
        let stub4 = StubHttp::spawn(|_| (400, "{}".into()), 0);
        let gw4 = remote_gw(&stub4.url());
        let err4 = gw4.assess(&inf_req_id("req-2")).await.unwrap_err();
        assert!(matches!(err4, PortError::Unavailable));
    }

    #[tokio::test]
    async fn remote_gw_malformed_body_maps_to_storage() {
        let stub = StubHttp::spawn(|_| (200, "not-json{".into()), 0);
        let gw = remote_gw(&stub.url());
        let err = gw.assess(&inf_req_id("req-3")).await.unwrap_err();
        assert!(matches!(err, PortError::Storage));
    }

    #[tokio::test]
    async fn remote_gw_verdict_bound_to_request_id() {
        let stub = StubHttp::spawn(
            |_| {
                (
                    200,
                    serde_json::json!({
                        "request_id": "OTHER", "model_id": "model-x"
                    })
                    .to_string(),
                )
            },
            0,
        );
        let gw = remote_gw(&stub.url());
        let err = gw.assess(&inf_req_id("req-4")).await.unwrap_err();
        assert!(matches!(err, PortError::Storage));
    }

    #[tokio::test]
    async fn remote_gw_injected_request_id_never_egresses() {
        let stub = StubHttp::spawn(|_| (200, "{}".into()), 0);
        let gw = remote_gw(&stub.url());
        // Quote + whitespace injection attempt in request_id.
        let err = gw
            .assess(&inf_req_id("req\"; DROP TABLE sessions; --"))
            .await
            .unwrap_err();
        assert!(matches!(err, PortError::Unauthorized));
        assert_eq!(stub.hits(), 0, "rejected before any egress");
    }

    #[tokio::test]
    async fn remote_gw_timeout_maps_to_error_no_retry() {
        // Stub holds the response past the 5s client timeout.
        let stub = StubHttp::spawn(|_| (200, "{}".into()), 6_000);
        let gw = remote_gw(&stub.url());
        let err = gw.assess(&inf_req_id("req-5")).await.unwrap_err();
        assert!(matches!(err, PortError::Storage | PortError::Unavailable));
        // reqwest may deliver the aborted request once; never a retry.
        assert!(stub.hits() <= 1);
    }

    // ---- Heuristic gateway eval: labeled corpus + honest metrics ----

    /// B-eval: replay the labeled inference corpus through the heuristic
    /// gateway in Private mode. GATES: 100% hypothesis recall (every
    /// expected hypothesis is produced) and per-verdict provenance.
    /// REPORTED ONLY: precision, per-hypothesis FN, p50/p95 latency and
    /// per-class accuracy — synthetic labels, no production claim.
    #[tokio::test]
    async fn heuristic_eval_corpus_reports_metrics() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../packages/contracts/policy/eval-inference-heuristic.v1.json"
        );
        let corpus: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(path).expect("read inference eval corpus"),
        )
        .expect("parse corpus");
        let g = HeuristicLocalInferenceGateway;
        let mut lat_us: Vec<u128> = Vec::new();
        let (mut exact, mut total) = (0u32, 0u32);
        let mut misses: Vec<String> = Vec::new();
        let mut extras: Vec<String> = Vec::new();
        let mut per_class: std::collections::BTreeMap<String, (u32, u32)> =
            std::collections::BTreeMap::new();
        for case in corpus["cases"].as_array().expect("cases array") {
            total += 1;
            let class = case["class"].as_str().unwrap_or("unlabeled").to_string();
            let signals: Vec<RiskSignal> = case["signals"]
                .as_array()
                .unwrap()
                .iter()
                .map(|s| serde_json::from_value(s.clone()).unwrap())
                .collect();
            let expected: std::collections::BTreeSet<String> = case["expect_hypotheses"]
                .as_array()
                .unwrap()
                .iter()
                .map(|h| h.as_str().unwrap().to_string())
                .collect();
            let start = std::time::Instant::now();
            let v = g
                .assess(&InferenceRequest {
                    request_id: format!("eval-{total}"),
                    signals,
                    privacy: PrivacyMode::Private,
                    est_cost_micro_usd: 0,
                    text_hint: None,
                })
                .await
                .unwrap();
            lat_us.push(start.elapsed().as_micros());
            let predicted: std::collections::BTreeSet<String> =
                v.hypotheses.iter().cloned().collect();
            let missing: Vec<String> = expected.difference(&predicted).cloned().collect();
            let extra: Vec<String> = predicted.difference(&expected).cloned().collect();
            let hit = missing.is_empty();
            let entry = per_class.entry(class.clone()).or_default();
            entry.1 += 1;
            if hit {
                entry.0 += 1;
            }
            if missing.is_empty() && extra.is_empty() {
                exact += 1;
            }
            for m in missing {
                misses.push(format!("{}:{}", case["name"], m));
            }
            for e in extra {
                extras.push(format!("{}:{}", case["name"], e));
            }
            // Provenance must always disclose heuristic origin.
            assert!(v.provenance.contains("local_heuristic"));
            assert!(v.model_id.contains("heuristic"));
        }
        lat_us.sort_unstable();
        let pct = |p: usize| lat_us[(lat_us.len() * p / 100).min(lat_us.len() - 1)];
        eprintln!(
            "inference-eval(private): {exact}/{total} exact-set; recall-misses={misses:?}; extra={extras:?}"
        );
        eprintln!(
            "inference-eval(private): latency p50={}us p95={}us n={}",
            pct(50),
            pct(95),
            lat_us.len()
        );
        for (class, (ok, n)) in &per_class {
            eprintln!("inference-eval(private): class {class} recall {ok}/{n}");
        }
        // Gates: recall — every expected hypothesis must appear (a miss is
        // a false negative, the worst failure for a protector).
        assert!(
            misses.is_empty(),
            "hypothesis recall <100% — misses: {misses:?}"
        );
        // Council voter (ADR-0025): serves both modes — the vote stays
        // on-device and is proposal material for the arbiter.
        assert!(g.serves(PrivacyMode::Standard));
    }

    /// B6 race parity: `insert_once` check+insert runs under one lock —
    /// the in-memory equivalent of the PG PRIMARY KEY. N parallel inserts
    /// of the same event_id must admit exactly one; the rest get
    /// Duplicate, never a silent overwrite.
    #[tokio::test]
    async fn insert_once_is_atomic_under_concurrency() {
        let repo = Arc::new(InMemoryEventRepository::default());
        let mk = || ObservedEvent {
            event_id: "ev-dup".into(),
            source_id: "test".into(),
            observed_at_ms: 1,
            modality: sovir_domain::Modality::Url,
            content_digest: "sha256:x".into(),
            consent_grant_id: "g".into(),
            sensitive_data_class: sovir_domain::SensitiveDataClass::Public,
            payload_ref: None,
            signals: vec![],
            principal_id: "p".into(),
            device_id: "d".into(),
            tenant_id: "t".into(),
        };
        let mut joins = Vec::new();
        for _ in 0..16 {
            let r = repo.clone();
            joins.push(tokio::spawn(async move { r.insert_once(mk()).await }));
        }
        let mut ok = 0;
        let mut dup = 0;
        for j in joins {
            match j.await.unwrap() {
                Ok(()) => ok += 1,
                Err(PortError::Duplicate) => dup += 1,
                Err(e) => panic!("unexpected error: {e}"),
            }
        }
        assert_eq!(ok, 1, "exactly one insert may win");
        assert_eq!(dup, 15, "the rest must fail as Duplicate");
        let stored = repo.list_by_principal("t", "p").await.unwrap();
        assert_eq!(stored.len(), 1);
    }

    /// B6 race parity (grant side): `put` is insert-once keyed on
    /// (tenant, grant_id) — the in-memory equivalent of the PG PK unique
    /// violation mapped to Duplicate. Concurrent puts of the same key
    /// admit exactly one; revoke then stays a single coherent row update.
    #[tokio::test]
    async fn grant_put_and_revoke_are_atomic_per_call() {
        let repo = Arc::new(InMemoryConsentRepository::default());
        let mk = || ConsentGrant {
            grant_id: "g-1".into(),
            source_id: "browser".into(),
            expires_at_ms: u64::MAX,
            revoked: false,
            principal_id: "p".into(),
            device_id: "d".into(),
            tenant_id: "t".into(),
        };
        let (r1, r2) = (repo.clone(), repo.clone());
        let (a, b) = tokio::join!(async move { r1.put(mk()).await }, async move {
            r2.put(mk()).await
        },);
        let results = [a, b];
        assert_eq!(
            results.iter().filter(|r| r.is_ok()).count(),
            1,
            "exactly one put may win — PG PK parity"
        );
        assert_eq!(
            results
                .iter()
                .filter(|r| matches!(r, Err(PortError::Duplicate)))
                .count(),
            1
        );
        // Revoke is a coherent single-row update, not a torn write.
        assert!(repo.revoke("t", "g-1").await.unwrap());
        assert!(repo.get("t", "g-1").await.unwrap().unwrap().revoked);
        // Re-put after revoke still dedupes — the row exists.
        assert!(matches!(repo.put(mk()).await, Err(PortError::Duplicate)));
    }

    /// B21 parity with the PG store: `settle` credits the SAME spend the
    /// reporting ledger reads — one backing counter, like the
    /// `inference_budget` table. Pin the regression where the in-memory
    /// ledger reported $0 while reservations accrued real spend.
    #[tokio::test]
    async fn shared_spend_makes_ledger_report_settled_actuals() {
        use sovir_ports::{BudgetLedger, BudgetReservations};
        let rsv = InMemoryBudgetReservations::with_cap(1_000_000);
        let ledger = InMemoryBudgetLedger::with_shared_spend(rsv.spend_handle(), 1_000_000);
        let usage = sovir_domain::InferenceUsage {
            provider: "remote:test".into(),
            model: "stub".into(),
            tokens_est: 0,
            tokens_actual: None,
            cache_hit: false,
            redaction_tier: "standard".into(),
        };
        assert!(matches!(
            rsv.reserve("t", "req-1", 10_000).await.unwrap(),
            sovir_ports::ReserveOutcome::Reserved(_)
        ));
        rsv.settle("t", "req-1", 10_000, usage).await.unwrap();
        assert_eq!(ledger.spent_micro_usd("t").await.unwrap(), 10_000);
        // The cap gate counts the same counter: $1 cap − $0.01 settled
        // − $1 new estimate would exceed → refused.
        assert!(matches!(
            rsv.reserve("t", "req-2", 1_000_000).await.unwrap(),
            sovir_ports::ReserveOutcome::BudgetExceeded
        ));
    }

    /// ADR-0024/0025 eval gate for the onnx-text voter: runs the synthetic
    /// es/en corpus (ml/datasets/eval-onnx-text.v1.json) through the REAL
    /// artifact and reports per-class recall. Skips cleanly when
    /// SOVIR_ONNX_TEXT_DIR is unset — the binary artifact is gitignored,
    /// so this is a developer-machine gate, not a CI guarantee.
    #[cfg(feature = "onnx")]
    #[tokio::test]
    async fn onnx_text_voter_eval_corpus() {
        if std::env::var("SOVIR_ONNX_TEXT_DIR").is_err() {
            eprintln!("SKIP onnx-text eval: SOVIR_ONNX_TEXT_DIR unset (artifact not installed)");
            return;
        }
        let corpus_path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../ml/datasets/eval-onnx-text.v1.json"
        );
        let v: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(corpus_path).unwrap()).unwrap();
        let voter = OnnxTextVoter::from_env();
        assert!(
            voter.serves(PrivacyMode::Standard),
            "artifact present but serves()=false"
        );
        // Multi-label v1 artifact → run the signal corpus instead of the
        // 3-class fixture (hypotheses are typed signal names, not classes).
        let dir = std::path::PathBuf::from(std::env::var("SOVIR_ONNX_TEXT_DIR").unwrap());
        if dir.join("thresholds.json").is_file() {
            let mut per_sig: std::collections::HashMap<String, (u32, u32)> =
                std::collections::HashMap::new();
            let mut benign_fires = 0u32;
            let mut benign_n = 0u32;
            for split in ["val", "benign"] {
                let path = format!(
                    "{}/../../ml/datasets/text-corpus/{split}.jsonl",
                    env!("CARGO_MANIFEST_DIR")
                );
                let Ok(text) = std::fs::read_to_string(&path) else {
                    continue;
                };
                for line in text.lines() {
                    let row: serde_json::Value = serde_json::from_str(line).unwrap();
                    let expected: Vec<String> = row["signals"]
                        .as_array()
                        .map(|a| {
                            a.iter()
                                .filter_map(|s| s.as_str().map(String::from))
                                .collect()
                        })
                        .unwrap_or_default();
                    let mut req = inf_req_id("sig-eval");
                    req.text_hint = row["text"].as_str().map(String::from);
                    let verdict = voter.assess(&req).await.unwrap();
                    let got: std::collections::HashSet<&str> = verdict
                        .hypotheses
                        .iter()
                        .map(String::as_str)
                        .filter(|h| *h != "no_pattern_detected")
                        .collect();
                    if expected.is_empty() {
                        benign_n += 1;
                        if !got.is_empty() {
                            benign_fires += 1;
                        }
                    } else {
                        for s in &expected {
                            let e = per_sig.entry(s.clone()).or_default();
                            e.1 += 1;
                            if got.contains(s.as_str()) {
                                e.0 += 1;
                            }
                        }
                    }
                }
            }
            let hit: u32 = per_sig.values().map(|(h, _)| h).sum();
            let tot: u32 = per_sig.values().map(|(_, t)| t).sum();
            eprintln!("onnx-text-v1 eval: signal recall {hit}/{tot}");
            for (s, (h, t)) in &per_sig {
                eprintln!("  {s}: {h}/{t}");
            }
            eprintln!("  benign FP: {benign_fires}/{benign_n}");
            assert!(hit * 3 >= tot * 2, "signal recall below 2/3 gate");
            assert!(
                benign_fires * 20 <= benign_n,
                "benign FP above 5%: {benign_fires}/{benign_n}"
            );
            return;
        }
        let mut per_class: std::collections::HashMap<String, (u32, u32)> =
            std::collections::HashMap::new();
        let mut misses: Vec<String> = Vec::new();
        for case in v["cases"].as_array().unwrap() {
            let id = case["id"].as_str().unwrap();
            let expected = case["expected"].as_str().unwrap();
            let mut req = inf_req_id(id);
            req.text_hint = Some(case["text"].as_str().unwrap().to_string());
            let verdict = voter.assess(&req).await.unwrap();
            let got = match verdict.hypotheses.first().map(String::as_str) {
                Some("text_classifier_fraud") => "fraud",
                Some("text_classifier_spam") => "spam",
                _ => "legitimate",
            };
            let e = per_class.entry(expected.to_string()).or_default();
            e.1 += 1;
            if got == expected {
                e.0 += 1;
            } else {
                misses.push(format!(
                    "{id}: expected {expected}, got {got} ({})",
                    verdict.confidence_bp
                ));
            }
        }
        for (cls, (hit, tot)) in &per_class {
            eprintln!("onnx-text eval {cls}: {hit}/{tot} recall");
        }
        for m in &misses {
            eprintln!("  miss {m}");
        }
        // Synthetic-corpus gate (not a real-world claim): the voter must
        // not regress below 2/3 on our own fixture set.
        let total_hit: u32 = per_class.values().map(|(h, _)| h).sum();
        let total: u32 = per_class.values().map(|(_, t)| t).sum();
        assert!(
            total_hit * 3 >= total * 2,
            "onnx-text eval below gate: {total_hit}/{total} ({misses:?})"
        );
    }

    // --- verdict cache (B4 token-saver) --------------------------------------
    struct CountingVoter(Arc<std::sync::atomic::AtomicUsize>);
    #[async_trait]
    impl InferenceGateway for CountingVoter {
        async fn assess(
            &self,
            req: &sovir_domain::InferenceRequest,
        ) -> Result<sovir_domain::InferenceVerdict, PortError> {
            self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Ok(sovir_domain::InferenceVerdict {
                request_id: req.request_id.clone(),
                model_id: "counting-1".into(),
                hypotheses: vec!["payment_fraud_attempt".into()],
                confidence_bp: 8000,
                provenance: "counting".into(),
                usage: Some(sovir_domain::ReportedUsage {
                    tokens_input: 100,
                    tokens_output: 20,
                    cost_micro_usd: Some(5),
                }),
                votes: None,
            })
        }
        fn serves(&self, _: sovir_domain::PrivacyMode) -> bool {
            true
        }
    }
    struct StepClock(Mutex<u64>);
    impl Clock for StepClock {
        fn now_ms(&self) -> u64 {
            *self.0.lock().unwrap()
        }
    }
    fn infer_req(id: &str, hint: Option<&str>) -> sovir_domain::InferenceRequest {
        sovir_domain::InferenceRequest {
            request_id: id.into(),
            signals: vec![sovir_domain::RiskSignal::PaymentRequest],
            privacy: sovir_domain::PrivacyMode::Standard,
            est_cost_micro_usd: 0,
            text_hint: hint.map(str::to_string),
        }
    }
    #[tokio::test]
    async fn verdict_cache_hit_skips_provider_and_marks_provenance() {
        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let voter = Arc::new(CountingVoter(calls.clone()));
        let cache =
            CachingInferenceGateway::new(voter, Arc::new(StepClock(Mutex::new(1_000))), 60_000, 8);
        let r1 = cache.assess(&infer_req("r1", None)).await.unwrap();
        let r2 = cache.assess(&infer_req("r2", None)).await.unwrap();
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
        assert_eq!(r2.request_id, "r2");
        assert!(r2.provenance.starts_with("cache:"));
        assert_eq!(
            r2.usage.map(|u| (u.tokens_input, u.cost_micro_usd)),
            Some((0, Some(0))),
            "a cached verdict must not re-report provider spend"
        );
        // A different text hint is a different request — no wrong-answer risk.
        cache.assess(&infer_req("r3", Some("hola"))).await.unwrap();
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 2);
        let _ = r1;
    }
    #[tokio::test]
    async fn verdict_cache_expires_and_evicts_oldest() {
        let clock = Arc::new(StepClock(Mutex::new(0)));
        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let voter = Arc::new(CountingVoter(calls.clone()));
        let cache = CachingInferenceGateway::new(voter, clock.clone(), 100, 2);
        // request_id is NOT part of the key — hints distinguish entries.
        cache.assess(&infer_req("a", Some("x"))).await.unwrap(); // t=0   call 1
        *clock.0.lock().unwrap() = 150;
        // 'a' expired at t=150 (ttl=100) — refetched.
        cache.assess(&infer_req("a2", Some("x"))).await.unwrap(); // call 2
        *clock.0.lock().unwrap() = 160;
        cache.assess(&infer_req("b", Some("y"))).await.unwrap(); // call 3
        *clock.0.lock().unwrap() = 180;
        // 'b' is 20ms old → hit; no new call.
        cache.assess(&infer_req("b2", Some("y"))).await.unwrap();
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 3);
        // Third distinct key at cap=2 evicts the oldest ('a2' @ t=150).
        cache.assess(&infer_req("c", Some("z"))).await.unwrap(); // call 4
        cache.assess(&infer_req("a3", Some("x"))).await.unwrap(); // evicted → call 5
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 5);
        // Reinserting 'a' at cap=2 evicts 'b' (now the oldest live entry).
        cache.assess(&infer_req("b3", Some("y"))).await.unwrap();
        assert_eq!(
            calls.load(std::sync::atomic::Ordering::SeqCst),
            6,
            "cap=2 holds only the two most recent distinct keys"
        );
    }
}

// ---- H9 billing adapters (scaffold; SOVIR_BILLING=disabled by default) ----

/// Disabled billing: every call fails closed. This is the DEFAULT adapter —
/// absence of billing can never grant or deny anything it shouldn't.
pub struct NoopBillingGateway;
#[async_trait]
impl sovir_ports::BillingGateway for NoopBillingGateway {
    async fn checkout_url(&self, _plan_id: &str, _principal_id: &str) -> Result<String, PortError> {
        Err(PortError::Unavailable)
    }
    async fn verify_webhook(
        &self,
        _msg_id: &str,
        _timestamp: &str,
        _signature: &str,
        _body: &[u8],
    ) -> Result<sovir_ports::BillingEvent, PortError> {
        Err(PortError::Unavailable)
    }
}

/// Polar merchant-of-record gateway (PAYMENTS_OPTIONS.md). Webhook
/// verification follows the Standard Webhooks scheme Polar signs with:
/// HMAC-SHA256 over `{msg_id}.{timestamp}.{body}` using the raw bytes of the
/// `whsec_`-prefixed secret (base64), signature header `v1,<b64>` possibly
/// space-separated. Timestamp freshness is the service's concern — this
/// adapter only proves authenticity. Hosted-checkout URLs come from Polar's
/// prebuilt checkout links plus `customer_external_id`, so no API call is
/// needed in the scaffold.
pub struct PolarBillingGateway {
    webhook_secret: Vec<u8>,
    /// e.g. "https://buy.polar.sh/polar_cl_xxx" — configured, not derived.
    checkout_base: Option<String>,
}
impl PolarBillingGateway {
    /// `secret` accepts the `whsec_`-prefixed or raw-base64 form.
    pub fn new(secret: &str) -> Result<Self, PortError> {
        use base64::Engine;
        let s = secret.strip_prefix("whsec_").unwrap_or(secret);
        let key = base64::engine::general_purpose::STANDARD
            .decode(s)
            .map_err(|_| PortError::Unavailable)?;
        Ok(Self {
            webhook_secret: key,
            checkout_base: None,
        })
    }
    pub fn with_checkout_base(mut self, url: impl Into<String>) -> Self {
        self.checkout_base = Some(url.into());
        self
    }
}
#[async_trait]
impl sovir_ports::BillingGateway for PolarBillingGateway {
    async fn checkout_url(&self, _plan_id: &str, principal_id: &str) -> Result<String, PortError> {
        let base = self.checkout_base.as_ref().ok_or(PortError::Unavailable)?;
        // Static hosted checkout link + external customer reference; Polar
        // reconciles the payer to our principal id.
        Ok(format!("{base}?customer_external_id={principal_id}"))
    }
    async fn verify_webhook(
        &self,
        msg_id: &str,
        timestamp: &str,
        signature: &str,
        body: &[u8],
    ) -> Result<sovir_ports::BillingEvent, PortError> {
        use base64::Engine;
        let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(&self.webhook_secret)
            .map_err(|_| PortError::Unavailable)?;
        mac.update(msg_id.as_bytes());
        mac.update(b".");
        mac.update(timestamp.as_bytes());
        mac.update(b".");
        mac.update(body);
        let expected = mac.finalize().into_bytes();
        // Header may carry several space-separated v1 signatures.
        let valid = signature.split(' ').any(|part| {
            part.strip_prefix("v1,")
                .and_then(|s| base64::engine::general_purpose::STANDARD.decode(s).ok())
                .map(|sig| sig.as_slice() == expected.as_slice())
                .unwrap_or(false)
        });
        if !valid {
            return Err(PortError::Unauthorized);
        }
        let payload = String::from_utf8(body.to_vec()).map_err(|_| PortError::Storage)?;
        let kind = serde_json::from_slice::<serde_json::Value>(body)
            .ok()
            .and_then(|v| v.get("type").and_then(|t| t.as_str()).map(str::to_string))
            .unwrap_or_else(|| "unknown".into());
        Ok(sovir_ports::BillingEvent { kind, payload })
    }
}

#[cfg(test)]
mod billing_tests {
    use super::*;

    fn sign(secret: &[u8], msg_id: &str, ts: &str, body: &[u8]) -> String {
        use base64::Engine;
        let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(secret).unwrap();
        mac.update(msg_id.as_bytes());
        mac.update(b".");
        mac.update(ts.as_bytes());
        mac.update(b".");
        mac.update(body);
        format!(
            "v1,{}",
            base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes())
        )
    }

    #[tokio::test]
    async fn polar_webhook_verifies_real_signature_and_rejects_tampering() {
        use base64::Engine;
        use sovir_ports::BillingGateway;
        let secret_raw = b"sovir-test-webhook-secret-32byte";
        let b64 = base64::engine::general_purpose::STANDARD.encode(secret_raw);
        let gw = PolarBillingGateway::new(&b64).unwrap();
        let body = br#"{"type":"subscription.created","data":{"id":"sub_1"}}"#.to_vec();
        let sig = sign(secret_raw, "msg-1", "1700000000", &body);
        let ev = gw
            .verify_webhook("msg-1", "1700000000", &sig, &body)
            .await
            .unwrap();
        assert_eq!(ev.kind, "subscription.created");
        // Tampered body never verifies.
        let mut bad = body.clone();
        bad[10] = b'X';
        assert!(matches!(
            gw.verify_webhook("msg-1", "1700000000", &sig, &bad).await,
            Err(PortError::Unauthorized)
        ));
        // Forged signature never verifies.
        assert!(matches!(
            gw.verify_webhook("msg-1", "1700000000", "v1,AAAA", &body)
                .await,
            Err(PortError::Unauthorized)
        ));
    }

    #[tokio::test]
    async fn noop_billing_fails_closed() {
        use sovir_ports::BillingGateway;
        let g = NoopBillingGateway;
        assert!(matches!(
            g.checkout_url("plan", "p").await,
            Err(PortError::Unavailable)
        ));
        assert!(matches!(
            g.verify_webhook("m", "t", "s", b"{}").await,
            Err(PortError::Unavailable)
        ));
    }

    #[tokio::test]
    async fn polar_checkout_url_carries_external_customer_ref() {
        use base64::Engine;
        use sovir_ports::BillingGateway;
        let b64 = base64::engine::general_purpose::STANDARD.encode(b"key-material-16b");
        let gw = PolarBillingGateway::new(&b64)
            .unwrap()
            .with_checkout_base("https://buy.polar.sh/polar_cl_test");
        let url = gw.checkout_url("plan-pro", "principal-9").await.unwrap();
        assert!(url.ends_with("customer_external_id=principal-9"));
        // Without a configured checkout base the call refuses honestly.
        let gw2 = PolarBillingGateway::new(&b64).unwrap();
        assert!(matches!(
            gw2.checkout_url("plan", "p").await,
            Err(PortError::Unavailable)
        ));
    }
}
