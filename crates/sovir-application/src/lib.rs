//! Use cases and orchestrated policy checks. No Axum, SQL or model SDK dependencies.
use sovir_domain::{
    detect_sequences, intervention_for, next_attempt_ms, normalize_events, valid_identifier,
    validate_consent, validate_device, validate_event, validate_url_for_egress, AuditAction,
    AuditEvent, ConsentGrant, DecisionKind, DeletionReceipt, DeliveryAuditEntry, DeliveryState,
    Device, DomainError, EventDecision, InferenceRequest, InferenceVerdict, IntelIndicator,
    Intervention, ObservedEvent, Platform, Principal, RiskLevel, Scope, SequencePattern, Session,
    WebhookEndpoint, MAX_DELIVERY_ATTEMPTS,
};
use sovir_ports::{
    AuditLog, BudgetLedger, Clock, ConsentRepository, DeletionReceiptStore, DeliveryChannel,
    DeviceRegistry, EventRepository, IdempotencyStore, InferenceGateway, InterventionSink,
    PortError, RiskAnalyzer, SessionStore, ThreatIntelFeed, WebhookRegistry,
};
use std::sync::Arc;
use thiserror::Error;

/// Development sessions are short-lived; production session TTL is a separate decision.
const DEV_SESSION_TTL_MS: u64 = 15 * 60 * 1000;
/// Evidence correlation window for sequence detection (B2). Dev value;
/// production tuning is a policy decision.
const EVIDENCE_WINDOW_MS: u64 = 60 * 60 * 1000;

#[derive(Debug, serde::Serialize)]
pub struct PrincipalDataExport {
    pub principal_id: String,
    pub grants: Vec<ConsentGrant>,
    pub events: Vec<ObservedEvent>,
    pub devices: Vec<Device>,
    pub interventions: Vec<Intervention>,
    pub deletion_receipts: Vec<DeletionReceipt>,
    /// Caller's own audit tombstones (metadata only — survives purges).
    pub audit_events: Vec<sovir_domain::AuditEvent>,
}
#[derive(Debug, serde::Serialize)]
pub struct PurgeReport {
    pub receipt_id: String,
    pub events_deleted: u64,
    pub grants_deleted: u64,
    pub interventions_deleted: u64,
    pub sessions_revoked: u64,
    pub devices_revoked: u64,
    pub labels_scrubbed: u64,
    pub idem_keys_deleted: u64,
}
#[derive(Debug, serde::Serialize)]
pub struct RetentionReport {
    pub cutoff_ms: u64,
    pub events_deleted: u64,
    pub terminal_interventions_deleted: u64,
    /// Session tombstones + expired idempotency keys dropped (global only).
    #[serde(default)]
    pub session_tombstones_deleted: u64,
    #[serde(default)]
    pub idem_keys_expired_deleted: u64,
}

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
    #[error("inference provider not configured")]
    ProviderUnavailable,
    #[error("inference budget exceeded")]
    BudgetExceeded,
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
    pub webhooks: Arc<dyn WebhookRegistry>,
    pub receipts: Arc<dyn DeletionReceiptStore>,
    pub idem: Arc<dyn IdempotencyStore>,
    pub audit: Arc<dyn AuditLog>,
    /// Inference gateway (B4). `None` = no provider configured — calls
    /// refuse with ProviderUnavailable, never fake a verdict.
    pub inference: Option<Arc<dyn InferenceGateway>>,
    pub budget: Arc<dyn BudgetLedger>,
    /// Durable spend reservations (B21). The atomic gate for inference
    /// spend — reserve→settle/refund replaces the racy read-then-record
    /// path; concurrent assess calls cannot both pass under the cap.
    pub reservations: Arc<dyn sovir_ports::BudgetReservations>,
    pub intel: Arc<dyn ThreatIntelFeed>,
    /// Verified-identity seam (B6/ADR-0013). `None` = dev sessions only.
    pub identity: Option<Arc<dyn sovir_ports::IdentityVerifier>>,
    /// Device attestation seam. `None` = attestation not attempted; the
    /// audit entry then omits the verdict rather than implying one.
    pub attester: Option<Arc<dyn sovir_ports::DeviceAttester>>,
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
    webhooks: Arc<dyn WebhookRegistry>,
    receipts: Arc<dyn DeletionReceiptStore>,
    idem: Arc<dyn IdempotencyStore>,
    audit: Arc<dyn AuditLog>,
    inference: Option<Arc<dyn InferenceGateway>>,
    reservations: Arc<dyn sovir_ports::BudgetReservations>,
    intel: Arc<dyn ThreatIntelFeed>,
    identity: Option<Arc<dyn sovir_ports::IdentityVerifier>>,
    attester: Option<Arc<dyn sovir_ports::DeviceAttester>>,
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
            webhooks: ports.webhooks,
            receipts: ports.receipts,
            idem: ports.idem,
            audit: ports.audit,
            inference: ports.inference,
            reservations: ports.reservations,
            intel: ports.intel,
            identity: ports.identity,
            attester: ports.attester,
        }
    }

    /// Random token/id derivation (UUIDv4). The parts are accepted for
    /// call-site clarity but intentionally unused: identifiers must not be
    /// derivable from inputs.
    fn dev_token(&self, prefix: &str, _parts: &[&str]) -> String {
        format!("{prefix}-{}", uuid::Uuid::new_v4().simple())
    }

    /// Issues a short-lived development session for a synthetic principal.
    /// `tenant_id` is caller-declared: dev sessions are synthetic and a
    /// self-declared tenant is never proof of authorization (ADR-0006); it
    /// exists so tenant isolation (B19) is exercisable end to end. If the
    /// device is registered it must belong to the principal and be active.
    pub async fn issue_dev_session(
        &self,
        principal_id: &str,
        device_id: &str,
        tenant_id: &str,
    ) -> Result<Session, AppError> {
        if !valid_identifier(principal_id)
            || !valid_identifier(device_id)
            || !valid_identifier(tenant_id)
        {
            return Err(AppError::InvalidRequest);
        }
        if let Some(d) = self.devices.get(tenant_id, principal_id, device_id).await? {
            if !d.is_active() {
                return Err(AppError::DeviceRevoked);
            }
        }
        let now = self.clock.now_ms();
        let session = Session {
            token: self.dev_token("svt", &[principal_id, device_id]),
            session_id: self.dev_token("ses", &[principal_id, device_id]),
            principal_id: principal_id.to_string(),
            tenant_id: tenant_id.to_string(),
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
        self.sessions.issue(session.clone()).await?;
        self.audit(
            tenant_id,
            principal_id,
            AuditAction::SessionIssued,
            &format!("ses:{} dev:{}", session.session_id, device_id),
        )
        .await?;
        Ok(session)
    }

    /// Resolves a bearer token to a Principal. Fails closed on unknown,
    /// expired or revoked sessions, and on revoked registered devices.
    pub async fn authenticate(&self, token: &str) -> Result<Principal, AppError> {
        let session = self
            .sessions
            .resolve(token)
            .await?
            .ok_or(AppError::Unauthorized)?;
        let principal = session
            .principal(self.clock.now_ms())
            .ok_or(AppError::Unauthorized)?;
        if let Some(d) = self
            .devices
            .get(
                &principal.tenant_id,
                &principal.principal_id,
                &principal.device_id,
            )
            .await?
        {
            if !d.is_active() {
                return Err(AppError::DeviceRevoked);
            }
        }
        Ok(principal)
    }

    /// Bearer dispatch (B6/ADR-0013): a JWT-shaped token (two dots) goes to
    /// the configured `IdentityVerifier` and fails closed on rejection —
    /// no silent downgrade to dev sessions. Anything else resolves through
    /// the dev `SessionStore` (local/test only, self-declared tenant).
    ///
    /// Verified principals carry the same dev scope set for now: claim→scope
    /// mapping is a pending maintainer decision, and `device_id` is empty —
    /// OIDC device binding is unsolved, so device-revocation checks do not
    /// apply on this path yet.
    pub async fn authenticate_bearer(&self, token: &str) -> Result<Principal, AppError> {
        if token.matches('.').count() == 2 {
            let v = self.identity.as_ref().ok_or(AppError::Unauthorized)?;
            let id = v.verify(token).await.map_err(|_| AppError::Unauthorized)?;
            if !sovir_domain::valid_identifier(&id.tenant_id)
                || !sovir_domain::valid_identifier(&id.principal_id)
            {
                return Err(AppError::Unauthorized);
            }
            return Ok(Principal {
                principal_id: id.principal_id,
                tenant_id: id.tenant_id,
                device_id: String::new(),
                session_id: String::new(),
                scopes: vec![
                    Scope::ConsentWrite,
                    Scope::EventsWrite,
                    Scope::DevicesWrite,
                    Scope::SessionsWrite,
                ],
            });
        }
        self.authenticate(token).await
    }

    pub async fn logout(&self, token: &str) -> Result<bool, AppError> {
        Ok(self.sessions.revoke(token).await?)
    }

    pub async fn register_device(
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
            tenant_id: principal.tenant_id.clone(),
            platform,
            label: label.to_string(),
            registered_at_ms: now,
            last_seen_at_ms: None,
            revoked_at_ms: None,
        };
        validate_device(&device)?;
        self.devices.register(device.clone()).await?;
        // Attestation seam: when a provider is wired its verdict rides in
        // the audit detail; `attest:none` honestly means no proof was made.
        let attest = match &self.attester {
            Some(a) => match a.attest(&device).await {
                Ok(att) => format!("|attest:{}:{}", att.provider, att.level),
                Err(_) => "|attest:error".to_string(),
            },
            None => String::new(),
        };
        self.audit(
            &principal.tenant_id,
            &principal.principal_id,
            AuditAction::DeviceRegistered,
            &format!("dev:{}{}", device.device_id, attest),
        )
        .await?;
        Ok(device)
    }

    pub async fn list_devices(&self, principal: &Principal) -> Result<Vec<Device>, AppError> {
        Ok(self
            .devices
            .list(&principal.tenant_id, &principal.principal_id)
            .await?)
    }

    /// Revokes the device, every session bound to it and every consent grant
    /// bound to it. Revocation fails closed: after this call the device can
    /// neither authenticate nor ingest.
    pub async fn revoke_device(
        &self,
        principal: &Principal,
        device_id: &str,
    ) -> Result<bool, AppError> {
        if !principal.has_scope(Scope::DevicesWrite) {
            return Err(AppError::Forbidden);
        }
        let now = self.clock.now_ms();
        let revoked = self
            .devices
            .revoke(
                &principal.tenant_id,
                &principal.principal_id,
                device_id,
                now,
            )
            .await?;
        if revoked {
            self.sessions
                .revoke_by_device(&principal.tenant_id, device_id)
                .await?;
            self.grants
                .revoke_by_device(&principal.tenant_id, device_id)
                .await?;
            // Fail closed: pending deliveries to a revoked device expire now.
            for mut i in self
                .sink
                .list_by_device(&principal.tenant_id, device_id)
                .await?
            {
                i.audit.push(DeliveryAuditEntry {
                    at_ms: now,
                    from: i.state,
                    to: DeliveryState::Expired,
                    detail: "device revoked".to_string(),
                });
                i.state = DeliveryState::Expired;
                self.sink.update(i).await?;
            }
            self.audit(
                &principal.tenant_id,
                &principal.principal_id,
                AuditAction::DeviceRevoked,
                &format!("dev:{device_id}"),
            )
            .await?;
        }
        Ok(revoked)
    }

    /// Records a consent grant bound to the authenticated principal and device.
    /// The binding is sealed here; client-supplied binding fields are ignored
    /// at deserialization (`skip_deserializing`).
    pub async fn grant(
        &self,
        principal: &Principal,
        mut grant: ConsentGrant,
    ) -> Result<(), AppError> {
        if !principal.has_scope(Scope::ConsentWrite) {
            return Err(AppError::Forbidden);
        }
        grant.principal_id = principal.principal_id.clone();
        grant.device_id = principal.device_id.clone();
        grant.tenant_id = principal.tenant_id.clone();
        if !valid_identifier(&grant.grant_id)
            || !valid_identifier(&grant.source_id)
            || grant.expires_at_ms <= self.clock.now_ms()
            || grant.revoked
        {
            return Err(AppError::InvalidGrant);
        }
        let grant_id = grant.grant_id.clone();
        self.grants.put(grant).await?;
        self.audit(
            &principal.tenant_id,
            &principal.principal_id,
            AuditAction::ConsentGranted,
            &format!("grant:{grant_id}"),
        )
        .await?;
        Ok(())
    }
    pub async fn revoke(&self, principal: &Principal, grant_id: &str) -> Result<bool, AppError> {
        if !principal.has_scope(Scope::ConsentWrite) {
            return Err(AppError::Forbidden);
        }
        // Only the owning principal may revoke: verify binding first. The
        // tenant-scoped get already makes cross-tenant grants invisible.
        match self.grants.get(&principal.tenant_id, grant_id).await? {
            Some(g) if g.principal_id == principal.principal_id => {
                let n = self.grants.revoke(&principal.tenant_id, grant_id).await?;
                if n {
                    self.audit(
                        &principal.tenant_id,
                        &principal.principal_id,
                        AuditAction::ConsentRevoked,
                        &format!("grant:{grant_id}"),
                    )
                    .await?;
                }
                Ok(n)
            }
            Some(_) => Err(AppError::Forbidden),
            None => Ok(false),
        }
    }
    /// Seals the event with the session's principal/device binding, then
    /// enforces the consent invariant (grant scope + same binding) before
    /// analysis and dedup-insert.
    pub async fn ingest(
        &self,
        principal: &Principal,
        mut event: ObservedEvent,
    ) -> Result<EventDecision, AppError> {
        if !principal.has_scope(Scope::EventsWrite) {
            return Err(AppError::Forbidden);
        }
        event.principal_id = principal.principal_id.clone();
        event.device_id = principal.device_id.clone();
        event.tenant_id = principal.tenant_id.clone();
        let now = self.clock.now_ms();
        validate_event(&event, now)?;
        let grant = self
            .grants
            .get(&principal.tenant_id, &event.consent_grant_id)
            .await?
            .ok_or(AppError::ConsentNotFound)?;
        validate_consent(&event, &grant, now)?;
        self.devices
            .touch_seen(
                &principal.tenant_id,
                &principal.principal_id,
                &principal.device_id,
                now,
            )
            .await?;
        let mut assessment = self.risk.analyze(&event);
        let id = event.event_id.clone();
        self.events.insert_once(event).await?;
        // Evidence window (B2/ADR-0011): correlate the principal's recent
        // events; findings can only raise the decision floor, never weaken
        // consent/device checks or trigger enforcement by themselves.
        let since = now.saturating_sub(EVIDENCE_WINDOW_MS);
        let window = normalize_events(
            self.events
                .list_recent(&principal.tenant_id, &principal.principal_id, since)
                .await?,
        );
        let sequence_findings = detect_sequences(&window);
        for f in &sequence_findings {
            assessment
                .reasons
                .push(format!("Sequence: {:?} over {}ms", f.pattern, f.span_ms));
        }
        if sequence_findings
            .iter()
            .any(|f| matches!(f.pattern, SequencePattern::HookThenPayment))
        {
            // A lure followed by a payment request in-window escalates to Warn
            // regardless of the single-event verdict.
            assessment.decision = DecisionKind::Warn;
            if assessment.risk_level != RiskLevel::High {
                assessment.risk_level = RiskLevel::High;
            }
        } else if !sequence_findings.is_empty() && assessment.decision == DecisionKind::Observe {
            assessment.decision = DecisionKind::Review;
        }
        let decision = EventDecision {
            event_id: id,
            assessment,
            protected_action_executed: false,
            sequence_findings,
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
                tenant_id: principal.tenant_id.clone(),
                kind,
                state: DeliveryState::Pending,
                attempts: 0,
                created_at_ms: now,
                next_attempt_at_ms: now,
                last_error: None,
                audit: vec![],
            };
            self.sink.enqueue(intervention).await?;
        }
        self.audit(
            &principal.tenant_id,
            &principal.principal_id,
            AuditAction::EventIngested,
            &format!(
                "event:{} decision:{:?} policy:{}",
                decision.event_id, decision.assessment.decision, decision.assessment.policy_version
            ),
        )
        .await?;
        Ok(decision)
    }

    pub async fn list_interventions(
        &self,
        principal: &Principal,
    ) -> Result<Vec<Intervention>, AppError> {
        Ok(self
            .sink
            .list(&principal.tenant_id, &principal.principal_id)
            .await?)
    }

    /// Registers an outbound webhook endpoint (B20). The URL must pass the
    /// egress allowlist; the secret is generated, returned once and stored
    /// with the endpoint (dev-grade; production must use managed secrets).
    pub async fn register_webhook(
        &self,
        principal: &Principal,
        url: &str,
        kinds: Vec<sovir_domain::InterventionKind>,
        allowed_hosts: &[String],
    ) -> Result<WebhookEndpoint, AppError> {
        if kinds.is_empty() {
            return Err(AppError::InvalidRequest);
        }
        validate_url_for_egress(url, allowed_hosts)?;
        let ep = WebhookEndpoint {
            endpoint_id: self.dev_token("wh", &[]),
            principal_id: principal.principal_id.clone(),
            tenant_id: principal.tenant_id.clone(),
            url: url.to_string(),
            secret: uuid::Uuid::new_v4().simple().to_string(),
            kinds,
            created_at_ms: self.clock.now_ms(),
            revoked_at_ms: None,
        };
        self.webhooks.register(ep.clone()).await?;
        self.audit(
            &principal.tenant_id,
            &principal.principal_id,
            AuditAction::WebhookRegistered,
            &format!("wh:{}", ep.endpoint_id),
        )
        .await?;
        Ok(ep)
    }
    pub async fn list_webhooks(
        &self,
        principal: &Principal,
    ) -> Result<Vec<WebhookEndpoint>, AppError> {
        Ok(self
            .webhooks
            .list(&principal.tenant_id, &principal.principal_id)
            .await?)
    }
    pub async fn revoke_webhook(
        &self,
        principal: &Principal,
        endpoint_id: &str,
    ) -> Result<bool, AppError> {
        let n = self
            .webhooks
            .revoke(
                &principal.tenant_id,
                &principal.principal_id,
                endpoint_id,
                self.clock.now_ms(),
            )
            .await?;
        if n {
            self.audit(
                &principal.tenant_id,
                &principal.principal_id,
                AuditAction::WebhookRevoked,
                &format!("wh:{endpoint_id}"),
            )
            .await?;
        }
        Ok(n)
    }

    /// Data governance (B16): everything stored for a principal — metadata
    /// only, never payloads or raw content.
    pub async fn export_data(
        &self,
        principal: &Principal,
    ) -> Result<PrincipalDataExport, AppError> {
        Ok(PrincipalDataExport {
            principal_id: principal.principal_id.clone(),
            grants: self
                .grants
                .list_by_principal(&principal.tenant_id, &principal.principal_id)
                .await?,
            events: self
                .events
                .list_by_principal(&principal.tenant_id, &principal.principal_id)
                .await?,
            devices: self
                .devices
                .list(&principal.tenant_id, &principal.principal_id)
                .await?,
            interventions: self
                .sink
                .list(&principal.tenant_id, &principal.principal_id)
                .await?,
            deletion_receipts: self
                .receipts
                .list_by_principal(&principal.tenant_id, &principal.principal_id)
                .await?,
            audit_events: self
                .audit
                .list_by_principal(&principal.tenant_id, &principal.principal_id)
                .await?,
        })
    }

    /// Retention (B16): hard-deletes the caller's events and terminal
    /// intervention records older than `now - retention_ms`. Pending/failed
    /// interventions are kept — they still owe delivery attempts. A global
    /// scheduled job over all principals is an infrastructure decision.
    pub async fn enforce_retention(
        &self,
        principal: &Principal,
        retention_ms: u64,
    ) -> Result<RetentionReport, AppError> {
        let cutoff_ms = self.clock.now_ms().saturating_sub(retention_ms);
        Ok(RetentionReport {
            cutoff_ms,
            events_deleted: self
                .events
                .delete_older_than(&principal.tenant_id, &principal.principal_id, cutoff_ms)
                .await?,
            terminal_interventions_deleted: self
                .sink
                .delete_terminal_older_than(
                    &principal.tenant_id,
                    &principal.principal_id,
                    cutoff_ms,
                )
                .await?,
            session_tombstones_deleted: 0, // principal-scoped sweep keeps tombstones
            idem_keys_expired_deleted: 0,
        })
    }

    /// Global scheduled retention sweep (infrastructure caller, not a
    /// principal). Deletes events and terminal interventions older than
    /// `now - retention_ms` across ALL tenants — the only cross-tenant
    /// operation in the service, restricted to the periodic sweep task.
    pub async fn enforce_retention_global(
        &self,
        retention_ms: u64,
    ) -> Result<RetentionReport, AppError> {
        let cutoff_ms = self.clock.now_ms().saturating_sub(retention_ms);
        // Hygiene: drop aged session tombstones and expired idempotency keys
        // in the same sweep (expiry older than the retention cutoff).
        let sessions_deleted = self.sessions.delete_expired(cutoff_ms).await?;
        let idem_deleted = self.idem.delete_expired_any(cutoff_ms).await?;
        let report = RetentionReport {
            cutoff_ms,
            events_deleted: self.events.delete_older_than_any(cutoff_ms).await?,
            terminal_interventions_deleted: self
                .sink
                .delete_terminal_older_than_any(cutoff_ms)
                .await?,
            session_tombstones_deleted: sessions_deleted,
            idem_keys_expired_deleted: idem_deleted,
        };
        self.audit_global(
            AuditAction::RetentionEnforced,
            &format!(
                "cutoff:{} events:{} interventions:{} sessions:{sessions_deleted} idem:{idem_deleted}",
                report.cutoff_ms, report.events_deleted, report.terminal_interventions_deleted
            ),
        )
        .await?;
        Ok(report)
    }

    /// Erasure: hard-deletes events, grants and intervention records; revokes
    /// all sessions and devices (audit-preserving tombstones) and scrubs
    /// device labels. A durable `DeletionReceipt` records the counts — it is
    /// audit metadata, not user content. The calling session is revoked too —
    /// the request still completes.
    pub async fn purge_data(&self, principal: &Principal) -> Result<PurgeReport, AppError> {
        let now = self.clock.now_ms();
        let mut report = PurgeReport {
            receipt_id: uuid::Uuid::new_v4().simple().to_string(),
            events_deleted: self
                .events
                .delete_by_principal(&principal.tenant_id, &principal.principal_id)
                .await?,
            grants_deleted: self
                .grants
                .delete_by_principal(&principal.tenant_id, &principal.principal_id)
                .await?,
            interventions_deleted: self
                .sink
                .delete_by_principal(&principal.tenant_id, &principal.principal_id)
                .await?,
            sessions_revoked: self
                .sessions
                .revoke_by_principal(&principal.tenant_id, &principal.principal_id)
                .await?,
            devices_revoked: 0,
            labels_scrubbed: 0,
            idem_keys_deleted: self
                .idem
                .delete_by_principal(&principal.tenant_id, &principal.principal_id)
                .await?,
        };
        for d in self
            .devices
            .list(&principal.tenant_id, &principal.principal_id)
            .await?
        {
            report.labels_scrubbed += self
                .devices
                .scrub_label(&principal.tenant_id, &principal.principal_id, &d.device_id)
                .await?;
            if d.is_active() {
                self.devices
                    .revoke(
                        &principal.tenant_id,
                        &principal.principal_id,
                        &d.device_id,
                        now,
                    )
                    .await?;
                self.sessions
                    .revoke_by_device(&principal.tenant_id, &d.device_id)
                    .await?;
                report.devices_revoked += 1;
            }
        }
        self.receipts
            .record(DeletionReceipt {
                receipt_id: report.receipt_id.clone(),
                principal_id: principal.principal_id.clone(),
                tenant_id: principal.tenant_id.clone(),
                purged_at_ms: now,
                events_deleted: report.events_deleted,
                grants_deleted: report.grants_deleted,
                interventions_deleted: report.interventions_deleted,
                sessions_revoked: report.sessions_revoked,
                devices_revoked: report.devices_revoked,
                labels_scrubbed: report.labels_scrubbed,
                idem_keys_deleted: report.idem_keys_deleted,
            })
            .await?;
        self.audit(
            &principal.tenant_id,
            &principal.principal_id,
            AuditAction::DataPurged,
            &format!("receipt:{}", report.receipt_id),
        )
        .await?;
        Ok(report)
    }

    /// Delivers every due intervention through the channel, recording state
    /// transitions and audit entries. Failures reschedule with backoff and
    /// expire after MAX_DELIVERY_ATTEMPTS. Returns the count delivered.
    /// Scheduled global dispatcher: delivers due interventions across all
    /// tenants using each intervention's own sealed binding. Infra-only;
    /// the caller-scoped `dispatch_due` remains for manual dispatch.
    pub async fn dispatch_due_global(&self) -> Result<u64, AppError> {
        let now = self.clock.now_ms();
        let mut delivered = 0u64;
        for i in self.sink.due_any(now, 100).await? {
            delivered += self.deliver_one(i, now).await? as u64;
        }
        self.audit_global(AuditAction::DispatchRan, &format!("delivered:{delivered}"))
            .await?;
        Ok(delivered)
    }

    /// Delivers a single due intervention; returns 1 on success.
    async fn deliver_one(&self, mut i: Intervention, now: u64) -> Result<u32, AppError> {
        i.attempts = i.attempts.saturating_add(1);
        let from = i.state;
        let mut delivered = 0u32;
        match self.channel.send(&i).await {
            Ok(()) => {
                i.state = DeliveryState::Delivered;
                i.last_error = None;
                delivered = 1;
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
        self.sink.update(i).await?;
        Ok(delivered)
    }

    /// Cross-tenant audit entry for infrastructure operations (retention
    /// sweeps, global dispatch). Not visible to `list_by_principal`.
    async fn audit_global(&self, action: AuditAction, detail: &str) -> Result<(), AppError> {
        self.audit
            .record(AuditEvent {
                audit_id: uuid::Uuid::new_v4().simple().to_string(),
                tenant_id: String::new(),
                principal_id: String::new(),
                action,
                detail: detail.chars().take(120).collect(),
                at_ms: self.clock.now_ms(),
            })
            .await?;
        Ok(())
    }

    /// Principal-scoped audit entry. Tombstone: survives erasure.
    async fn audit(
        &self,
        tenant_id: &str,
        principal_id: &str,
        action: AuditAction,
        detail: &str,
    ) -> Result<(), AppError> {
        self.audit
            .record(AuditEvent {
                audit_id: uuid::Uuid::new_v4().simple().to_string(),
                tenant_id: tenant_id.to_string(),
                principal_id: principal_id.to_string(),
                action,
                detail: detail.chars().take(120).collect(),
                at_ms: self.clock.now_ms(),
            })
            .await?;
        Ok(())
    }

    /// The principal's own audit history.
    pub async fn list_audit(&self, principal: &Principal) -> Result<Vec<AuditEvent>, AppError> {
        Ok(self
            .audit
            .list_by_principal(&principal.tenant_id, &principal.principal_id)
            .await?)
    }

    /// The caller's stored observed events (read-back surface; digests and
    /// typed signals only — never content).
    pub async fn list_events(&self, principal: &Principal) -> Result<Vec<ObservedEvent>, AppError> {
        Ok(self
            .events
            .list_by_principal(&principal.tenant_id, &principal.principal_id)
            .await?)
    }

    pub async fn dispatch_due(&self, principal: &Principal) -> Result<u64, AppError> {
        if !principal.has_scope(Scope::EventsWrite) {
            return Err(AppError::Forbidden);
        }
        let now = self.clock.now_ms();
        let mut delivered = 0u64;
        for i in self.sink.due(now, 50).await? {
            if i.tenant_id != principal.tenant_id || i.principal_id != principal.principal_id {
                continue;
            }
            delivered += self.deliver_one(i, now).await? as u64;
        }
        Ok(delivered)
    }

    /// Inference boundary (B4/ADR-0012). Checks the privacy mode is
    /// servable, enforces the tenant's hard budget cap BEFORE calling,
    /// and records spend only after a successful verdict. No provider =>
    /// honest refusal, never a fabricated verdict.
    pub async fn assess_with_inference(
        &self,
        principal: &Principal,
        req: InferenceRequest,
    ) -> Result<InferenceVerdict, AppError> {
        if !principal.has_scope(Scope::EventsWrite) {
            return Err(AppError::Forbidden);
        }
        if !valid_identifier(&req.request_id) {
            return Err(AppError::InvalidRequest);
        }
        let gw = self.inference.as_ref().filter(|g| g.serves(req.privacy));
        let Some(gw) = gw else {
            self.audit(
                &principal.tenant_id,
                &principal.principal_id,
                AuditAction::InferenceCalled,
                &format!("unavailable req:{}", req.request_id),
            )
            .await?;
            return Err(AppError::ProviderUnavailable);
        };
        // Durable reservation gate (B21): atomic cap check + pending row
        // in one transaction — no check-then-act window. Same request_id
        // is idempotent, so replayed ingress reuses its reservation.
        match self
            .reservations
            .reserve(
                &principal.tenant_id,
                &req.request_id,
                req.est_cost_micro_usd,
            )
            .await?
        {
            sovir_ports::ReserveOutcome::BudgetExceeded => {
                return Err(AppError::BudgetExceeded)
            }
            sovir_ports::ReserveOutcome::Reserved(_) => {}
        }
        let verdict = match gw.assess(&req).await {
            Ok(v) => v,
            Err(e) => {
                let _ = self
                    .reservations
                    .refund(&principal.tenant_id, &req.request_id)
                    .await;
                return Err(e.into());
            }
        };
        // Without provider metering, actuals equal the estimate. Usage
        // still records what the gateway itself reported (model,
        // provenance, redaction tier) so accounting is honest, not fake.
        let usage = sovir_domain::InferenceUsage {
            provider: verdict.provenance.clone(),
            model: verdict.model_id.clone(),
            tokens_est: 0,
            tokens_actual: None,
            cache_hit: false,
            redaction_tier: match req.privacy {
                sovir_domain::PrivacyMode::Private => "private".to_string(),
                _ => "standard".to_string(),
            },
        };
        self.reservations
            .settle(
                &principal.tenant_id,
                &req.request_id,
                req.est_cost_micro_usd,
                usage,
            )
            .await?;
        self.audit(
            &principal.tenant_id,
            &principal.principal_id,
            AuditAction::InferenceCalled,
            &format!(
                "ok req:{} micros:{} model:{}",
                req.request_id, req.est_cost_micro_usd, verdict.model_id
            ),
        )
        .await?;
        Ok(verdict)
    }

    /// Threat-intel ingest (B5): pulls candidates and keeps only
    /// indicators with verifiable provenance and bounded values. Anything
    /// else is dropped, never trusted.
    pub async fn pull_intel(&self, principal: &Principal) -> Result<u64, AppError> {
        if !principal.has_scope(Scope::EventsWrite) {
            return Err(AppError::Forbidden);
        }
        let now = self.clock.now_ms();
        let mut kept = 0u64;
        let mut dropped = 0u64;
        for mut ind in self.intel.pull(0).await? {
            if ind.provenance.is_empty() || !valid_identifier(&ind.value) {
                dropped += 1;
                continue; // unverified — drop
            }
            ind.tenant_id = principal.tenant_id.clone();
            ind.at_ms = if ind.at_ms == 0 { now } else { ind.at_ms };
            self.intel.record(ind).await?;
            kept += 1;
        }
        self.audit(
            &principal.tenant_id,
            &principal.principal_id,
            AuditAction::IntelPulled,
            &format!("kept:{kept} dropped:{dropped}"),
        )
        .await?;
        Ok(kept)
    }

    /// Indicators already validated and recorded for the tenant.
    pub async fn list_intel(&self, principal: &Principal) -> Result<Vec<IntelIndicator>, AppError> {
        Ok(self.intel.list(&principal.tenant_id).await?)
    }
}
