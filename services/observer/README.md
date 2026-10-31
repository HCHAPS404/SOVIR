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

Not in v0: pixel capture (Windows.Graphics.Capture) — it needs an
on-device extraction subsystem before pixel-derived signals may exist.

Run: `SOVIR_API_URL=http://127.0.0.1:8787 cargo run -p sovir-observer`
with `SOVIR_ENV=local` on the API so dev-session minting is enabled.
Config: see `.env.example` (POLL_MS, QUEUE_MAX, EXCLUDE, DISABLE, STORE_*).
