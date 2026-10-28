//! Baseline latency benchmark for the synthetic ingest path:
//! consent check + event validation + deterministic analysis + dedup.
//! In-memory adapters only — NOT a production or durable-store measurement.
use criterion::{criterion_group, criterion_main, Criterion};
use sovir_adapters::{
    DeterministicRiskAnalyzer, InMemoryConsentRepository, InMemoryDeviceRegistry,
    InMemoryEventRepository, InMemoryInterventionSink, InMemorySessionStore,
    RecordingDeliveryChannel, SystemClock,
};
use sovir_application::{ServicePorts, SovirService};
use sovir_domain::{
    ConsentGrant, Modality, ObservedEvent, Principal, RiskSignal, Scope, SensitiveDataClass,
};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

fn service() -> SovirService {
    SovirService::new(
        Arc::new(SystemClock),
        ServicePorts {
            grants: Arc::new(InMemoryConsentRepository::default()),
            events: Arc::new(InMemoryEventRepository::default()),
            risk: Arc::new(DeterministicRiskAnalyzer),
            sessions: Arc::new(InMemorySessionStore::default()),
            devices: Arc::new(InMemoryDeviceRegistry::default()),
            sink: Arc::new(InMemoryInterventionSink::default()),
            channel: Arc::new(RecordingDeliveryChannel::default()),
        },
    )
}

fn principal() -> Principal {
    Principal {
        principal_id: "bench-p".into(),
        tenant_id: "dev".into(),
        device_id: "bench-device".into(),
        session_id: "bench-session".into(),
        scopes: vec![
            Scope::ConsentWrite,
            Scope::EventsWrite,
            Scope::DevicesWrite,
            Scope::SessionsWrite,
        ],
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

fn grant() -> ConsentGrant {
    ConsentGrant {
        grant_id: "bench-grant".into(),
        source_id: "browser.synthetic".into(),
        expires_at_ms: now_ms() + 3_600_000,
        revoked: false,
        principal_id: String::new(),
        device_id: String::new(),
    }
}

fn bench_ingest_synthetic_event(c: &mut Criterion) {
    let service = service();
    let p = principal();
    service.grant(&p, grant()).unwrap();
    let mut seq: u64 = 0;
    c.bench_function("ingest_synthetic_event", |b| {
        b.iter(|| {
            seq += 1;
            service
                .ingest(
                    &p,
                    ObservedEvent {
                        event_id: format!("bench-event-{seq}"),
                        source_id: "browser.synthetic".into(),
                        observed_at_ms: now_ms(),
                        modality: Modality::Url,
                        content_digest: "sha256:synthetic-digest-only".into(),
                        consent_grant_id: "bench-grant".into(),
                        sensitive_data_class: SensitiveDataClass::Public,
                        payload_ref: None,
                        signals: vec![
                            RiskSignal::PaymentRequest,
                            RiskSignal::IdentityUnverified,
                        ],
                        principal_id: String::new(),
                        device_id: String::new(),
                    },
                )
                .unwrap()
        })
    });
}

fn bench_ingest_after_revocation(c: &mut Criterion) {
    let service = service();
    let p = principal();
    service.grant(&p, grant()).unwrap();
    service.revoke(&p, "bench-grant").unwrap();
    let mut seq: u64 = 0;
    c.bench_function("ingest_after_revocation", |b| {
        b.iter(|| {
            seq += 1;
            let _ = service.ingest(
                &p,
                ObservedEvent {
                    event_id: format!("bench-revoked-{seq}"),
                    source_id: "browser.synthetic".into(),
                    observed_at_ms: now_ms(),
                    modality: Modality::Url,
                    content_digest: "sha256:synthetic-digest-only".into(),
                    consent_grant_id: "bench-grant".into(),
                    sensitive_data_class: SensitiveDataClass::Public,
                    payload_ref: None,
                    signals: vec![],
                    principal_id: String::new(),
                    device_id: String::new(),
                },
            );
        })
    });
}

criterion_group!(benches, bench_ingest_synthetic_event, bench_ingest_after_revocation);
criterion_main!(benches);
