use sovir_adapters::{
    CompositeDeliveryChannel, DeterministicRiskAnalyzer, InMemoryAuditLog, InMemoryBudgetLedger,
    InMemoryConsentRepository, InMemoryDeletionReceiptStore, InMemoryDeviceRegistry,
    InMemoryEventRepository, InMemoryIdempotencyStore, InMemoryInterventionSink,
    InMemorySessionStore, InMemoryThreatIntel, InMemoryWebhookRegistry, RecordingDeliveryChannel,
    RecordingHttpEgress, WebhookChannel,
};
use sovir_application::{AppError, ServicePorts, SovirService};
use sovir_domain::{
    ConsentGrant, DeliveryState, DomainError, Intervention, InterventionKind, Modality,
    ObservedEvent, Platform, Principal, RiskLevel, RiskSignal, Scope, SensitiveDataClass,
};
use sovir_ports::{Clock, InterventionSink};
use std::sync::Arc;
struct FixedClock;
impl Clock for FixedClock {
    fn now_ms(&self) -> u64 {
        10_000
    }
}
fn ports() -> ServicePorts {
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
        inference: None,
        budget: Arc::new(InMemoryBudgetLedger::default()),
        reservations: Arc::new(sovir_adapters::InMemoryBudgetReservations::default()),
        intel: Arc::new(InMemoryThreatIntel::default()),
        investigations: Arc::new(sovir_adapters::InMemoryInvestigationStore::default()),
        identity: None,
        attester: None,
    }
}
fn service() -> SovirService {
    SovirService::new(Arc::new(FixedClock), ports())
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
        tenant_id: String::new(),
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
        tenant_id: String::new(),
    }
}
#[tokio::test]
async fn ingest_requires_consent_and_respects_revocation() {
    let service = service();
    let p = principal("p-1");
    assert!(matches!(
        service.ingest(&p, event()).await,
        Err(AppError::ConsentNotFound)
    ));
    service.grant(&p, grant()).await.unwrap();
    let accepted = service.ingest(&p, event()).await.unwrap();
    assert_eq!(accepted.assessment.risk_level, RiskLevel::High);
    assert!(!accepted.protected_action_executed);
    assert!(matches!(
        service.ingest(&p, event()).await,
        Err(AppError::Port(_))
    ));
    service.revoke(&p, "grant-1").await.unwrap();
    // A revoked grant ID cannot be quietly reactivated by submitting another grant.
    assert!(matches!(
        service.grant(&p, grant()).await,
        Err(AppError::Port(_))
    ));
    let mut next = event();
    next.event_id = "event-2".into();
    assert!(matches!(
        service.ingest(&p, next).await,
        Err(AppError::Domain(DomainError::ConsentRequired))
    ));
}
#[tokio::test]
async fn scope_mismatch_and_secret_fail_closed() {
    let service = service();
    let p = principal("p-1");
    service.grant(&p, grant()).await.unwrap();
    let mut wrong = event();
    wrong.source_id = "other-app".into();
    assert!(matches!(
        service.ingest(&p, wrong).await,
        Err(AppError::Domain(DomainError::ConsentRequired))
    ));
    let mut secret = event();
    secret.sensitive_data_class = SensitiveDataClass::Secret;
    assert!(matches!(
        service.ingest(&p, secret).await,
        Err(AppError::Domain(DomainError::SecretRejected))
    ));
}
#[tokio::test]
async fn consent_is_bound_to_principal_and_device() {
    let service = service();
    let owner = principal("owner");
    let other = principal("intruder");
    service.grant(&owner, grant()).await.unwrap();
    // Another principal cannot replay the grant id: binding mismatch fails closed.
    assert!(matches!(
        service.ingest(&other, event()).await,
        Err(AppError::Domain(DomainError::ConsentRequired))
    ));
    // Another principal cannot revoke the owner's grant either.
    assert!(matches!(
        service.revoke(&other, "grant-1").await,
        Err(AppError::Forbidden)
    ));
}
#[tokio::test]
async fn dev_session_lifecycle_and_device_revocation_fail_closed() {
    let service = service();
    let session = service
        .issue_dev_session("p-1", "dev-device", "dev")
        .await
        .unwrap();
    let p = service.authenticate(&session.token).await.unwrap();
    assert_eq!(p.principal_id, "p-1");
    service
        .register_device(&p, Some("dev-device"), Platform::Windows, "rig")
        .await
        .unwrap();
    service.grant(&p, grant()).await.unwrap();
    service.ingest(&p, event()).await.unwrap();
    // Revoking the device kills sessions AND bound grants.
    assert!(service.revoke_device(&p, "dev-device").await.unwrap());
    assert!(matches!(
        service.authenticate(&session.token).await,
        Err(AppError::Unauthorized) | Err(AppError::DeviceRevoked)
    ));
    // A fresh session for a revoked device is refused too.
    assert!(matches!(
        service.issue_dev_session("p-1", "dev-device", "dev").await,
        Err(AppError::DeviceRevoked)
    ));
}
#[tokio::test]
async fn warn_decision_enqueues_intervention_and_dispatch_delivers() {
    let service = service();
    let p = principal("p-1");
    service.grant(&p, grant()).await.unwrap();
    let decision = service.ingest(&p, event()).await.unwrap();
    assert_eq!(
        decision.assessment.decision,
        sovir_domain::DecisionKind::Warn
    );
    let pending = service.list_interventions(&p).await.unwrap();
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].kind, InterventionKind::WarnBanner);
    assert_eq!(pending[0].state, DeliveryState::Pending);
    assert_eq!(service.dispatch_due(&p).await.unwrap(), 1);
    let done = service.list_interventions(&p).await.unwrap();
    assert_eq!(done[0].state, DeliveryState::Delivered);
    assert_eq!(done[0].attempts, 1);
    assert_eq!(done[0].audit.len(), 1);
    // Nothing left due.
    assert_eq!(service.dispatch_due(&p).await.unwrap(), 0);
}
#[tokio::test]
async fn observe_decision_enqueues_nothing() {
    let service = service();
    let p = principal("p-1");
    service.grant(&p, grant()).await.unwrap();
    let mut e = event();
    e.signals = vec![];
    service.ingest(&p, e).await.unwrap();
    assert!(service.list_interventions(&p).await.unwrap().is_empty());
}
#[tokio::test]
async fn export_and_purge_principal_data() {
    let service = service();
    let p = principal("p-1");
    service
        .register_device(&p, Some("dev-device"), Platform::Linux, "rig")
        .await
        .unwrap();
    service.grant(&p, grant()).await.unwrap();
    service.ingest(&p, event()).await.unwrap();
    let export = service.export_data(&p).await.unwrap();
    assert_eq!(export.grants.len(), 1);
    assert_eq!(export.events.len(), 1);
    assert_eq!(export.devices.len(), 1);
    assert_eq!(export.interventions.len(), 1);
    // Another principal's data is not in the export.
    let other = principal("p-2");
    assert!(service.export_data(&other).await.unwrap().events.is_empty());
    // Purge removes stored data and revokes access.
    let report = service.purge_data(&p).await.unwrap();
    assert_eq!(report.events_deleted, 1);
    assert_eq!(report.grants_deleted, 1);
    assert_eq!(report.interventions_deleted, 1);
    assert_eq!(report.devices_revoked, 1);
    assert_eq!(report.labels_scrubbed, 1);
    assert!(!report.receipt_id.is_empty());
    let after = service.export_data(&p).await.unwrap();
    assert!(after.events.is_empty());
    // Erasure scrubs the user-supplied label but keeps the revoked tombstone.
    assert_eq!(after.devices[0].label, "[redacted]");
    assert!(!after.devices[0].is_active());
    // A durable deletion receipt survives the purge as audit metadata.
    assert_eq!(after.deletion_receipts.len(), 1);
    assert_eq!(after.deletion_receipts[0].receipt_id, report.receipt_id);
}
#[tokio::test]
async fn retention_deletes_old_events_keeps_recent_and_pending() {
    let service = service();
    let p = principal("p-1");
    service.grant(&p, grant()).await.unwrap();
    let mut old = event();
    old.event_id = "event-old".into();
    old.observed_at_ms = 9_000;
    service.ingest(&p, old).await.unwrap();
    service.ingest(&p, event()).await.unwrap(); // observed_at_ms = 10_000
                                                // FixedClock now = 10_000; retention 500ms -> cutoff 9_500.
    let report = service.enforce_retention(&p, 500).await.unwrap();
    assert_eq!(report.cutoff_ms, 9_500);
    assert_eq!(report.events_deleted, 1);
    let kept = service.export_data(&p).await.unwrap().events;
    assert_eq!(kept.len(), 1);
    assert_eq!(kept[0].event_id, "event-1");
}
#[tokio::test]
async fn retention_sink_drops_terminal_only() {
    let sink = InMemoryInterventionSink::default();
    let make = |id: &str, state: DeliveryState| Intervention {
        intervention_id: id.into(),
        event_id: "e".into(),
        principal_id: "p-1".into(),
        device_id: "d".into(),
        tenant_id: "dev".into(),
        kind: InterventionKind::WarnBanner,
        state,
        attempts: 1,
        created_at_ms: 9_000,
        next_attempt_at_ms: 0,
        last_error: None,
        audit: vec![],
    };
    sink.enqueue(make("done", DeliveryState::Delivered))
        .await
        .unwrap();
    sink.enqueue(make("pending", DeliveryState::Pending))
        .await
        .unwrap();
    assert_eq!(
        sink.delete_terminal_older_than("dev", "p-1", 9_500)
            .await
            .unwrap(),
        1
    );
    let left = sink.list("dev", "p-1").await.unwrap();
    assert_eq!(left.len(), 1);
    assert_eq!(left[0].intervention_id, "pending");
}
#[tokio::test]
async fn revoking_device_expires_its_pending_interventions() {
    let service = service();
    let p = principal("p-1");
    service
        .register_device(&p, Some("dev-device"), Platform::Android, "phone")
        .await
        .unwrap();
    service.grant(&p, grant()).await.unwrap();
    service.ingest(&p, event()).await.unwrap(); // warn -> pending intervention
    assert_eq!(
        service.list_interventions(&p).await.unwrap()[0].state,
        DeliveryState::Pending
    );
    service.revoke_device(&p, "dev-device").await.unwrap();
    let after = service.list_interventions(&p).await.unwrap();
    assert_eq!(after[0].state, DeliveryState::Expired);
    assert_eq!(after[0].audit.last().unwrap().detail, "device revoked");
}
#[tokio::test]
async fn webhook_delivery_signs_and_honors_allowlist_and_revocation() {
    let registry = Arc::new(InMemoryWebhookRegistry::default());
    let egress = Arc::new(RecordingHttpEgress::default());
    let service = SovirService::new(
        Arc::new(FixedClock),
        ServicePorts {
            grants: Arc::new(InMemoryConsentRepository::default()),
            events: Arc::new(InMemoryEventRepository::default()),
            risk: Arc::new(DeterministicRiskAnalyzer::default()),
            sessions: Arc::new(InMemorySessionStore::default()),
            devices: Arc::new(InMemoryDeviceRegistry::default()),
            sink: Arc::new(InMemoryInterventionSink::default()),
            channel: Arc::new(CompositeDeliveryChannel(vec![
                Arc::new(RecordingDeliveryChannel::default()),
                Arc::new(WebhookChannel::new(registry.clone(), egress.clone())),
            ])),
            webhooks: registry,
            receipts: Arc::new(InMemoryDeletionReceiptStore::default()),
            idem: Arc::new(InMemoryIdempotencyStore::default()),
            audit: Arc::new(InMemoryAuditLog::default()),
            inference: None,
            budget: Arc::new(InMemoryBudgetLedger::default()),
            reservations: Arc::new(sovir_adapters::InMemoryBudgetReservations::default()),
            intel: Arc::new(InMemoryThreatIntel::default()),
            investigations: Arc::new(sovir_adapters::InMemoryInvestigationStore::default()),
            identity: None,
            attester: None,
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
        .await
        .is_err());
    let ep = service
        .register_webhook(
            &p,
            "http://127.0.0.1:9999/hook",
            vec![InterventionKind::WarnBanner],
            &allow,
        )
        .await
        .unwrap();
    service.grant(&p, grant()).await.unwrap();
    service.ingest(&p, event()).await.unwrap(); // warn -> intervention
    assert_eq!(service.dispatch_due(&p).await.unwrap(), 1);
    {
        let sent = egress.0.lock().unwrap();
        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0].url, "http://127.0.0.1:9999/hook");
        let expected = format!("sha256={}", WebhookChannel::sign(&ep.secret, &sent[0].body));
        assert!(sent[0]
            .headers
            .iter()
            .any(|(k, v)| k == "x-sovir-signature" && *v == expected));
    }
    // Revoked endpoint receives nothing on the next intervention.
    service.revoke_webhook(&p, &ep.endpoint_id).await.unwrap();
    service.revoke(&p, "grant-1").await.unwrap();
    service
        .grant(&p, {
            let mut g = grant();
            g.grant_id = "grant-2".into();
            g
        })
        .await
        .unwrap();
    let mut e2 = event();
    e2.event_id = "event-2".into();
    e2.consent_grant_id = "grant-2".into();
    service.ingest(&p, e2).await.unwrap();
    service.dispatch_due(&p).await.unwrap();
    assert_eq!(egress.0.lock().unwrap().len(), 1);
}
#[tokio::test]
async fn tenant_isolation_blocks_cross_tenant_access() {
    let service = service();
    // Same principal id in two different tenants.
    let mut pa = principal("shared-id");
    pa.tenant_id = "tenant-a".into();
    let mut pb = principal("shared-id");
    pb.tenant_id = "tenant-b".into();
    // Register devices in both tenants (same device id is fine — keys are
    // (tenant, principal, device)).
    service
        .register_device(&pa, Some("dev-1"), Platform::Linux, "rig-a")
        .await
        .unwrap();
    service
        .register_device(&pb, Some("dev-1"), Platform::Linux, "rig-b")
        .await
        .unwrap();
    service.grant(&pa, grant()).await.unwrap();
    // Tenant B cannot replay tenant A's grant id: the sealed tenant binding
    // differs, so consent validation fails closed.
    assert!(matches!(
        service.ingest(&pb, event()).await,
        Err(AppError::Domain(DomainError::ConsentRequired)) | Err(AppError::ConsentNotFound)
    ));
    // Data listings are tenant-scoped: tenant B sees nothing.
    assert!(service.export_data(&pb).await.unwrap().grants.is_empty());
    // Devices are tenant-scoped too.
    let devs_b = service.list_devices(&pb).await.unwrap();
    assert_eq!(devs_b.len(), 1);
    assert_eq!(devs_b[0].label, "rig-b");
}
#[tokio::test]
async fn evidence_window_escalates_hook_then_payment() {
    let service = service();
    let p = principal("p-seq");
    let now = 10_000u64; // FixedClock
    let mut g = grant();
    g.grant_id = "grant-seq".into();
    g.expires_at_ms = now + 3_600_000;
    service.grant(&p, g).await.unwrap();
    // First event: a manipulation cue only — Review at most.
    let mut hook = event();
    hook.event_id = "hook".into();
    hook.consent_grant_id = "grant-seq".into();
    hook.observed_at_ms = now - 100;
    hook.signals = vec![RiskSignal::UrgentAction];
    let d1 = service.ingest(&p, hook).await.unwrap();
    assert_eq!(d1.assessment.decision, sovir_domain::DecisionKind::Observe);
    assert!(d1.sequence_findings.is_empty());
    // Second event: payment request alone -> Review; with the hook in the
    // window the sequence escalates it to Warn with findings attached.
    let mut pay = event();
    pay.event_id = "pay".into();
    pay.consent_grant_id = "grant-seq".into();
    pay.observed_at_ms = now;
    pay.signals = vec![RiskSignal::PaymentRequest];
    let d2 = service.ingest(&p, pay).await.unwrap();
    assert_eq!(d2.assessment.decision, sovir_domain::DecisionKind::Warn);
    assert!(d2
        .sequence_findings
        .iter()
        .any(|f| f.pattern == sovir_domain::SequencePattern::HookThenPayment));
    // An intervention was enqueued because the escalated decision is Warn.
    let items = service.list_interventions(&p).await.unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].kind, sovir_domain::InterventionKind::WarnBanner);
}

// ---- B4: inference budget + privacy modes ------------------------------

use sovir_domain::{InferenceRequest, InferenceVerdict, IntelIndicator, PrivacyMode};
use sovir_ports::{InferenceGateway, PortError};

struct StubGateway {
    serve_standard: bool,
}
#[async_trait::async_trait]
impl InferenceGateway for StubGateway {
    async fn assess(&self, req: &InferenceRequest) -> Result<InferenceVerdict, PortError> {
        Ok(InferenceVerdict {
            request_id: req.request_id.clone(),
            model_id: "stub-local".into(),
            hypotheses: vec!["possible-urgency".into()],
            confidence_bp: 6_000,
            provenance: "synthetic-test".into(),
        })
    }
    fn serves(&self, mode: PrivacyMode) -> bool {
        mode == PrivacyMode::Private || (self.serve_standard && mode == PrivacyMode::Standard)
    }
}

fn infer_req(cost: u64) -> InferenceRequest {
    // Each logical request carries a fresh id — the idempotency key.
    // Replaying the same id reuses its reservation instead of charging
    // twice (B21), which is what makes billing idempotent.
    static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    InferenceRequest {
        request_id: format!(
            "req-{}",
            N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ),
        signals: vec![RiskSignal::UrgentAction],
        privacy: PrivacyMode::Private,
        est_cost_micro_usd: cost,
    }
}

#[tokio::test]
async fn inference_refused_without_gateway() {
    let s = service();
    let err = s
        .assess_with_inference(&principal("p"), infer_req(1))
        .await
        .unwrap_err();
    assert!(matches!(err, AppError::ProviderUnavailable));
}

#[tokio::test]
async fn inference_budget_cap_blocks_spend() {
    let mut p = ports();
    p.inference = Some(Arc::new(StubGateway {
        serve_standard: true,
    }));
    p.reservations = Arc::new(sovir_adapters::InMemoryBudgetReservations::with_cap(100));
    let s = SovirService::new(Arc::new(FixedClock), p);
    let pr = principal("p");
    // request of 60 fits under cap 100
    s.assess_with_inference(&pr, infer_req(60)).await.unwrap();
    // 60 spent; another 60 would exceed cap → hard stop before calling
    let err = s
        .assess_with_inference(&pr, infer_req(60))
        .await
        .unwrap_err();
    assert!(matches!(err, AppError::BudgetExceeded));
    // a smaller request still fits
    s.assess_with_inference(&pr, infer_req(40)).await.unwrap();
}

#[tokio::test]
async fn inference_zero_cap_refuses_anything() {
    let mut p = ports();
    p.inference = Some(Arc::new(StubGateway {
        serve_standard: true,
    }));
    let s = SovirService::new(Arc::new(FixedClock), p); // default cap 0
    let err = s
        .assess_with_inference(&principal("p"), infer_req(1))
        .await
        .unwrap_err();
    assert!(matches!(err, AppError::BudgetExceeded));
}

#[tokio::test]
async fn inference_unserved_privacy_mode_refused() {
    let mut p = ports();
    p.inference = Some(Arc::new(StubGateway {
        serve_standard: false,
    })); // private only
    p.reservations = Arc::new(sovir_adapters::InMemoryBudgetReservations::with_cap(1_000));
    let s = SovirService::new(Arc::new(FixedClock), p);
    let mut req = infer_req(1);
    req.privacy = PrivacyMode::Standard;
    let err = s
        .assess_with_inference(&principal("p"), req)
        .await
        .unwrap_err();
    assert!(matches!(err, AppError::ProviderUnavailable));
}

#[tokio::test]
async fn inference_spend_scoped_per_tenant() {
    let mut p = ports();
    p.inference = Some(Arc::new(StubGateway {
        serve_standard: true,
    }));
    p.reservations = Arc::new(sovir_adapters::InMemoryBudgetReservations::with_cap(100));
    let s = SovirService::new(Arc::new(FixedClock), p);
    let mut other_tenant = principal("p2");
    other_tenant.tenant_id = "tenant-b".into();
    s.assess_with_inference(&other_tenant, infer_req(90))
        .await
        .unwrap();
    // tenant "dev" unaffected by tenant-b spend
    s.assess_with_inference(&principal("p"), infer_req(90))
        .await
        .unwrap();
}

/// B21 race test: two simultaneous assess calls, distinct request_ids,
/// cap only fits one — the atomic reserve must admit exactly one. The
/// in-memory adapter takes the whole check+insert under one write-lock,
/// so this exercises the same serialization contract as the PG FOR UPDATE.
#[tokio::test]
async fn inference_concurrent_reserves_do_not_exceed_cap() {
    let mut p = ports();
    p.inference = Some(Arc::new(StubGateway {
        serve_standard: true,
    }));
    p.reservations = Arc::new(sovir_adapters::InMemoryBudgetReservations::with_cap(100));
    let s = std::sync::Arc::new(SovirService::new(Arc::new(FixedClock), p));
    let pr = principal("p");
    let (s1, s2, pr1, pr2) = (s.clone(), s.clone(), pr.clone(), pr.clone());
    let (r1, r2) = tokio::join!(
        s1.assess_with_inference(&pr1, infer_req(60)),
        s2.assess_with_inference(&pr2, infer_req(60)),
    );
    let ok_count = [&r1, &r2].iter().filter(|r| r.is_ok()).count();
    let exceeded = [&r1, &r2]
        .iter()
        .filter(|r| matches!(r, Err(AppError::BudgetExceeded)))
        .count();
    assert_eq!(ok_count, 1, "exactly one request fits the cap");
    assert_eq!(exceeded, 1, "the other must fail closed as BudgetExceeded");
}

/// Orphan-reservation sweep: a pending row past its TTL is refunded so a
/// crashed process cannot hold the tenant cap forever; settled rows are
/// untouched.
#[tokio::test]
async fn reservation_sweep_refunds_orphans_releases_cap() {
    struct NowClock;
    impl Clock for NowClock {
        fn now_ms(&self) -> u64 {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64
        }
    }
    let mut p = ports();
    p.inference = Some(Arc::new(StubGateway {
        serve_standard: true,
    }));
    let reservations: Arc<dyn sovir_ports::BudgetReservations> =
        Arc::new(sovir_adapters::InMemoryBudgetReservations::with_cap(100));
    p.reservations = reservations.clone();
    let s = SovirService::new(Arc::new(NowClock), p);
    // An orphan = what a crash between reserve and settle leaves behind.
    match reservations.reserve("dev", "orphan-1", 90).await.unwrap() {
        sovir_ports::ReserveOutcome::Reserved(_) => {}
        _ => panic!("reserve should succeed"),
    }
    // Second reserve under cap: 90 pending + 90 est > 100 → refused, the
    // orphan is holding cap.
    assert!(matches!(
        reservations.reserve("dev", "other-1", 90).await.unwrap(),
        sovir_ports::ReserveOutcome::BudgetExceeded
    ));
    // ttl 0 ⇒ everything pending is "expired" and gets refunded.
    assert_eq!(s.refund_expired_reservations(0).await.unwrap(), 1);
    // Cap released: a fresh reserve now fits.
    assert!(matches!(
        reservations.reserve("dev", "other-2", 90).await.unwrap(),
        sovir_ports::ReserveOutcome::Reserved(_)
    ));
    // That fresh pending row is itself swept if left orphan (ttl 0).
    assert_eq!(s.refund_expired_reservations(0).await.unwrap(), 1);
    // A settled reservation is terminal and never swept.
    match reservations.reserve("dev", "other-3", 90).await.unwrap() {
        sovir_ports::ReserveOutcome::Reserved(_) => {}
        _ => panic!("cap must be free again"),
    }
    reservations
        .settle(
            "dev",
            "other-3",
            90,
            sovir_domain::InferenceUsage {
                provider: "test".into(),
                model: "m".into(),
                tokens_est: 0,
                tokens_actual: None,
                cache_hit: false,
                redaction_tier: "standard".into(),
            },
        )
        .await
        .unwrap();
    assert_eq!(s.refund_expired_reservations(0).await.unwrap(), 0);
}

/// Idempotent billing: replaying the same request_id reuses the settled
/// reservation instead of charging twice.
#[tokio::test]
async fn inference_same_request_id_does_not_double_charge() {
    let mut p = ports();
    p.inference = Some(Arc::new(StubGateway {
        serve_standard: true,
    }));
    p.reservations = Arc::new(sovir_adapters::InMemoryBudgetReservations::with_cap(100));
    let s = SovirService::new(Arc::new(FixedClock), p);
    let pr = principal("p");
    let mut req = infer_req(60);
    req.request_id = "req-fixed".into();
    s.assess_with_inference(&pr, req.clone()).await.unwrap();
    // Same request_id again: served (verdict regenerated), not re-charged.
    s.assess_with_inference(&pr, req).await.unwrap();
    // A genuinely new 60μ request now exceeds the 100 cap — proving the
    // replay above did not consume budget.
    let err = s
        .assess_with_inference(&pr, infer_req(60))
        .await
        .unwrap_err();
    assert!(matches!(err, AppError::BudgetExceeded));
}

// ---- B5: threat-intel provenance ---------------------------------------

#[tokio::test]
async fn intel_pull_drops_unverified_and_scopes_tenant() {
    let intel = Arc::new(InMemoryThreatIntel::default());
    intel.seed(vec![
        IntelIndicator {
            indicator_id: "i-ok".into(),
            tenant_id: String::new(),
            kind: "domain".into(),
            value: "evil-example.com".into(),
            confidence_bp: 9_000,
            provenance: "fixture:v1".into(),
            at_ms: 0,
        },
        IntelIndicator {
            indicator_id: "i-no-prov".into(),
            tenant_id: String::new(),
            kind: "domain".into(),
            value: "unverified.example.com".into(),
            confidence_bp: 9_000,
            provenance: String::new(),
            at_ms: 0,
        },
    ]);
    let mut p = ports();
    p.intel = intel.clone();
    let s = SovirService::new(Arc::new(FixedClock), p);
    let pr = principal("p");
    let kept = s.pull_intel(&pr).await.unwrap();
    assert_eq!(kept, 1);
    let items = s.list_intel(&pr).await.unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].indicator_id, "i-ok");
    assert_eq!(items[0].tenant_id, "dev"); // server-stamped
    assert_eq!(items[0].at_ms, 10_000); // clock-stamped
}

#[tokio::test]
async fn intel_list_is_tenant_scoped() {
    let s = service();
    let mut pb = principal("pb");
    pb.tenant_id = "tenant-b".into();
    // empty for both tenants with no feed
    assert_eq!(s.pull_intel(&pb).await.unwrap(), 0);
    assert!(s.list_intel(&pb).await.unwrap().is_empty());
}

/// Scheduled sweep path (no principal): indicators keep their declared
/// tenant or fall back to the configured default; unverified items are
/// still dropped; repeated pulls over the same ids are idempotent.
#[tokio::test]
async fn intel_sweep_global_keeps_declared_tenant_and_is_idempotent() {
    let intel = Arc::new(InMemoryThreatIntel::default());
    intel.seed(vec![
        IntelIndicator {
            indicator_id: "i-tenant-b".into(),
            tenant_id: "tenant-b".into(),
            kind: "domain".into(),
            value: "b-specific.example.com".into(),
            confidence_bp: 8_000,
            provenance: "fixture:v1".into(),
            at_ms: 0,
        },
        IntelIndicator {
            indicator_id: "i-default".into(),
            tenant_id: String::new(),
            kind: "domain".into(),
            value: "global-threat.example.com".into(),
            confidence_bp: 9_000,
            provenance: "fixture:v1".into(),
            at_ms: 0,
        },
        IntelIndicator {
            indicator_id: "i-bad".into(),
            tenant_id: String::new(),
            kind: "domain".into(),
            value: "no-provenance.example.com".into(),
            confidence_bp: 1,
            provenance: String::new(),
            at_ms: 0,
        },
    ]);
    let mut p = ports();
    p.intel = intel;
    let s = SovirService::new(Arc::new(FixedClock), p);
    let (kept, dropped) = s.pull_intel_global("dev").await.unwrap();
    assert_eq!((kept, dropped), (2, 1));
    // i-tenant-b lands under its declared tenant, not the sweep default.
    let mut pb = principal("pb");
    pb.tenant_id = "tenant-b".into();
    let b_items = s.list_intel(&pb).await.unwrap();
    assert_eq!(b_items.len(), 1);
    assert_eq!(b_items[0].indicator_id, "i-tenant-b");
    // i-default lands under the sweep default tenant.
    let dev_items = s.list_intel(&principal("p")).await.unwrap();
    assert_eq!(dev_items.len(), 1);
    assert_eq!(dev_items[0].indicator_id, "i-default");
    assert_eq!(dev_items[0].at_ms, 10_000);
}

// ---- B5: deterministic local investigations -----------------------------

#[tokio::test]
async fn investigation_reports_facts_and_hypotheses_separately() {
    let s = service();
    let p = principal("p");
    s.grant(&p, grant()).await.unwrap();
    // Identity-unverified at 9_000, credential request at 10_000 →
    // IdentityThenCredential hypothesis inside the window.
    let mut e1 = event();
    e1.event_id = "ev-identity".into();
    e1.observed_at_ms = 9_000;
    e1.signals = vec![RiskSignal::IdentityUnverified];
    let mut e2 = event();
    e2.event_id = "ev-credential".into();
    e2.observed_at_ms = 10_000;
    e2.signals = vec![RiskSignal::CredentialRequest];
    e2.sensitive_data_class = SensitiveDataClass::Sensitive;
    s.ingest(&p, e1).await.unwrap();
    s.ingest(&p, e2).await.unwrap();

    let inv = s.run_investigation(&p, 60_000).await.unwrap();
    assert_eq!(inv.events_examined, 2);
    assert_eq!(inv.tenant_id, "dev");
    // Facts prove counts: 1 identity signal, 1 credential signal, 1
    // SENSITIVE event, 1 PUBLIC event.
    let fact = |kind, subject: &str| {
        inv.facts
            .iter()
            .find(|f| f.kind == kind && f.subject == subject)
            .map(|f| f.count)
    };
    use sovir_domain::InvestigationFactKind as FK;
    assert_eq!(fact(FK::SignalObserved, "IDENTITY_UNVERIFIED"), Some(1));
    assert_eq!(fact(FK::SignalObserved, "CREDENTIAL_REQUEST"), Some(1));
    assert_eq!(fact(FK::DataClassObserved, "SENSITIVE"), Some(1));
    assert_eq!(fact(FK::DataClassObserved, "PUBLIC"), Some(1));
    // Hypothesis (not fact): the escalation pattern is a hint.
    assert!(inv
        .hypotheses
        .iter()
        .any(|h| h.pattern == sovir_domain::SequencePattern::IdentityThenCredential));
    // Persisted and listed newest-first for the calling principal only.
    let listed = s.list_investigations(&p).await.unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].investigation_id, inv.investigation_id);
    // Another principal in the same tenant sees nothing.
    let other = principal("other");
    assert!(s.list_investigations(&other).await.unwrap().is_empty());
}

#[tokio::test]
async fn investigation_requires_events_scope_and_clamps_window() {
    let s = service();
    let mut no_scope = principal("p");
    no_scope.scopes = vec![Scope::DevicesWrite];
    assert!(matches!(
        s.run_investigation(&no_scope, 60_000).await,
        Err(AppError::Forbidden)
    ));
    // Window larger than the bound is clamped, not rejected.
    let p = principal("p");
    s.grant(&p, grant()).await.unwrap();
    s.ingest(&p, event()).await.unwrap();
    let inv = s.run_investigation(&p, u64::MAX).await.unwrap();
    assert_eq!(inv.window_ms, sovir_domain::MAX_INVESTIGATION_WINDOW_MS);
    assert_eq!(inv.events_examined, 1);
}
