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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConsentGrant {
    pub grant_id: String,
    pub source_id: String,
    pub expires_at_ms: u64,
    #[serde(default)]
    pub revoked: bool,
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
    {
        return Err(DomainError::ConsentRequired);
    }
    Ok(())
}

pub fn validate_event(event: &ObservedEvent, now_ms: u64) -> Result<(), DomainError> {
    fn valid(s: &str) -> bool {
        !s.trim().is_empty() && s.len() <= 128 && !s.chars().any(char::is_control)
    }
    if !valid(&event.event_id)
        || !valid(&event.source_id)
        || !valid(&event.consent_grant_id)
        || !valid(&event.content_digest)
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
        }
    }
    #[test]
    fn consent_revocation_always_denies() {
        let mut grant = ConsentGrant {
            grant_id: "consent-1".into(),
            source_id: "browser".into(),
            expires_at_ms: 3000,
            revoked: true,
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
