# apps/extension

Status: observer DEV — functional against the loopback API, not production
hardened. Per-site opt-in observation per ADR-0014: `content.js` extracts
typed `signals` + a metadata digest only (no text/DOM/field values), and
`background.js` owns the session token (chrome.storage.session, never
persisted) and posts `ObservedEvent`s to `http://127.0.0.1:8787`.

Local test: load unpacked (`chrome://extensions` → developer mode), run
`cargo run -p sovir-api`, open the popup on any page and press
"Observar este sitio". Events appear in the console under
`source screen-observer:ext` / grant `ext-observer-grant`.

Permissions: `storage`, `scripting`, `host_permissions` for the loopback
API only. Site access stays `optional_host_permissions` — Chrome prompts
per origin. No real personal data belongs in this folder.
