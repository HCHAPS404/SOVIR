# services/observer — desktop observer daemon (ADR-0014)

Status: v0 DEV, Windows-only. Observes the FOREGROUND WINDOW's metadata
(process name + window title) every 2s, derives typed `signals`, and posts
`ObservedEvent`s to the loopback API — source `screen-observer:windows`,
grant `win-observer-grant`, device platform `WINDOWS`.

Invariant: no title text, pixels or process internals leave the daemon —
the event carries `sha256(process|signals)` plus the signal enum set.

Not in v0: pixel capture (Windows.Graphics.Capture) — it needs an
on-device extraction subsystem before pixel-derived signals may exist.

Run: `SOVIR_API_URL=http://127.0.0.1:8787 cargo run -p sovir-observer`
with `SOVIR_ENV=local` on the API so dev-session minting is enabled.
