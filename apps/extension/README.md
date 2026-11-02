# apps/extension

Status: observer DEV — functional against the loopback API, tested at the
extractor level, not production hardened.

Architecture (ADR-0014):

- `extractor.js` — PURE function `sovirExtractSignals(doc, loc)`: DOM →
  typed signal enum set. No chrome APIs, jsdom-testable.
- `content.js` — thin bridge: calls the extractor, digests metadata
  (`sha256(host|signals)`), reports to the worker. Throttled MutationObserver
  for SPA/DOM churn.
- `background.js` — the only API client: dev-session mint, `BROWSER_EXTENSION`
  device register, `ext-observer-grant` consent, per-tab dedupe (60s),
  401→one reconnect, `paused` kill-switch, `lastError`/`lastObservation`
  surfaced to the popup, API URL from options. Emitted events honour the
  contract bound: ≤8 signals, highest-evidence first (`SIGNAL_PRIORITY`,
  mirrors `risk_signal_priority` in the domain).
- `vision.js` — PURE `sovirVisionScan(image, regions)`: bounded frame →
  typed signals (deterministic QR finder detection, v0 of ADR-0020).
  Learned labels are NOT_IMPLEMENTED — no model artifact exists.
- `popup.*` — API state, per-site opt-in, granted-origins list with
  per-site revoke, pause-all, last emission + last error.
- `options.*` — real API base URL setting (storage.local) plus the
  `sovir-vision-enabled` opt-in: when on, granted sites get a bounded
  `captureVisibleTab` frame scanned for QR finder signatures (enums +
  frame digest only — pixels never leave the worker). No extra manifest
  permission: the granted host permission already authorizes capture.

Observation persists via `chrome.scripting.registerContentScripts`
(`persistAcrossSessions`) — granted sites stay observed across reloads,
navigation and browser restarts until revoked here or server-side.

Local test: `cargo run -p sovir-api`, load unpacked
(`chrome://extensions` → developer mode), popup → "Observar este sitio".
Events land in the console under `screen-observer:ext`.

Tests: `pnpm --filter @sovir/extension test` (node:test + jsdom, 9 cases).
CI `extension-gate` runs tests + `node --check` + manifest validation.

No real personal data belongs in this folder.
