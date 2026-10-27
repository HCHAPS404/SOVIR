use sovir_adapters::{
    DeterministicRiskAnalyzer, InMemoryConsentRepository, InMemoryEventRepository,
};
use sovir_application::{AppError, SovirService};
use sovir_domain::{
    ConsentGrant, DomainError, Modality, ObservedEvent, RiskLevel, RiskSignal, SensitiveDataClass,
};
use sovir_ports::Clock;
use std::sync::Arc;
struct FixedClock;
impl Clock for FixedClock {
    fn now_ms(&self) -> u64 {
        10_000
    }
}
fn service() -> SovirService {
    SovirService::new(
        Arc::new(FixedClock),
        Arc::new(InMemoryConsentRepository::default()),
        Arc::new(InMemoryEventRepository::default()),
        Arc::new(DeterministicRiskAnalyzer),
    )
}
fn grant() -> ConsentGrant {
    ConsentGrant {
        grant_id: "grant-1".into(),
        source_id: "browser".into(),
        expires_at_ms: 20_000,
        revoked: false,
    }
}
fn event() -> ObservedEvent {
    ObservedEvent {
        event_id: "event-1".into(),
        source_id: "browser".into(),
        observed_at_ms: 10_000,
        modality: Modality::Url,
        content_digest: "sha256:aaa".into(),
        consent_grant_id: "grant-1".into(),
        sensitive_data_class: SensitiveDataClass::Public,
        payload_ref: None,
        signals: vec![RiskSignal::PaymentRequest, RiskSignal::IdentityUnverified],
    }
}
#[test]
fn ingest_requires_consent_and_respects_revocation() {
    let service = service();
    assert!(matches!(
        service.ingest(event()),
        Err(AppError::ConsentNotFound)
    ));
    service.grant(grant()).unwrap();
    let accepted = service.ingest(event()).unwrap();
    assert_eq!(accepted.assessment.risk_level, RiskLevel::High);
    assert!(!accepted.protected_action_executed);
    assert!(matches!(service.ingest(event()), Err(AppError::Port(_))));
    service.revoke("grant-1").unwrap();
    // A revoked grant ID cannot be quietly reactivated by submitting another grant.
    assert!(matches!(service.grant(grant()), Err(AppError::Port(_))));
    let mut next = event();
    next.event_id = "event-2".into();
    assert!(matches!(
        service.ingest(next),
        Err(AppError::Domain(DomainError::ConsentRequired))
    ));
}
#[test]
fn scope_mismatch_and_secret_fail_closed() {
    let service = service();
    service.grant(grant()).unwrap();
    let mut wrong = event();
    wrong.source_id = "other-app".into();
    assert!(matches!(
        service.ingest(wrong),
        Err(AppError::Domain(DomainError::ConsentRequired))
    ));
    let mut secret = event();
    secret.sensitive_data_class = SensitiveDataClass::Secret;
    assert!(matches!(
        service.ingest(secret),
        Err(AppError::Domain(DomainError::SecretRejected))
    ));
}
