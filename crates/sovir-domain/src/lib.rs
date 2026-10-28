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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
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

/// Shared identifier rule: non-empty, bounded, no control characters.
pub fn valid_identifier(s: &str) -> bool {
    !s.trim().is_empty() && s.len() <= 128 && !s.chars().any(char::is_control)
}

pub fn validate_device(d: &Device) -> Result<(), DomainError> {
    if !valid_identifier(&d.device_id)
        || !valid_identifier(&d.principal_id)
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventDecision {
    pub event_id: String,
    pub assessment: Assessment,
    pub protected_action_executed: bool,
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
pub fn evaluate_signals(signals: &[RiskSignal]) -> Assessment {
    let has = |s| signals.contains(&s);
    let sensitive_request = has(RiskSignal::CredentialRequest) || has(RiskSignal::PaymentRequest);
    let compounded =
        sensitive_request && (has(RiskSignal::IdentityUnverified) || has(RiskSignal::UrgentAction));
    let user_control = has(RiskSignal::TrackingObserved)
        || has(RiskSignal::ConsentDarkPattern)
        || has(RiskSignal::UserDefinedExposureLimit)
        || has(RiskSignal::HiddenFeePattern);
    let (risk_level, decision) = if compounded {
        (RiskLevel::High, DecisionKind::Warn)
    } else if sensitive_request || user_control {
        (RiskLevel::Elevated, DecisionKind::Review)
    } else {
        (RiskLevel::Unknown, DecisionKind::Observe)
    };
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
                RiskSignal::ConsentDarkPattern => "Signal: possible manipulative consent interface",
                RiskSignal::UserDefinedExposureLimit => "Signal: user-defined exposure boundary",
            }
            .to_string()
        })
        .collect();
    Assessment {
        risk_level,
        decision,
        reasons,
        provenance: "synthetic_or_unverified_sensor_signals; no identity verified".into(),
    }
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
}
