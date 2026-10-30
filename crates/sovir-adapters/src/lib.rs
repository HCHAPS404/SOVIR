//! In-memory development adapters. NOT durable or production-ready.
//! Lookups are scoped by (tenant_id, principal_id) per B19.
use async_trait::async_trait;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use sovir_domain::{
    Assessment, AuditEvent, ConsentGrant, DeletionReceipt, DeliveryState, Device,
    IdempotentResponse, InferenceReservation, InferenceUsage, Intervention, InterventionKind,
    ObservedEvent, PolicyPack, ReservationState, Session, VerifiedIdentity, WebhookEndpoint,
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
pub struct InMemoryEventRepository(Mutex<HashMap<String, ObservedEvent>>);
#[async_trait]
impl EventRepository for InMemoryEventRepository {
    async fn insert_once(&self, event: ObservedEvent) -> Result<(), PortError> {
        let mut events = self.0.lock().map_err(|_| PortError::Storage)?;
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
        self.0
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
        let mut events = self.0.lock().map_err(|_| PortError::Storage)?;
        let before = events.len();
        events.retain(|_, e| !(e.tenant_id == tenant_id && e.principal_id == principal_id));
        Ok((before - events.len()) as u64)
    }
    async fn delete_older_than(
        &self,
        tenant_id: &str,
        principal_id: &str,
        cutoff_ms: u64,
    ) -> Result<u64, PortError> {
        let mut events = self.0.lock().map_err(|_| PortError::Storage)?;
        let before = events.len();
        events.retain(|_, e| {
            !(e.tenant_id == tenant_id && e.principal_id == principal_id)
                || e.observed_at_ms >= cutoff_ms
        });
        Ok((before - events.len()) as u64)
    }
    async fn delete_older_than_any(&self, cutoff_ms: u64) -> Result<u64, PortError> {
        let mut events = self.0.lock().map_err(|_| PortError::Storage)?;
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
        self.0
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
    async fn attest(
        &self,
        _device: &Device,
    ) -> Result<sovir_ports::Attestation, PortError> {
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
#[derive(Default)]
pub struct HeuristicLocalInferenceGateway;
impl HeuristicLocalInferenceGateway {
    /// (required signals, hypothesis, confidence bp). First match wins per
    /// row; verdict confidence is the max matched bp.
    const RULES: &'static [(&'static [sovir_domain::RiskSignal], &'static str, u16)] = &[
        (
            &[
                sovir_domain::RiskSignal::CredentialRequest,
                sovir_domain::RiskSignal::IdentityUnverified,
            ],
            "credential_phishing",
            8500,
        ),
        (
            &[
                sovir_domain::RiskSignal::PaymentRequest,
                sovir_domain::RiskSignal::UrgentAction,
            ],
            "payment_fraud_attempt",
            8000,
        ),
        (
            &[sovir_domain::RiskSignal::ConsentDarkPattern],
            "manipulative_pattern",
            6500,
        ),
        (
            &[sovir_domain::RiskSignal::HiddenFeePattern],
            "manipulative_pattern",
            6500,
        ),
        (
            &[sovir_domain::RiskSignal::CredentialRequest],
            "credential_request_unverified",
            6000,
        ),
        (
            &[sovir_domain::RiskSignal::PaymentRequest],
            "payment_request_unverified",
            6000,
        ),
        (
            &[sovir_domain::RiskSignal::TrackingObserved],
            "privacy_tracking_exposure",
            5500,
        ),
        (
            &[sovir_domain::RiskSignal::IdentityUnverified],
            "identity_unverified",
            4000,
        ),
        (
            &[sovir_domain::RiskSignal::UrgentAction],
            "urgency_pressure",
            4000,
        ),
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
        let mut hypotheses: Vec<&'static str> = Vec::new();
        let mut confidence_bp: u16 = 0;
        for (required, label, bp) in Self::RULES {
            if required.iter().all(|s| req.signals.contains(s)) && !hypotheses.contains(label) {
                hypotheses.push(label);
                confidence_bp = confidence_bp.max(*bp);
            }
        }
        if hypotheses.is_empty() {
            hypotheses.push("no_pattern_detected");
            confidence_bp = 1000;
        }
        Ok(sovir_domain::InferenceVerdict {
            request_id: req.request_id.clone(),
            model_id: "sovir-heuristic-local-0.1".into(),
            hypotheses: hypotheses.into_iter().map(str::to_string).collect(),
            confidence_bp,
            provenance: "local_heuristic_rules; no model, no egress; deterministic".into(),
        })
    }
    fn serves(&self, mode: sovir_domain::PrivacyMode) -> bool {
        mode == sovir_domain::PrivacyMode::Private
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
/// Per-tenant inference budget in micro-USD (B4). Dev adapter: a shared
/// cap for every tenant; production needs per-plan caps (B7 decision).
pub struct InMemoryBudgetLedger {
    spend: RwLock<std::collections::HashMap<String, u64>>,
    cap_micro_usd: u64,
}
impl InMemoryBudgetLedger {
    /// `cap_micro_usd`: 1_000_000 = USD 1.00.
    pub fn with_cap(cap_micro_usd: u64) -> Self {
        Self {
            spend: RwLock::new(std::collections::HashMap::new()),
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
    cap_micro_usd: u64,
}
#[derive(Default)]
struct InMemoryReservationState {
    spent: std::collections::HashMap<String, u64>,
    rows: std::collections::HashMap<(String, String), InferenceReservation>,
}
impl InMemoryBudgetReservations {
    pub fn with_cap(cap_micro_usd: u64) -> Self {
        Self {
            inner: RwLock::new(InMemoryReservationState::default()),
            cap_micro_usd,
        }
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
            return Ok(sovir_ports::ReserveOutcome::Reserved(existing.clone()));
        }
        let spent = g.spent.get(tenant_id).copied().unwrap_or(0);
        let pending: u64 = g
            .rows
            .values()
            .filter(|r| {
                r.tenant_id == tenant_id && r.state == ReservationState::Pending
            })
            .map(|r| r.est_micro_usd)
            .sum();
        if spent.saturating_add(pending).saturating_add(est_micro_usd)
            > self.cap_micro_usd
        {
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
            created_at_ms: 0,
            settled_at_ms: None,
        };
        g.rows.insert(key, r.clone());
        Ok(sovir_ports::ReserveOutcome::Reserved(r))
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
        *g.spent.entry(tenant_id.to_string()).or_insert(0) += actual_micro_usd;
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
        self.stored
            .write()
            .map_err(|_| PortError::Storage)?
            .push(indicator);
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
        })
    }
    fn serves(&self, mode: sovir_domain::PrivacyMode) -> bool {
        // Invariant: remote gateways may only ever serve Standard.
        mode == sovir_domain::PrivacyMode::Standard
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
        }
    }
    #[tokio::test]
    async fn heuristic_local_serves_private_with_honest_hypotheses() {
        use sovir_domain::RiskSignal::*;
        let g = HeuristicLocalInferenceGateway;
        // Private only.
        assert!(g.serves(sovir_domain::PrivacyMode::Private));
        assert!(!g.serves(sovir_domain::PrivacyMode::Standard));
        // Credential + unverified identity -> phishing hypothesis.
        let v = g
            .assess(&inf_req(
                &[CredentialRequest, IdentityUnverified],
                sovir_domain::PrivacyMode::Private,
            ))
            .await
            .unwrap();
        assert!(v.hypotheses.contains(&"credential_phishing".to_string()));
        assert_eq!(v.confidence_bp, 8500);
        assert_eq!(v.request_id, "req-t");
        assert!(v.model_id.contains("heuristic"));
        assert!(v.provenance.contains("local_heuristic"));
        // Standard mode refused outright: private path never egresses.
        assert!(matches!(
            g.assess(&inf_req(
                &[PaymentRequest],
                sovir_domain::PrivacyMode::Standard
            ))
            .await,
            Err(PortError::Unavailable)
        ));
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
}
