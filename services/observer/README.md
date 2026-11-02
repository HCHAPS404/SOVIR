# services/observer — desktop observer daemon (ADR-0014)

Status: v0 DEV, Windows-only. Observes the FOREGROUND WINDOW's metadata
(process name + window title) every 2s, derives typed `signals`, and posts
`ObservedEvent`s to the loopback API — source `screen-observer:windows`,
grant `win-observer-grant`, device platform `WINDOWS`.

Invariant: no title text, pixels or process internals leave the daemon —
the event carries `sha256(process|signals)` plus the signal enum set.

Resilience: bounded offline outbox — events are queued (FIFO, oldest-drop
beyond `SOVIR_OBSERVER_QUEUE_MAX`) and retried with exponential backoff
(1s→60s). With `SOVIR_OBSERVER_STORE_PATH` + `SOVIR_OBSERVER_STORE_KEY`
the queue is the encrypted `sovir-edge-store` SQLite file, durable across
restarts; unset = in-memory.

Heuristics: transparent title/process rules — browser+payment and
unknown-process+credential compose `IDENTITY_UNVERIFIED`; password
managers and credential prompts emit `sensitive_data_class=SENSITIVE`.
Honest pattern matching, never ML claims.

Pixel observation (opt-in, ADR-0015/0019/0020 — separate consent grant
`win-observer-vision-grant`):

- `SOVIR_EDGE_VISION=0` is the ADR-0020 reversion kill-switch: it
  overrides the opt-in and shuts the classifier off without touching
  user configuration (OCR/structural/DOM layers unaffected).
- `SOVIR_OBSERVER_VISION=1` enables the frame pipeline:
  `FrameSource` → structural pass + QR finder classifier → `IMAGE_REGION`
  event (enums + frame digest only; pixels are consumed in-process and
  discarded).
- `SOVIR_OBSERVER_VISION_SOURCE=wgc` (default) uses real
  Windows.Graphics.Capture of the foreground window — compile with
  `--features wgc`; the OS capture border stays visible. `=synthetic`
  runs the procedural QR dev frame on any machine (E2E without a screen).
- `SOVIR_OBSERVER_VISION_MS` sets the scan interval (default 5000,
  clamped 1000–60000).
- `SOVIR_OBSERVER_OCR=1` runs on-device OCR (Windows.Media.Ocr) ONLY on
  frames already flagged by the structural/vision pass — never a
  whole-screen text vacuum (ADR-0019 gate).
- Emitted events are bounded to `MAX_EVENT_SIGNALS` (8) keeping the
  domain's highest-evidence signals.

Not implemented: learned vision labels (`image_lure`,
`brand_impersonation`) — no model artifact exists;
`ml/model-cards/sovir-vision-qr-v0.md` documents what the deterministic
detector is and is not.

Run: `SOVIR_API_URL=http://127.0.0.1:8787 cargo run -p sovir-observer`
with `SOVIR_ENV=local` on the API so dev-session minting is enabled.
Config: see `.env.example` (POLL_MS, QUEUE_MAX, EXCLUDE, DISABLE, STORE_*).
