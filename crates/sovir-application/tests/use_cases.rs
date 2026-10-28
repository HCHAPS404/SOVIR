use sovir_adapters::{
    CompositeDeliveryChannel, DeterministicRiskAnalyzer, InMemoryConsentRepository,
    InMemoryDeviceRegistry, InMemoryEventRepository, InMemoryInterventionSink,
    InMemorySessionStore, InMemoryWebhookRegistry, RecordingDeliveryChannel, RecordingHttpEgress,
    WebhookChannel,
};
use sovir_application::{AppError, ServicePorts, SovirService};
use sovir_domain::{
    ConsentGrant, DeliveryState, DomainError, InterventionKind, Modality, ObservedEvent, Platform,
    Principal, RiskLevel, RiskSignal, Scope, SensitiveDataClass,
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
        ServicePorts {
            grants: Arc::new(InMemoryConsentRepository::default()),
            events: Arc::new(InMemoryEventRepository::default()),
            risk: Arc::new(DeterministicRiskAnalyzer),
            sessions: Arc::new(InMemorySessionStore::default()),
            devices: Arc::new(InMemoryDeviceRegistry::default()),
            sink: Arc::new(InMemoryInterventionSink::default()),
            channel: Arc::new(RecordingDeliveryChannel::default()),
            webhooks: Arc::new(InMemoryWebhookRegistry::default()),
        },
    )
}
fn principal(id: &str) -> Principal {
    Principal {
        principal_id: id.into(),
        tenant_id: "dev".into(),
        device_id: "dev-device".into(),
        session_id: "ses-1".into(),
        scopes: vec![
            Scope::ConsentWrite,
            Scope::EventsWrite,
            Scope::DevicesWrite,
            Scope::SessionsWrite,
        ],
    }
}
fn grant() -> ConsentGrant {
    ConsentGrant {
        grant_id: "grant-1".into(),
        source_id: "browser".into(),
        expires_at_ms: 20_000,
        revoked: false,
        principal_id: String::new(),
        device_id: String::new(),
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
        principal_id: String::new(),
        device_id: String::new(),
    }
}
#[test]
fn ingest_requires_consent_and_respects_revocation() {
    let service = service();
    let p = principal("p-1");
    assert!(matches!(
        service.ingest(&p, event()),
        Err(AppError::ConsentNotFound)
    ));
    service.grant(&p, grant()).unwrap();
    let accepted = service.ingest(&p, event()).unwrap();
    assert_eq!(accepted.assessment.risk_level, RiskLevel::High);
    assert!(!accepted.protected_action_executed);
    assert!(matches!(
        service.ingest(&p, event()),
        Err(AppError::Port(_))
    ));
    service.revoke(&p, "grant-1").unwrap();
    // A revoked grant ID cannot be quietly reactivated by submitting another grant.
    assert!(matches!(service.grant(&p, grant()), Err(AppError::Port(_))));
    let mut next = event();
    next.event_id = "event-2".into();
    assert!(matches!(
        service.ingest(&p, next),
        Err(AppError::Domain(DomainError::ConsentRequired))
    ));
}
#[test]
fn scope_mismatch_and_secret_fail_closed() {
    let service = service();
    let p = principal("p-1");
    service.grant(&p, grant()).unwrap();
    let mut wrong = event();
    wrong.source_id = "other-app".into();
    assert!(matches!(
        service.ingest(&p, wrong),
        Err(AppError::Domain(DomainError::ConsentRequired))
    ));
    let mut secret = event();
    secret.sensitive_data_class = SensitiveDataClass::Secret;
    assert!(matches!(
        service.ingest(&p, secret),
        Err(AppError::Domain(DomainError::SecretRejected))
    ));
}
#[test]
fn consent_is_bound_to_principal_and_device() {
    let service = service();
    let owner = principal("owner");
    let other = principal("intruder");
    service.grant(&owner, grant()).unwrap();
    // Another principal cannot replay the grant id: binding mismatch fails closed.
    assert!(matches!(
        service.ingest(&other, event()),
        Err(AppError::Domain(DomainError::ConsentRequired))
    ));
    // Another principal cannot revoke the owner's grant either.
    assert!(matches!(
        service.revoke(&other, "grant-1"),
        Err(AppError::Forbidden)
    ));
}
#[test]
fn dev_session_lifecycle_and_device_revocation_fail_closed() {
    let service = service();
    let session = service.issue_dev_session("p-1", "dev-device").unwrap();
    let p = service.authenticate(&session.token).unwrap();
    assert_eq!(p.principal_id, "p-1");
    service
        .register_device(&p, Some("dev-device"), Platform::Windows, "rig")
        .unwrap();
    service
        .grant(&p, grant())
        .and_then(|_| service.ingest(&p, event()).map(|_| ()))
        .unwrap();
    // Revoking the device kills sessions AND bound grants.
    assert!(service.revoke_device(&p, "dev-device").unwrap());
    assert!(matches!(
        service.authenticate(&session.token),
        Err(AppError::Unauthorized) | Err(AppError::DeviceRevoked)
    ));
    // A fresh session for a revoked device is refused too.
    assert!(matches!(
        service.issue_dev_session("p-1", "dev-device"),
        Err(AppError::DeviceRevoked)
    ));
}
#[test]
fn warn_decision_enqueues_intervention_and_dispatch_delivers() {
    let service = service();
    let p = principal("p-1");
    service.grant(&p, grant()).unwrap();
    let decision = service.ingest(&p, event()).unwrap();
    assert_eq!(
        decision.assessment.decision,
        sovir_domain::DecisionKind::Warn
    );
    let pending = service.list_interventions(&p).unwrap();
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].kind, InterventionKind::WarnBanner);
    assert_eq!(pending[0].state, DeliveryState::Pending);
    assert_eq!(service.dispatch_due(&p).unwrap(), 1);
    let done = service.list_interventions(&p).unwrap();
    assert_eq!(done[0].state, DeliveryState::Delivered);
    assert_eq!(done[0].attempts, 1);
    assert_eq!(done[0].audit.len(), 1);
    // Nothing left due.
    assert_eq!(service.dispatch_due(&p).unwrap(), 0);
}
#[test]
fn observe_decision_enqueues_nothing() {
    let service = service();
    let p = principal("p-1");
    service.grant(&p, grant()).unwrap();
    let mut e = event();
    e.signals = vec![];
    service.ingest(&p, e).unwrap();
    assert!(service.list_interventions(&p).unwrap().is_empty());
}
#[test]
fn export_and_purge_principal_data() {
    let service = service();
    let p = principal("p-1");
    service
        .register_device(&p, Some("dev-device"), Platform::Linux, "rig")
        .unwrap();
    service.grant(&p, grant()).unwrap();
    service.ingest(&p, event()).unwrap();
    let export = service.export_data(&p).unwrap();
    assert_eq!(export.grants.len(), 1);
    assert_eq!(export.events.len(), 1);
    assert_eq!(export.devices.len(), 1);
    assert_eq!(export.interventions.len(), 1);
    // Another principal's data is not in the export.
    let other = principal("p-2");
    assert!(service.export_data(&other).unwrap().events.is_empty());
    // Purge removes stored data and revokes access.
    let report = service.purge_data(&p).unwrap();
    assert_eq!(report.events_deleted, 1);
    assert_eq!(report.grants_deleted, 1);
    assert_eq!(report.interventions_deleted, 1);
    assert_eq!(report.devices_revoked, 1);
    assert!(service.export_data(&p).unwrap().events.is_empty());
}
#[test]
fn revoking_device_expires_its_pending_interventions() {
    let service = service();
    let p = principal("p-1");
    service
        .register_device(&p, Some("dev-device"), Platform::Android, "phone")
        .unwrap();
    service.grant(&p, grant()).unwrap();
    service.ingest(&p, event()).unwrap(); // warn -> pending intervention
    assert_eq!(
        service.list_interventions(&p).unwrap()[0].state,
        DeliveryState::Pending
    );
    service.revoke_device(&p, "dev-device").unwrap();
    let after = service.list_interventions(&p).unwrap();
    assert_eq!(after[0].state, DeliveryState::Expired);
    assert_eq!(after[0].audit.last().unwrap().detail, "device revoked");
}
#[test]
fn webhook_delivery_signs_and_honors_allowlist_and_revocation() {
    let registry = Arc::new(InMemoryWebhookRegistry::default());
    let egress = Arc::new(RecordingHttpEgress::default());
    let service = SovirService::new(
        Arc::new(FixedClock),
        ServicePorts {
            grants: Arc::new(InMemoryConsentRepository::default()),
            events: Arc::new(InMemoryEventRepository::default()),
            risk: Arc::new(DeterministicRiskAnalyzer),
            sessions: Arc::new(InMemorySessionStore::default()),
            devices: Arc::new(InMemoryDeviceRegistry::default()),
            sink: Arc::new(InMemoryInterventionSink::default()),
            channel: Arc::new(CompositeDeliveryChannel(vec![
                Arc::new(RecordingDeliveryChannel::default()),
                Arc::new(WebhookChannel::new(registry.clone(), egress.clone())),
            ])),
            webhooks: registry,
        },
    );
    let p = principal("p-1");
    let allow = vec!["127.0.0.1".to_string(), "localhost".to_string()];
    // SSRF guard: external host rejected.
    assert!(service
        .register_webhook(
            &p,
            "https://evil.example.com/hook",
            vec![InterventionKind::WarnBanner],
            &allow
        )
        .is_err());
    let ep = service
        .register_webhook(
            &p,
            "http://127.0.0.1:9999/hook",
            vec![InterventionKind::WarnBanner],
            &allow,
        )
        .unwrap();
    service.grant(&p, grant()).unwrap();
    service.ingest(&p, event()).unwrap(); // warn -> intervention
    assert_eq!(service.dispatch_due(&p).unwrap(), 1);
    let sent = egress.0.lock().unwrap();
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].url, "http://127.0.0.1:9999/hook");
    let expected = format!("sha256={}", WebhookChannel::sign(&ep.secret, &sent[0].body));
    assert!(sent[0]
        .headers
        .iter()
        .any(|(k, v)| k == "x-sovir-signature" && *v == expected));
    drop(sent);
    // Revoked endpoint receives nothing on the next intervention.
    service.revoke_webhook(&p, &ep.endpoint_id).unwrap();
    service.revoke(&p, "grant-1").unwrap();
    service
        .grant(&p, {
            let mut g = grant();
            g.grant_id = "grant-2".into();
            g
        })
        .unwrap();
    let mut e2 = event();
    e2.event_id = "event-2".into();
    e2.consent_grant_id = "grant-2".into();
    service.ingest(&p, e2).unwrap();
    service.dispatch_due(&p).unwrap();
    assert_eq!(egress.0.lock().unwrap().len(), 1);
}
