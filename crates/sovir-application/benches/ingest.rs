//! Latency benchmarks for the synthetic local path:
//! consent check + event validation + deterministic analysis + dedup,
//! private inference (reservation + weighted heuristic + settle + audit),
//! and the bounded investigation scan.
//! In-memory adapters only — NOT a production or durable-store measurement.
use criterion::{criterion_group, criterion_main, Criterion};
use sovir_adapters::{
    DeterministicRiskAnalyzer, HeuristicLocalInferenceGateway, InMemoryAuditLog,
    InMemoryBudgetLedger, InMemoryConsentRepository, InMemoryDeletionReceiptStore,
    InMemoryDeviceRegistry, InMemoryEventRepository, InMemoryIdempotencyStore,
    InMemoryInterventionSink, InMemorySessionStore, InMemoryThreatIntel, InMemoryWebhookRegistry,
    RecordingDeliveryChannel, SystemClock,
};
use sovir_application::{ServicePorts, SovirService};
use sovir_domain::{
    ConsentGrant, InferenceRequest, Modality, ObservedEvent, Principal, PrivacyMode, RiskSignal,
    Scope, SensitiveDataClass,
};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

fn service() -> SovirService {
    SovirService::new(
        Arc::new(SystemClock),
        ServicePorts {
            grants: Arc::new(InMemoryConsentRepository::default()),
            events: Arc::new(InMemoryEventRepository::default()),
            risk: Arc::new(DeterministicRiskAnalyzer::default()),
            sessions: Arc::new(InMemorySessionStore::default()),
            devices: Arc::new(InMemoryDeviceRegistry::default()),
            sink: Arc::new(InMemoryInterventionSink::default()),
            channel: Arc::new(RecordingDeliveryChannel::default()),
            webhooks: Arc::new(InMemoryWebhookRegistry::default()),
            receipts: Arc::new(InMemoryDeletionReceiptStore::default()),
            idem: Arc::new(InMemoryIdempotencyStore::default()),
            audit: Arc::new(InMemoryAuditLog::default()),
            inference: Some(Arc::new(HeuristicLocalInferenceGateway)),
            budget: Arc::new(InMemoryBudgetLedger::default()),
            reservations: Arc::new(sovir_adapters::InMemoryBudgetReservations::default()),
            intel: Arc::new(InMemoryThreatIntel::default()),
            investigations: Arc::new(sovir_adapters::InMemoryInvestigationStore::default()),
            identity: None,
            attester: None,
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
        tenant_id: String::new(),
    }
}

fn bench_ingest_synthetic_event(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let service = service();
    let p = principal();
    rt.block_on(service.grant(&p, grant())).unwrap();
    let mut seq: u64 = 0;
    c.bench_function("ingest_synthetic_event", |b| {
        b.iter(|| {
            seq += 1;
            rt.block_on(service.ingest(
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
                    signals: vec![RiskSignal::PaymentRequest, RiskSignal::IdentityUnverified],
                    principal_id: String::new(),
                    device_id: String::new(),
                    tenant_id: String::new(),
                },
            ))
            .unwrap()
        })
    });
}

/// Full private-inference round trip: scope check + durable reservation
/// (atomic cap check) + weighted heuristic verdict + usage settle + audit.
fn bench_assess_inference_private(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let service = service();
    let p = principal();
    let mut seq: u64 = 0;
    c.bench_function("assess_inference_private", |b| {
        b.iter(|| {
            seq += 1;
            rt.block_on(service.assess_with_inference(
                &p,
                InferenceRequest {
                    request_id: format!("bench-req-{seq}"),
                    signals: vec![
                        RiskSignal::CredentialRequest,
                        RiskSignal::IdentityUnverified,
                    ],
                    privacy: PrivacyMode::Private,
                    est_cost_micro_usd: 0,
                },
            ))
            .unwrap()
        })
    });
}

/// Bounded investigation over a preloaded event set: list_recent +
/// signal/class fact aggregation + sequence-hypothesis detection +
/// store insert + audit. Preload uses a disjoint principal so the
/// investigation store stays small.
fn bench_investigation_over_events(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let service = service();
    let p = principal();
    rt.block_on(service.grant(&p, grant())).unwrap();
    for i in 0..100u64 {
        rt.block_on(service.ingest(
            &p,
            ObservedEvent {
                event_id: format!("bench-pre-{i}"),
                source_id: "browser.synthetic".into(),
                observed_at_ms: now_ms(),
                modality: Modality::Url,
                content_digest: "sha256:synthetic-digest-only".into(),
                consent_grant_id: "bench-grant".into(),
                sensitive_data_class: SensitiveDataClass::Public,
                payload_ref: None,
                signals: vec![RiskSignal::PaymentRequest, RiskSignal::UrgentAction],
                principal_id: String::new(),
                device_id: String::new(),
                tenant_id: String::new(),
            },
        ))
        .unwrap();
    }
    c.bench_function("investigation_over_100_events", |b| {
        b.iter(|| {
            rt.block_on(service.run_investigation(&p, 3_600_000))
                .unwrap()
        })
    });
}

fn bench_ingest_after_revocation(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let service = service();
    let p = principal();
    rt.block_on(service.grant(&p, grant())).unwrap();
    rt.block_on(service.revoke(&p, "bench-grant")).unwrap();
    let mut seq: u64 = 0;
    c.bench_function("ingest_after_revocation", |b| {
        b.iter(|| {
            seq += 1;
            let _ = rt.block_on(service.ingest(
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
                    tenant_id: String::new(),
                },
            ));
        })
    });
}

criterion_group!(
    benches,
    bench_ingest_synthetic_event,
    bench_assess_inference_private,
    bench_investigation_over_events,
    bench_ingest_after_revocation
);
criterion_main!(benches);
