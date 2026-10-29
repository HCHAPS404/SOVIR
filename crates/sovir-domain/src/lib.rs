//! Pure domain layer: no HTTP, SQL, native OS APIs or model providers.
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Modality {
    Text,
    UiTree,
    ImageRegion,
    Url,
    Notification,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SensitiveDataClass {
    Public,
    Personal,
    Sensitive,
    Secret,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RiskSignal {
    CredentialRequest,
    PaymentRequest,
    UrgentAction,
    IdentityUnverified,
    TrackingObserved,
    HiddenFeePattern,
    ConsentDarkPattern,
    UserDefinedExposureLimit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ObservedEvent {
    pub event_id: String,
    pub source_id: String,
    pub observed_at_ms: u64,
    pub modality: Modality,
    pub content_digest: String,
    pub consent_grant_id: String,
    pub sensitive_data_class: SensitiveDataClass,
    #[serde(default)]
    pub payload_ref: Option<String>,
    /// Untrusted, locally-derived hints, NOT proof of a threat.
    #[serde(default)]
    pub signals: Vec<RiskSignal>,
    /// Server-sealed binding to the authenticated principal. `skip_deserializing`
    /// means a client cannot set it; the API fills it from the session.
    #[serde(default, skip_deserializing)]
    pub principal_id: String,
    /// Server-sealed binding to the session device.
    #[serde(default, skip_deserializing)]
    pub device_id: String,
    /// Server-sealed tenant binding (B19). Filled from the session.
    #[serde(default, skip_deserializing)]
    pub tenant_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConsentGrant {
    pub grant_id: String,
    pub source_id: String,
    pub expires_at_ms: u64,
    #[serde(default)]
    pub revoked: bool,
    /// Server-sealed binding to the authenticated principal.
    #[serde(default, skip_deserializing)]
    pub principal_id: String,
    /// Server-sealed binding to the session device.
    #[serde(default, skip_deserializing)]
    pub device_id: String,
    /// Server-sealed tenant binding (B19). Filled from the session.
    #[serde(default, skip_deserializing)]
    pub tenant_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Platform {
    Android,
    Ios,
    Windows,
    Macos,
    Linux,
    BrowserExtension,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Scope {
    ConsentWrite,
    EventsWrite,
    DevicesWrite,
    SessionsWrite,
}

/// Authenticated caller context. Produced only by a `SessionStore` resolve;
/// never constructed from client-supplied fields.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Principal {
    pub principal_id: String,
    pub tenant_id: String,
    pub device_id: String,
    pub session_id: String,
    pub scopes: Vec<Scope>,
}
impl Principal {
    pub fn has_scope(&self, scope: Scope) -> bool {
        self.scopes.contains(&scope)
    }
}

/// Development session record stored by the SessionStore port.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub token: String,
    pub session_id: String,
    pub principal_id: String,
    pub tenant_id: String,
    pub device_id: String,
    pub scopes: Vec<Scope>,
    pub expires_at_ms: u64,
    #[serde(default)]
    pub revoked: bool,
}
impl Session {
    /// An expired or revoked session yields no principal (fail closed).
    pub fn principal(&self, now_ms: u64) -> Option<Principal> {
        if self.revoked || self.expires_at_ms <= now_ms {
            return None;
        }
        Some(Principal {
            principal_id: self.principal_id.clone(),
            tenant_id: self.tenant_id.clone(),
            device_id: self.device_id.clone(),
            session_id: self.session_id.clone(),
            scopes: self.scopes.clone(),
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub device_id: String,
    pub principal_id: String,
    /// Tenant binding sealed by the application layer at registration (B19).
    #[serde(default, skip_deserializing)]
    pub tenant_id: String,
    pub platform: Platform,
    pub label: String,
    pub registered_at_ms: u64,
    #[serde(default)]
    pub last_seen_at_ms: Option<u64>,
    #[serde(default)]
    pub revoked_at_ms: Option<u64>,
}
impl Device {
    pub fn is_active(&self) -> bool {
        self.revoked_at_ms.is_none()
    }
}

/// Durable audit tombstone produced by erasure. Carries only counts and the
/// pseudonymous principal id — never payloads. Retained after purge so the
/// deletion itself is auditable.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeletionReceipt {
    pub receipt_id: String,
    pub principal_id: String,
    #[serde(default)]
    pub tenant_id: String,
    pub purged_at_ms: u64,
    pub events_deleted: u64,
    pub grants_deleted: u64,
    pub interventions_deleted: u64,
    pub sessions_revoked: u64,
    pub devices_revoked: u64,
    pub labels_scrubbed: u64,
    #[serde(default)]
    pub idem_keys_deleted: u64,
}

/// Idempotent-ingest record (B10). Stores the request hash and the first
/// response for an Idempotency-Key so replays return the same response and
/// conflicting reuses are detected. Metadata only — no event payloads.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdempotentResponse {
    pub tenant_id: String,
    pub principal_id: String,
    pub idem_key: String,
    /// Hash of the request body the key was first used with.
    pub body_hash: i64,
    /// The stored response (EventDecision JSON).
    pub response_json: serde_json::Value,
    pub created_at_ms: u64,
}

/// Shared identifier rule: non-empty, bounded, no control characters.
pub fn valid_identifier(s: &str) -> bool {
    !s.trim().is_empty() && s.len() <= 128 && !s.chars().any(char::is_control)
}

pub fn validate_device(d: &Device) -> Result<(), DomainError> {
    if !valid_identifier(&d.device_id)
        || !valid_identifier(&d.principal_id)
        || !valid_identifier(&d.tenant_id)
        || d.label.len() > 128
        || d.label.chars().any(char::is_control)
    {
        return Err(DomainError::InvalidIdentifier);
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DecisionKind {
    Observe,
    Review,
    Warn,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    Unknown,
    Low,
    Elevated,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Assessment {
    pub risk_level: RiskLevel,
    pub decision: DecisionKind,
    /// Only explanations of signals supplied to this evaluator; never claims of verified intent.
    pub reasons: Vec<String>,
    pub provenance: String,
    /// Version of the policy pack that produced this assessment (ADR-0011).
    #[serde(default)]
    pub policy_version: String,
}

/// Typed escalation pattern detected across a time window (B2).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SequencePattern {
    /// A manipulation cue (urgency, dark pattern, hidden fee, tracking)
    /// followed by a payment request inside the window.
    HookThenPayment,
    /// Unverified identity signal followed by a credential request.
    IdentityThenCredential,
    /// At least three distinct manipulation signals inside the window.
    EscalatingManipulation,
}

/// A detected sequence: which pattern, over what span, on which events.
/// Carries event ids only — never payloads.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SequenceFinding {
    pub pattern: SequencePattern,
    pub span_ms: u64,
    pub event_ids: Vec<String>,
}

/// Canonical evidence ordering: dedup by `event_id` (first wins), then
/// sort ascending by `observed_at_ms` (ADR-0011).
pub fn normalize_events(mut events: Vec<ObservedEvent>) -> Vec<ObservedEvent> {
    let mut seen = std::collections::HashSet::new();
    events.retain(|e| seen.insert(e.event_id.clone()));
    events.sort_by_key(|e| e.observed_at_ms);
    events
}

/// Detect escalation sequences inside a normalized window. Pure function;
/// hints only — findings are hypotheses, not proof of intent.
pub fn detect_sequences(events: &[ObservedEvent]) -> Vec<SequenceFinding> {
    const MANIPULATION: &[RiskSignal] = &[
        RiskSignal::UrgentAction,
        RiskSignal::ConsentDarkPattern,
        RiskSignal::HiddenFeePattern,
        RiskSignal::TrackingObserved,
    ];
    let has = |e: &ObservedEvent, s: RiskSignal| e.signals.contains(&s);
    let first_with = |pred: &dyn Fn(&ObservedEvent) -> bool| events.iter().position(|e| pred(e));
    let later_with = |from: usize, pred: &dyn Fn(&ObservedEvent) -> bool| {
        events
            .iter()
            .skip(from + 1)
            .position(|e| pred(e))
            .map(|p| p + from + 1)
    };
    let mut findings = Vec::new();
    // hook cue earlier -> payment request later
    if let Some(i) = first_with(&|e| MANIPULATION.iter().any(|m| has(e, *m))) {
        if let Some(j) = later_with(i, &|e| has(e, RiskSignal::PaymentRequest)) {
            findings.push(SequenceFinding {
                pattern: SequencePattern::HookThenPayment,
                span_ms: events[j].observed_at_ms - events[i].observed_at_ms,
                event_ids: vec![events[i].event_id.clone(), events[j].event_id.clone()],
            });
        }
    }
    // unverified identity earlier -> credential request later
    if let Some(i) = first_with(&|e| has(e, RiskSignal::IdentityUnverified)) {
        if let Some(j) = later_with(i, &|e| has(e, RiskSignal::CredentialRequest)) {
            findings.push(SequenceFinding {
                pattern: SequencePattern::IdentityThenCredential,
                span_ms: events[j].observed_at_ms - events[i].observed_at_ms,
                event_ids: vec![events[i].event_id.clone(), events[j].event_id.clone()],
            });
        }
    }
    // >=3 distinct manipulation signals across the window
    let mut manip_ids = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let (mut first_ms, mut last_ms) = (None, 0u64);
    for e in events {
        let mut hit = false;
        for m in MANIPULATION {
            if has(e, *m) {
                seen.insert(*m);
                hit = true;
            }
        }
        if hit {
            if first_ms.is_none() {
                first_ms = Some(e.observed_at_ms);
            }
            last_ms = e.observed_at_ms;
            manip_ids.push(e.event_id.clone());
        }
    }
    if seen.len() >= 3 {
        findings.push(SequenceFinding {
            pattern: SequencePattern::EscalatingManipulation,
            span_ms: last_ms - first_ms.unwrap_or(last_ms),
            event_ids: manip_ids,
        });
    }
    findings
}

/// One rule in a versioned policy pack. `clauses` is an AND of OR-sets:
/// the rule matches when every clause has at least one signal present.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRule {
    pub name: String,
    pub clauses: Vec<Vec<RiskSignal>>,
    pub risk_level: RiskLevel,
    pub decision: DecisionKind,
}

/// Versioned, data-defined evaluation table (ADR-0011). First matching
/// rule wins; the default applies otherwise. Loaded from
/// `packages/contracts/policy/*.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyPack {
    pub version: String,
    pub rules: Vec<PolicyRule>,
    pub default_risk: RiskLevel,
    pub default_decision: DecisionKind,
}
impl PolicyPack {
    /// Built-in development pack — identical semantics to the legacy
    /// hardcoded `evaluate_signals` table.
    pub fn dev_pack() -> Self {
        Self {
            version: "dev-1".into(),
            rules: vec![
                PolicyRule {
                    name: "compounded_sensitive_request".into(),
                    clauses: vec![
                        vec![RiskSignal::CredentialRequest, RiskSignal::PaymentRequest],
                        vec![RiskSignal::IdentityUnverified, RiskSignal::UrgentAction],
                    ],
                    risk_level: RiskLevel::High,
                    decision: DecisionKind::Warn,
                },
                PolicyRule {
                    name: "sensitive_or_manipulative".into(),
                    clauses: vec![vec![
                        RiskSignal::CredentialRequest,
                        RiskSignal::PaymentRequest,
                        RiskSignal::TrackingObserved,
                        RiskSignal::ConsentDarkPattern,
                        RiskSignal::HiddenFeePattern,
                        RiskSignal::UserDefinedExposureLimit,
                    ]],
                    risk_level: RiskLevel::Elevated,
                    decision: DecisionKind::Review,
                },
            ],
            default_risk: RiskLevel::Unknown,
            default_decision: DecisionKind::Observe,
        }
    }
    pub fn from_json(s: &str) -> Result<Self, DomainError> {
        serde_json::from_str(s).map_err(|_| DomainError::InvalidIdentifier)
    }
    /// First matching rule wins. Reasons explain supplied signals only.
    pub fn evaluate(&self, signals: &[RiskSignal]) -> Assessment {
        let has = |s: &RiskSignal| signals.contains(s);
        let (risk_level, decision) = self
            .rules
            .iter()
            .find(|r| {
                !r.clauses.is_empty() && r.clauses.iter().all(|clause| clause.iter().any(has))
            })
            .map(|r| (r.risk_level, r.decision))
            .unwrap_or((self.default_risk, self.default_decision));
        let reasons = signals
            .iter()
            .map(|signal| {
                match signal {
                    RiskSignal::CredentialRequest => "Signal: credential request",
                    RiskSignal::PaymentRequest => "Signal: payment request",
                    RiskSignal::UrgentAction => "Signal: urgency",
                    RiskSignal::IdentityUnverified => "Signal: unverified identity",
                    RiskSignal::TrackingObserved => "Signal: tracking detected",
                    RiskSignal::HiddenFeePattern => "Signal: possible hidden fee pattern",
                    RiskSignal::ConsentDarkPattern => {
                        "Signal: possible manipulative consent interface"
                    }
                    RiskSignal::UserDefinedExposureLimit => {
                        "Signal: user-defined exposure boundary"
                    }
                }
                .to_string()
            })
            .collect();
        Assessment {
            risk_level,
            decision,
            reasons,
            provenance: "synthetic_or_unverified_sensor_signals; no identity verified".into(),
            policy_version: self.version.clone(),
        }
    }
}
impl Default for PolicyPack {
    fn default() -> Self {
        Self::dev_pack()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventDecision {
    pub event_id: String,
    pub assessment: Assessment,
    pub protected_action_executed: bool,
    /// Escalation hypotheses found in the principal's evidence window (B2).
    #[serde(default)]
    pub sequence_findings: Vec<SequenceFinding>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterventionKind {
    /// Ambient notification; no blocking.
    Notify,
    /// Prominent warning surface; still no enforced action by itself.
    WarnBanner,
    /// The event requires explicit human review before any later action.
    RequireReview,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeliveryState {
    Pending,
    Delivered,
    Failed,
    Expired,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeliveryAuditEntry {
    pub at_ms: u64,
    pub from: DeliveryState,
    pub to: DeliveryState,
    pub detail: String,
}

/// One delivery attempt chain for a policy-produced intervention.
/// `attempts`/`next_attempt_at_ms` are managed by the application layer's
/// retry policy; the audit trail records every state transition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Intervention {
    pub intervention_id: String,
    pub event_id: String,
    pub principal_id: String,
    pub device_id: String,
    /// Tenant binding sealed at enqueue time (B19).
    #[serde(default)]
    pub tenant_id: String,
    pub kind: InterventionKind,
    pub state: DeliveryState,
    pub attempts: u32,
    pub created_at_ms: u64,
    pub next_attempt_at_ms: u64,
    #[serde(default)]
    pub last_error: Option<String>,
    #[serde(default)]
    pub audit: Vec<DeliveryAuditEntry>,
}

/// Deterministic policy: which intervention (if any) a decision produces.
/// `Observe` produces nothing — there is no automated block path.
pub fn intervention_for(decision: &EventDecision) -> Option<InterventionKind> {
    match decision.assessment.decision {
        DecisionKind::Warn => Some(InterventionKind::WarnBanner),
        DecisionKind::Review => Some(InterventionKind::RequireReview),
        DecisionKind::Observe => None,
    }
}

/// Retry policy: 1s, 2s, 4s, ... capped at 60s. Dev-scale, deterministic.
pub fn next_attempt_ms(attempts: u32, now_ms: u64) -> u64 {
    let delay = 1_000u64.saturating_mul(1u64 << attempts.min(6));
    now_ms.saturating_add(delay.min(60_000))
}
pub const MAX_DELIVERY_ATTEMPTS: u32 = 4;

/// Registered outbound webhook endpoint (B20). In development the HMAC
/// secret lives on the record; production must reference a managed secret
/// instead and never persist or return it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookEndpoint {
    pub endpoint_id: String,
    pub principal_id: String,
    /// Tenant binding sealed at registration (B19).
    #[serde(default)]
    pub tenant_id: String,
    pub url: String,
    /// Dev-only plaintext secret used to sign deliveries. NOT for production:
    /// store a KMS reference instead.
    pub secret: String,
    /// Intervention kinds this endpoint subscribes to.
    pub kinds: Vec<InterventionKind>,
    pub created_at_ms: u64,
    #[serde(default)]
    pub revoked_at_ms: Option<u64>,
}
impl WebhookEndpoint {
    pub fn is_active(&self) -> bool {
        self.revoked_at_ms.is_none()
    }
}

/// SSRF guard for outbound webhook URLs. Only http(s) URLs whose host is in
/// the explicit allowlist pass. Userinfo and non-HTTP schemes are rejected.
pub fn validate_url_for_egress(url: &str, allowed_hosts: &[String]) -> Result<(), DomainError> {
    let rest = url
        .strip_prefix("http://")
        .or_else(|| url.strip_prefix("https://"))
        .ok_or(DomainError::InvalidIdentifier)?;
    if rest.contains('@') {
        return Err(DomainError::InvalidIdentifier);
    }
    let authority = rest.split('/').next().unwrap_or_default();
    if authority.is_empty() {
        return Err(DomainError::InvalidIdentifier);
    }
    // Strip a trailing :port (IPv6 bracketed hosts are not allowed in dev).
    let host = authority.split(':').next().unwrap_or_default();
    if host.is_empty() || !allowed_hosts.iter().any(|h| h == host) {
        return Err(DomainError::InvalidIdentifier);
    }
    Ok(())
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum DomainError {
    #[error("invalid identifier or digest")]
    InvalidIdentifier,
    #[error("consent not active or not scoped to the event")]
    ConsentRequired,
    #[error("secret data not accepted by demonstration API")]
    SecretRejected,
    #[error("raw payload references forbidden in demonstration API")]
    PayloadReferenceRejected,
    #[error("event timestamp outside permitted window")]
    TimestampOutOfBounds,
}

pub fn validate_consent(
    event: &ObservedEvent,
    grant: &ConsentGrant,
    now_ms: u64,
) -> Result<(), DomainError> {
    if grant.revoked
        || grant.expires_at_ms <= now_ms
        || grant.grant_id != event.consent_grant_id
        || grant.source_id != event.source_id
        // The grant's server-sealed principal/device binding must match the
        // event's. Both default to "" when unbound (legacy/in-test objects),
        // so equality still holds for unbound pairs.
        || grant.principal_id != event.principal_id
        || grant.device_id != event.device_id
        // Tenant isolation (B19): a grant sealed to one tenant can never
        // authorize an event sealed to another.
        || grant.tenant_id != event.tenant_id
    {
        return Err(DomainError::ConsentRequired);
    }
    Ok(())
}

pub fn validate_event(event: &ObservedEvent, now_ms: u64) -> Result<(), DomainError> {
    if !valid_identifier(&event.event_id)
        || !valid_identifier(&event.source_id)
        || !valid_identifier(&event.consent_grant_id)
        || !valid_identifier(&event.content_digest)
    {
        return Err(DomainError::InvalidIdentifier);
    }
    if event.signals.len() > 8 {
        return Err(DomainError::InvalidIdentifier);
    }
    if event.sensitive_data_class == SensitiveDataClass::Secret {
        return Err(DomainError::SecretRejected);
    }
    if event.payload_ref.is_some() {
        return Err(DomainError::PayloadReferenceRejected);
    }
    // Events more than 10 minutes in future or 24 hours old require a dedicated replay workflow.
    if event.observed_at_ms > now_ms.saturating_add(600_000)
        || event.observed_at_ms.saturating_add(86_400_000) < now_ms
    {
        return Err(DomainError::TimestampOutOfBounds);
    }
    Ok(())
}

/// Deterministic, conservative, client-hints-only baseline. Not validated fraud detection.
/// Legacy entry point: evaluates via the built-in dev policy pack
/// (ADR-0011). Callers needing a specific version should use
/// `PolicyPack::evaluate` directly.
pub fn evaluate_signals(signals: &[RiskSignal]) -> Assessment {
    PolicyPack::dev_pack().evaluate(signals)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn event() -> ObservedEvent {
        ObservedEvent {
            event_id: "evt-1".into(),
            source_id: "browser".into(),
            observed_at_ms: 1000,
            modality: Modality::Url,
            content_digest: "sha256:deadbeef".into(),
            consent_grant_id: "consent-1".into(),
            sensitive_data_class: SensitiveDataClass::Public,
            payload_ref: None,
            signals: vec![],
            principal_id: String::new(),
            device_id: String::new(),
            tenant_id: String::new(),
        }
    }
    #[test]
    fn consent_revocation_always_denies() {
        let mut grant = ConsentGrant {
            grant_id: "consent-1".into(),
            source_id: "browser".into(),
            expires_at_ms: 3000,
            revoked: true,
            principal_id: String::new(),
            device_id: String::new(),
            tenant_id: String::new(),
        };
        assert_eq!(
            validate_consent(&event(), &grant, 1000),
            Err(DomainError::ConsentRequired)
        );
        grant.revoked = false;
        grant.source_id = "other".into();
        assert_eq!(
            validate_consent(&event(), &grant, 1000),
            Err(DomainError::ConsentRequired)
        );
    }
    #[test]
    fn secret_is_rejected() {
        let mut e = event();
        e.sensitive_data_class = SensitiveDataClass::Secret;
        assert_eq!(validate_event(&e, 1000), Err(DomainError::SecretRejected));
    }
    #[test]
    fn payment_plus_unverified_identity_warns_without_enforcement() {
        let a = evaluate_signals(&[RiskSignal::PaymentRequest, RiskSignal::IdentityUnverified]);
        assert_eq!(a.risk_level, RiskLevel::High);
        assert_eq!(a.decision, DecisionKind::Warn);
    }
    #[test]
    fn neutral_signals_do_not_assert_safety() {
        let a = evaluate_signals(&[]);
        assert_eq!(a.risk_level, RiskLevel::Unknown);
        assert_eq!(a.decision, DecisionKind::Observe);
    }
    #[test]
    fn json_contract_serializes_expected_enum_names() {
        let e = event();
        let v = serde_json::to_value(e).expect("serialize");
        assert_eq!(v["modality"], "URL");
        assert_eq!(v["sensitive_data_class"], "PUBLIC");
    }
    #[test]
    fn egress_url_allowlist_is_strict() {
        let allow = vec!["hooks.example.com".to_string(), "127.0.0.1".to_string()];
        let ok = |u| validate_url_for_egress(u, &allow).is_ok();
        let bad = |u| validate_url_for_egress(u, &allow).is_err();
        assert!(ok("https://hooks.example.com/x"));
        assert!(ok("http://127.0.0.1:8787/hook"));
        assert!(bad("https://evil.example.com/"));
        assert!(bad("https://hooks.example.com.evil.com/"));
        assert!(bad("https://hooks.example.com./"));
        assert!(bad("https://user:pw@hooks.example.com/"));
        assert!(bad("https://hooks.example.com@evil.com/"));
        assert!(bad("https://[::1]/"));
        assert!(bad("ftp://hooks.example.com/"));
        assert!(bad("hooks.example.com/path"));
        assert!(bad("https:///path"));
        assert!(bad("HTTPS://hooks.example.com/"));
        assert!(bad("http://allowed-but-not-listed.com/"));
        assert!(bad(""));
    }
    #[test]
    fn normalize_events_dedups_and_orders() {
        let mut e1 = event();
        e1.event_id = "b".into();
        e1.observed_at_ms = 200;
        let mut e2 = event();
        e2.event_id = "a".into();
        e2.observed_at_ms = 100;
        let dup = e1.clone();
        let out = normalize_events(vec![e1, e2, dup]);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].event_id, "a");
        assert_eq!(out[1].event_id, "b");
    }
    #[test]
    fn detects_hook_then_payment_sequence() {
        let mut hook = event();
        hook.event_id = "hook".into();
        hook.observed_at_ms = 100;
        hook.signals = vec![RiskSignal::UrgentAction];
        let mut pay = event();
        pay.event_id = "pay".into();
        pay.observed_at_ms = 300;
        pay.signals = vec![RiskSignal::PaymentRequest];
        let findings = detect_sequences(&normalize_events(vec![pay.clone(), hook.clone()]));
        assert!(findings
            .iter()
            .any(|f| f.pattern == SequencePattern::HookThenPayment
                && f.span_ms == 200
                && f.event_ids == vec!["hook".to_string(), "pay".to_string()]));
        // Payment BEFORE the hook cue is not an escalation sequence.
        let mut early_pay = event();
        early_pay.event_id = "pay-early".into();
        early_pay.observed_at_ms = 50;
        early_pay.signals = vec![RiskSignal::PaymentRequest];
        let findings = detect_sequences(&normalize_events(vec![early_pay, hook]));
        assert!(findings
            .iter()
            .all(|f| f.pattern != SequencePattern::HookThenPayment));
    }
    #[test]
    fn detects_escalating_manipulation() {
        let mk = |id: &str, ms: u64, sig: RiskSignal| {
            let mut e = event();
            e.event_id = id.into();
            e.observed_at_ms = ms;
            e.signals = vec![sig];
            e
        };
        let window = normalize_events(vec![
            mk("e1", 100, RiskSignal::UrgentAction),
            mk("e2", 200, RiskSignal::ConsentDarkPattern),
            mk("e3", 300, RiskSignal::HiddenFeePattern),
        ]);
        let findings = detect_sequences(&window);
        assert!(findings.iter().any(
            |f| f.pattern == SequencePattern::EscalatingManipulation && f.event_ids.len() == 3
        ));
    }
    #[test]
    fn contract_policy_pack_matches_dev_pack() {
        // The JSON artifact is the versioned source of truth; the built-in
        // dev pack must evaluate identically (ADR-0011).
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../packages/contracts/policy/dev-risk-pack.v1.json"
        );
        let json = std::fs::read_to_string(path).expect("read policy pack artifact");
        let loaded = PolicyPack::from_json(&json).expect("parse policy pack");
        assert_eq!(loaded.version, PolicyPack::dev_pack().version);
        assert_eq!(loaded.rules.len(), PolicyPack::dev_pack().rules.len());
        // Same verdicts across every possible signal combination.
        let all = [
            RiskSignal::CredentialRequest,
            RiskSignal::PaymentRequest,
            RiskSignal::UrgentAction,
            RiskSignal::IdentityUnverified,
            RiskSignal::TrackingObserved,
            RiskSignal::HiddenFeePattern,
            RiskSignal::ConsentDarkPattern,
            RiskSignal::UserDefinedExposureLimit,
        ];
        for mask in 0..256u16 {
            let signals: Vec<RiskSignal> = all
                .iter()
                .enumerate()
                .filter(|(i, _)| mask & (1 << i) != 0)
                .map(|(_, s)| *s)
                .collect();
            let a = loaded.evaluate(&signals);
            let b = PolicyPack::dev_pack().evaluate(&signals);
            assert_eq!(
                (a.risk_level, a.decision),
                (b.risk_level, b.decision),
                "mask {mask}"
            );
        }
    }
    #[test]
    fn eval_corpus_reports_agreement_metrics() {
        // B3 eval: replay the labeled corpus through the dev pack and
        // measure agreement. Threshold 100% — the pack is the dev baseline;
        // a mismatch means either the pack or the labels drifted.
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../packages/contracts/policy/eval-corpus.v1.json"
        );
        let json = std::fs::read_to_string(path).expect("read eval corpus");
        let corpus: serde_json::Value = serde_json::from_str(&json).expect("parse corpus");
        let pack = PolicyPack::dev_pack();
        let (mut agree, mut total) = (0u32, 0u32);
        let (mut tp, mut fp, mut fn_) = (0u32, 0u32, 0u32); // "warn" as positive
        for case in corpus["cases"].as_array().expect("cases array") {
            total += 1;
            let signals: Vec<RiskSignal> = case["signals"]
                .as_array()
                .unwrap()
                .iter()
                .map(|s| serde_json::from_value(s.clone()).unwrap())
                .collect();
            let a = pack.evaluate(&signals);
            let exp_risk: RiskLevel = serde_json::from_value(case["expect_risk"].clone()).unwrap();
            let exp_dec: DecisionKind =
                serde_json::from_value(case["expect_decision"].clone()).unwrap();
            if a.risk_level == exp_risk && a.decision == exp_dec {
                agree += 1;
            } else {
                eprintln!(
                    "MISMATCH {} -> {:?}/{:?} expected {:?}/{:?}",
                    case["name"], a.risk_level, a.decision, exp_risk, exp_dec
                );
            }
            let warned = a.decision == DecisionKind::Warn;
            let exp_warn = exp_dec == DecisionKind::Warn;
            match (warned, exp_warn) {
                (true, true) => tp += 1,
                (true, false) => fp += 1,
                (false, true) => fn_ += 1,
                _ => {}
            }
        }
        eprintln!(
            "eval: {agree}/{total} agreement; warn precision={} recall={}",
            if tp + fp == 0 {
                1.0
            } else {
                tp as f64 / (tp + fp) as f64
            },
            if tp + fn_ == 0 {
                1.0
            } else {
                tp as f64 / (tp + fn_) as f64
            },
        );
        assert_eq!(agree, total, "dev pack must match its labeled corpus");
        assert_eq!(fp, 0, "no false warns in dev corpus");
    }
}
