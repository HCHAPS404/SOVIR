//! In-memory development adapters. NOT durable or production-ready.
//! Lookups are scoped by (tenant_id, principal_id) per B19.
use async_trait::async_trait;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use sovir_domain::{
    Assessment, AuditEvent, ConsentGrant, DeletionReceipt, DeliveryState, Device,
    IdempotentResponse, Intervention, InterventionKind, ObservedEvent, PolicyPack, Session,
    WebhookEndpoint,
};
use sovir_ports::{
    AuditLog, BudgetLedger, Clock, ConsentRepository, DeletionReceiptStore, DeliveryChannel,
    DeviceRegistry, EventRepository, HttpEgress, IdempotencyStore, InferenceGateway,
    InterventionSink, PortError, RiskAnalyzer, SessionStore, ThreatIntelFeed, WebhookRegistry,
};
use std::{
    collections::HashMap,
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
        guard.retain(|_, s| !s.revoked && s.expires_at_ms > now_ms);
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
