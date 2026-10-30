//! SOVIR desktop observer (Windows v0) — ADR-0014 sensor seam.
//!
//! Watches the FOREGROUND WINDOW'S METADATA — process name + title —
//! derives typed `signals`, and posts `ObservedEvent`s to the loopback
//! API. Per the observer invariant, no window text, titles or pixels
//! ever leave the process: the event carries a sha256 digest and the
//! signal enum set only.
//!
//! Scope of v0: window METADATA (TEXT modality), not pixels. Frame
//! capture via Windows.Graphics.Capture is a separate ticket — it needs
//! an on-device extraction subsystem before any pixel-derived signal
//! may be emitted.
//!
//! Resilience: when the API is unreachable events are queued in-process
//! (bounded, FIFO) and retried with exponential backoff — nothing is
//! silently dropped, nothing blocks the poll loop forever.
//!
//! Config (env): SOVIR_API_URL, SOVIR_OBSERVER_POLL_MS,
//! SOVIR_OBSERVER_QUEUE_MAX, SOVIR_OBSERVER_EXCLUDE (comma-separated
//! process names never observed), SOVIR_OBSERVER_DISABLE=1 (kill switch).
//! Durable outbox (optional): SOVIR_OBSERVER_STORE_PATH +
//! SOVIR_OBSERVER_STORE_KEY enable the encrypted SQLite queue
//! (sovir-edge-store) so queued events survive restarts. Unset = in-memory.

use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::VecDeque;
use std::env;
use std::time::Duration;
use uuid::Uuid;

const SOURCE: &str = "screen-observer:windows";
const GRANT: &str = "win-observer-grant";
const DEVICE: &str = "win-desktop";

fn api_base() -> String {
    env::var("SOVIR_API_URL").unwrap_or_else(|_| "http://127.0.0.1:8787".into())
}
fn poll_ms() -> u64 {
    env::var("SOVIR_OBSERVER_POLL_MS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(2_000)
        .clamp(250, 60_000)
}
fn queue_max() -> usize {
    env::var("SOVIR_OBSERVER_QUEUE_MAX")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(64)
        .clamp(1, 4_096)
}
fn excluded_processes() -> Vec<String> {
    env::var("SOVIR_OBSERVER_EXCLUDE")
        .unwrap_or_default()
        .split(',')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect()
}
fn disabled() -> bool {
    env::var("SOVIR_OBSERVER_DISABLE").unwrap_or_default() == "1"
}

/// Bounded FIFO push: beyond `max` the OLDEST queued event is dropped so
/// a long outage can never grow memory unbounded. Returns the dropped
/// event when one was evicted.
fn queue_push_bounded(
    queue: &mut VecDeque<serde_json::Value>,
    max: usize,
    body: serde_json::Value,
) -> Option<serde_json::Value> {
    let dropped = (queue.len() >= max).then(|| queue.pop_front()).flatten();
    queue.push_back(body);
    dropped
}

fn process_excluded(process: &str, excluded: &[String]) -> bool {
    let p = process.to_lowercase();
    excluded.contains(&p)
}

/// Offline event outbox. Default: bounded in-memory FIFO. When
/// SOVIR_OBSERVER_STORE_PATH + SOVIR_OBSERVER_STORE_KEY are set, events
/// persist encrypted at rest (sovir-edge-store) and survive restarts —
/// the bound is still enforced (oldest-drop beyond QUEUE_MAX).
enum Outbox {
    Memory(VecDeque<serde_json::Value>),
    Store(sovir_edge_store::EncryptedEdgeQueue),
}
impl Outbox {
    fn open() -> Self {
        let (path, key) = (
            env::var("SOVIR_OBSERVER_STORE_PATH").ok(),
            env::var("SOVIR_OBSERVER_STORE_KEY").ok(),
        );
        if let (Some(path), Some(key)) = (path, key) {
            if key.len() < 32 {
                eprintln!("SOVIR_OBSERVER_STORE_KEY must be >= 32 bytes; using in-memory queue");
                return Self::Memory(VecDeque::new());
            }
            match sovir_edge_store::EncryptedEdgeQueue::open(
                std::path::Path::new(&path),
                key.as_bytes(),
            ) {
                Ok(q) => {
                    tracing::info!(%path, "durable encrypted outbox enabled");
                    return Self::Store(q);
                }
                Err(e) => {
                    eprintln!("edge store open failed ({e}); falling back to in-memory queue")
                }
            }
        }
        Self::Memory(VecDeque::new())
    }
    fn len(&self) -> usize {
        match self {
            Self::Memory(q) => q.len(),
            Self::Store(q) => q.len().unwrap_or(0) as usize,
        }
    }
    /// Push with bounded capacity — oldest-drop beyond max.
    fn push(&mut self, max: usize, body: serde_json::Value) {
        match self {
            Self::Memory(q) => {
                if queue_push_bounded(q, max, body).is_some() {
                    tracing::warn!("queue full; dropped oldest event");
                }
            }
            Self::Store(q) => {
                while q.len().unwrap_or(0) as usize >= max {
                    // Drop oldest row to stay under the bound.
                    if let Ok(items) = q.drain(1) {
                        let ids: Vec<i64> = items.iter().map(|i| i.row_id).collect();
                        let _ = q.ack(&ids);
                    } else {
                        break;
                    }
                }
                let _ = q.enqueue(SOURCE, now_ms(), &body);
            }
        }
    }
    /// Drain FIFO to the API until empty or the client dies. Returns
    /// false when a post fails (caller reconnects).
    async fn drain(&mut self, client: &Client) -> bool {
        match self {
            Self::Memory(q) => {
                while let Some(ev) = q.front().cloned() {
                    match client.post("/v1/events", &ev).await {
                        Ok(()) => {
                            q.pop_front();
                        }
                        Err(e) => {
                            tracing::warn!("queue drain failed ({e}); {} pending", q.len());
                            return false;
                        }
                    }
                }
            }
            Self::Store(q) => loop {
                let Ok(items) = q.drain(64) else { return true };
                if items.is_empty() {
                    break;
                }
                for item in items {
                    match client.post("/v1/events", &item.payload).await {
                        Ok(()) => {
                            let _ = q.ack(&[item.row_id]);
                        }
                        Err(e) => {
                            tracing::warn!("queue drain failed ({e}); {} pending", self.len());
                            return false;
                        }
                    }
                }
            },
        }
        true
    }
}

#[derive(Deserialize)]
struct DevSession {
    token: String,
}

struct Client {
    http: reqwest::Client,
    token: String,
}

impl Client {
    async fn connect() -> anyhow::Result<Self> {
        let http = reqwest::Client::new();
        let base = api_base();
        let session: DevSession = http
            .post(format!("{base}/v1/auth/dev-session"))
            .json(&serde_json::json!({
                "principal_id": "win-observer",
                "device_id": DEVICE,
                "tenant_id": "dev",
            }))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        let c = Self {
            http,
            token: session.token,
        };
        c.post(
            "/v1/devices",
            &serde_json::json!({
                "platform": "WINDOWS",
                "label": "Observador de escritorio",
            }),
        )
        .await
        .ok(); // 409 = already registered
        c.post(
            "/v1/consents",
            &serde_json::json!({
                "grant_id": GRANT,
                "source_id": SOURCE,
                "expires_at_ms": now_ms() + 86_400_000,
            }),
        )
        .await
        .ok(); // duplicate = already granted
        Ok(c)
    }

    async fn post(&self, path: &str, body: &serde_json::Value) -> anyhow::Result<()> {
        self.http
            .post(format!("{}{path}", api_base()))
            .bearer_auth(&self.token)
            .header("idempotency-key", format!("obs-{}", short_id()))
            .json(body)
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn short_id() -> String {
    Uuid::new_v4().simple().to_string()[..12].to_string()
}

fn sha256_hex(s: &str) -> String {
    let mut h = Sha256::new();
    h.update(s.as_bytes());
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// Processes whose windows legitimately present payments/credentials —
/// anything matching a sensitive title OUTSIDE this list is more suspect.
const KNOWN_SENSITIVE_PROCS: &[&str] = &[
    "chrome.exe",
    "msedge.exe",
    "firefox.exe",
    "brave.exe",
    "opera.exe",
    "arc.exe",
    "vivaldi.exe",
    "outlook.exe",
    "thunderbird.exe",
];
/// Browsers — a payment title inside one is a different risk class than
/// a payment window inside a dedicated app.
const BROWSER_PROCS: &[&str] = &[
    "chrome.exe",
    "msedge.exe",
    "firefox.exe",
    "brave.exe",
    "opera.exe",
    "arc.exe",
    "vivaldi.exe",
    "iexplore.exe",
];
/// Password managers / credential vaults — their windows are SENSITIVE
/// data class, never PUBLIC.
const PASSWORD_MANAGER_PROCS: &[&str] = &[
    "keepass.exe",
    "keepassxc.exe",
    "bitwarden.exe",
    "1password.exe",
    "lastpass.exe",
    "dashlane.exe",
    "enpass.exe",
    "keeper.exe",
    "roboform.exe",
    "nordpass.exe",
    "proton pass.exe",
    "pass.exe",
];

/// Title/process-name heuristics — transparent rules, same class as the
/// local inference gateway: honest pattern matching, never ML claims.
/// Returns (signal enums, sensitive_data_class).
fn analyze(title: &str, process: &str) -> (Vec<&'static str>, &'static str) {
    let t = title.to_lowercase();
    let p = process.to_lowercase();
    let mut signals = Vec::new();

    let is_browser = BROWSER_PROCS.iter().any(|b| p == *b);
    let is_password_manager = PASSWORD_MANAGER_PROCS.iter().any(|b| p.contains(b));
    let is_known_sensitive = KNOWN_SENSITIVE_PROCS.iter().any(|b| p == *b);

    let credential = t.contains("password")
        || t.contains("contraseña")
        || t.contains("sign in")
        || t.contains("iniciar sesión")
        || t.contains("login")
        || t.contains("verifica");
    let payment = t.contains("payment")
        || t.contains("pago")
        || t.contains("checkout")
        || t.contains("card")
        || t.contains("tarjeta")
        || t.contains("banco")
        || t.contains("bank");
    let urgent = t.contains("urgent")
        || t.contains("urgente")
        || t.contains("suspended")
        || t.contains("suspendida")
        || t.contains("locked")
        || t.contains("bloqueada")
        || t.contains("expira");

    if credential {
        signals.push("CREDENTIAL_REQUEST");
    }
    if payment {
        signals.push("PAYMENT_REQUEST");
    }
    if urgent {
        signals.push("URGENT_ACTION");
    }

    // Process-context compositions:
    // - browser + payment window: the classic phishing surface — an
    //   unverified web page asking for card data inside a general browser.
    if is_browser && payment && !signals.contains(&"IDENTITY_UNVERIFIED") {
        signals.push("IDENTITY_UNVERIFIED");
    }
    // - credential title in a process NOT on the known-sensitive list:
    //   an unknown binary asking for secrets is an identity risk.
    if credential && !is_known_sensitive && !is_password_manager {
        signals.push("IDENTITY_UNVERIFIED");
    }

    // Data class honesty: password-manager windows and credential prompts
    // are SENSITIVE — labelling them PUBLIC would lie about what the
    // process touched.
    let class = if is_password_manager || credential {
        "SENSITIVE"
    } else if !signals.is_empty() {
        "PERSONAL"
    } else {
        "PUBLIC"
    };
    (signals, class)
}

#[cfg(windows)]
mod win {
    use windows::Win32::Foundation::{CloseHandle, HWND};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
    };

    /// (process_name, title) of the foreground window, or None.
    pub fn foreground() -> Option<(String, String)> {
        unsafe {
            let hwnd: HWND = GetForegroundWindow();
            if hwnd.0.is_null() {
                return None;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            let mut buf = [0u16; 512];
            let n = GetWindowTextW(hwnd, &mut buf);
            let title = String::from_utf16_lossy(&buf[..n as usize]);
            let process = process_name(pid).unwrap_or_else(|| format!("pid-{pid}"));
            Some((process, title))
        }
    }

    fn process_name(pid: u32) -> Option<String> {
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 512];
            let mut len = buf.len() as u32;
            let name = QueryFullProcessImageNameW(
                h,
                PROCESS_NAME_WIN32,
                windows::core::PWSTR(buf.as_mut_ptr()),
                &mut len,
            )
            .ok()
            .map(|_| {
                String::from_utf16_lossy(&buf[..len as usize])
                    .rsplit('\\')
                    .next()
                    .unwrap_or_default()
                    .to_string()
            });
            let _ = CloseHandle(h);
            name
        }
    }
}

#[cfg(not(windows))]
mod win {
    pub fn foreground() -> Option<(String, String)> {
        None
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();
    if !cfg!(windows) {
        eprintln!("sovir-observer v0 reads window metadata on Windows only (ADR-0014).");
        std::process::exit(2);
    }
    if disabled() {
        eprintln!("SOVIR_OBSERVER_DISABLE=1 — observer off.");
        return Ok(());
    }
    tracing::info!(
        url = api_base(),
        poll_ms = poll_ms(),
        queue_max = queue_max(),
        "observer starting"
    );
    let excluded = excluded_processes();

    // Bounded offline outbox: API-down events are retried, never silently
    // dropped. Encrypted durable store when configured, else in-memory.
    let mut outbox = Outbox::open();
    let mut client: Option<Client> = None;
    let mut backoff = Duration::from_secs(1);
    let mut last: Option<String> = None;

    loop {
        // Ensure a live session — reconnect with exponential backoff.
        if client.is_none() {
            match Client::connect().await {
                Ok(c) => {
                    tracing::info!("connected to {}", api_base());
                    client = Some(c);
                    backoff = Duration::from_secs(1);
                }
                Err(e) => {
                    tracing::warn!("api unreachable ({e}); retry in {backoff:?}");
                    tokio::time::sleep(backoff).await;
                    backoff = (backoff * 2).min(Duration::from_secs(60));
                    continue;
                }
            }
        }
        // Drain the offline outbox first (FIFO) before observing anew.
        if !outbox.drain(client.as_ref().unwrap()).await {
            client = None;
            continue;
        }

        if let Some((process, title)) = win::foreground() {
            if !process_excluded(&process, &excluded) {
                let (signals, class) = analyze(&title, &process);
                if !signals.is_empty() {
                    // Digest binds process + signal set only — no title text.
                    let digest = format!(
                        "sha256:{}",
                        sha256_hex(&format!("{process}|{}", signals.join(",")))
                    );
                    if last.as_deref() != Some(digest.as_str()) {
                        last = Some(digest.clone());
                        let body = serde_json::json!({
                            "event_id": format!("win-{}", short_id()),
                            "source_id": SOURCE,
                            "observed_at_ms": now_ms(),
                            "modality": "TEXT",
                            "content_digest": digest,
                            "consent_grant_id": GRANT,
                            "sensitive_data_class": class,
                            "signals": signals,
                        });
                        match client.as_ref().unwrap().post("/v1/events", &body).await {
                            Ok(()) => tracing::info!(?signals, %process, %class, "emitted"),
                            Err(e) => {
                                tracing::warn!(
                                    "ingest failed ({e}); queued ({}/{})",
                                    outbox.len() + 1,
                                    queue_max()
                                );
                                outbox.push(queue_max(), body);
                                client = None;
                            }
                        }
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(poll_ms())).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn signals_of(title: &str, process: &str) -> Vec<&'static str> {
        analyze(title, process).0
    }

    #[test]
    fn credential_titles_signal() {
        let s = signals_of("Iniciar sesión - Banco", "chrome.exe");
        assert!(s.contains(&"CREDENTIAL_REQUEST"));
    }

    #[test]
    fn payment_titles_signal() {
        let s = signals_of("Checkout — tarjeta", "msedge.exe");
        assert!(s.contains(&"PAYMENT_REQUEST"));
    }

    #[test]
    fn urgency_titles_signal() {
        let s = signals_of("Cuenta suspendida — act now", "firefox.exe");
        assert!(s.contains(&"URGENT_ACTION"));
    }

    #[test]
    fn benign_titles_produce_nothing() {
        assert!(signals_of("Documento.txt - Bloc de notas", "notepad.exe").is_empty());
        assert!(signals_of("bandeja de entrada", "OUTLOOK.EXE").is_empty());
    }

    #[test]
    fn browser_plus_payment_is_combined_identity_risk() {
        let s = signals_of("Confirm your card details", "chrome.exe");
        assert!(s.contains(&"PAYMENT_REQUEST"));
        assert!(s.contains(&"IDENTITY_UNVERIFIED"));
        // A payment window in a non-browser app does NOT get the browser
        // composition — different risk surface.
        let s2 = signals_of("Confirm your card details", "steam.exe");
        assert!(s2.contains(&"PAYMENT_REQUEST"));
        assert!(!s2.contains(&"IDENTITY_UNVERIFIED"));
    }

    #[test]
    fn unknown_process_credential_is_identity_risk() {
        let s = signals_of("Enter your password", "totallyunknown.exe");
        assert!(s.contains(&"CREDENTIAL_REQUEST"));
        assert!(s.contains(&"IDENTITY_UNVERIFIED"));
        // The same title in a known browser is not unknown-process risk.
        let s2 = signals_of("Enter your password", "chrome.exe");
        assert!(!s2.contains(&"IDENTITY_UNVERIFIED"));
    }

    #[test]
    fn password_manager_windows_are_sensitive() {
        let (s, class) = analyze("Unlock vault", "keepassxc.exe");
        assert_eq!(class, "SENSITIVE");
        let _ = s;
        let (_, class2) = analyze("Checkout — tarjeta", "chrome.exe");
        assert_eq!(class2, "PERSONAL");
        let (_, class3) = analyze("Notas", "notepad.exe");
        assert_eq!(class3, "PUBLIC");
    }

    #[test]
    fn bounded_queue_drops_oldest_beyond_max() {
        let mut q = VecDeque::new();
        for i in 0..64 {
            queue_push_bounded(&mut q, 64, serde_json::json!({"i": i}));
        }
        let dropped = queue_push_bounded(&mut q, 64, serde_json::json!({"i": 64}));
        assert_eq!(dropped.unwrap()["i"], 0); // oldest evicted
        assert_eq!(q.len(), 64);
        assert_eq!(q.front().unwrap()["i"], 1);
        assert_eq!(q.back().unwrap()["i"], 64);
    }

    #[test]
    fn exclusion_matches_case_insensitive_process_name() {
        let ex = vec!["keepassxc.exe".to_string(), "svchost.exe".to_string()];
        assert!(process_excluded("KeePassXC.exe", &ex));
        assert!(process_excluded("svchost.exe", &ex));
        assert!(!process_excluded("svchostx.exe", &ex)); // exact match, not prefix
        assert!(!process_excluded("chrome.exe", &ex));
    }

    #[test]
    fn digest_binds_process_and_signals_only() {
        let a = sha256_hex("chrome.exe|URGENT_ACTION");
        let b = sha256_hex("chrome.exe|URGENT_ACTION");
        assert_eq!(a, b);
        assert_ne!(a, sha256_hex("chrome.exe|URGENT_ACTION,otro titulo"));
        assert_eq!(a.len(), 64);
    }
}
