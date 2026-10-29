# ADR-0014: Screen observer — consent model and sensor seam (proposal)

## Status

Proposed — pending maintainer signoff. The *receiving pipeline* (consent →
device → typed event → policy → audit) is implemented and exercised today.
The *sensors* (screen capture, accessibility trees) are NOT implemented;
native toolchains are deferred and per-platform capture requires this ADR,
a privacy matrix, and human review per invariant 8.

## Context

SOVIR's protection model needs on-screen evidence: a payment screen that
appears right after an urgent notification, a consent dialog with a dark
pattern, a credential form on an unverified page. The domain already models
the observer's outputs:

- `Modality::UI_TREE` — an accessibility-tree observation (no pixels)
- `Modality::IMAGE_REGION` — a bounded screen region
- `Modality::TEXT` / `URL` / `NOTIFICATION` — lighter observation surfaces
- `SensitiveDataClass::{Public,Personal,Sensitive,Secret}` — per-event
  privacy class
- `ConsentGrant.source_id` — *which source may observe*, the "in which
  apps is this valid" field, server-bound to `principal_id` + `device_id`
- `ObservedEvent.signals` — the sensor emits **typed signals**, never raw
  content; `content_digest` is a hash, so the pipeline is content-free by
  construction

A screen observer is therefore "just" another event source — but it is the
most sensitive one: it sees everything on screen. The rules for *where*
observation is valid, *what* leaves the device, and *who* can turn it on
must be specified before any sensor ships.

## Decision

1. **The sensor is a client-side extractor, not a forwarder.** An
   observer may never upload frames, trees, or text. It runs on-device
   extraction and emits `ObservedEvent` with `content_digest` (hash) +
   typed `signals`. Raw pixels/DOM/acc-trees never enter the API — this
   is enforced structurally by the event contract, not by policy wording.

2. **Consent is per-source, per-class, and revocable.** A grant binds
   `source_id` (e.g. `screen-observer:windows`) to a device and principal.
   Observing `Sensitive`/`Secret` content requires a grant whose declared
   scope covers it; the API rejects events whose grant does not cover the
   event's `sensitive_data_class` (enforcement point: ingest validation —
   verify against `ConsentGrant` before persisting).

3. **Per-platform activation matrix** (the "where is it valid" question):

   | Platform | Mechanism | Consent UX | Status |
   |---|---|---|---|
   | Android | AccessibilityService → `UI_TREE`; MediaProjection → `IMAGE_REGION` | OS dialog + per-app toggle | NOT_IMPLEMENTED (SDK deferred) |
   | iOS | ScreenCaptureKit (limited); no acc-tree API | System picker per session | NOT_IMPLEMENTED (macOS/Xcode deferred) |
   | Windows | Windows.Graphics.Capture → `IMAGE_REGION` | System consent + per-window | NOT_IMPLEMENTED |
   | macOS | ScreenCaptureKit → `IMAGE_REGION` | TCC screen-recording permission | NOT_IMPLEMENTED |
   | Linux | PipeWire/XDG portal ScreenCast | Portal dialog, compositor-dependent | NOT_IMPLEMENTED |
   | Browser ext. | Tab DOM/activeTab → `TEXT`/`URL` | Extension permissions | NOT_IMPLEMENTED |

   Observation without the OS-level grant is impossible by construction —
   the API-side grant gates *upload*, never *capture*.

4. **The console never observes.** The web console is a control surface
   (devices, grants, incidents, audit), not a sensor. No browser-side
   observation feature is planned; `getDisplayMedia`-style APIs are out of
   scope for this app.

5. **Audit is mandatory.** Every observer grant, event, and revocation
   already produces audit tombstones (`consent_granted`, `event_ingested`,
   `device_registered`). An observer without audit is a bug, not a choice.

## Consequences

- The lab's synthetic `UI_TREE` flow exercises the exact contract a real
  sensor will use — no backend changes needed when sensors arrive.
- What remains to implement is *native and gated*: OS permission UX,
  on-device signal extraction, and the per-app activation UI — each under
  its own ticket with `platform-permission-review`.
- `ConsentGrant` may need a declared `data_classes` field if per-class
  grants turn out necessary; today the grant is source-wide and the class
  rides on the event.
