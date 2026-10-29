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

use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::env;
use std::time::Duration;
use uuid::Uuid;

const SOURCE: &str = "screen-observer:windows";
const GRANT: &str = "win-observer-grant";
const DEVICE: &str = "win-desktop";
const POLL_MS: u64 = 2_000;

fn api_base() -> String {
    env::var("SOVIR_API_URL").unwrap_or_else(|_| "http://127.0.0.1:8787".into())
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
        c.post("/v1/devices", &serde_json::json!({
            "platform": "WINDOWS",
            "label": "Observador de escritorio",
        }))
        .await
        .ok(); // 409 = already registered
        c.post("/v1/consents", &serde_json::json!({
            "grant_id": GRANT,
            "source_id": SOURCE,
            "expires_at_ms": now_ms() + 86_400_000,
        }))
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

/// Title/process-name heuristics — transparent rules, same class as the
/// local inference gateway: honest pattern matching, never ML claims.
fn extract_signals(title: &str, process: &str) -> Vec<&'static str> {
    let t = title.to_lowercase();
    let mut signals = Vec::new();
    if t.contains("password")
        || t.contains("contraseña")
        || t.contains("sign in")
        || t.contains("iniciar sesión")
        || t.contains("login")
        || t.contains("verifica")
    {
        signals.push("CREDENTIAL_REQUEST");
    }
    if t.contains("payment")
        || t.contains("pago")
        || t.contains("checkout")
        || t.contains("card")
        || t.contains("tarjeta")
        || t.contains("banco")
        || t.contains("bank")
    {
        signals.push("PAYMENT_REQUEST");
    }
    if t.contains("urgent")
        || t.contains("urgente")
        || t.contains("suspended")
        || t.contains("suspendida")
        || t.contains("locked")
        || t.contains("bloqueada")
        || t.contains("expira")
    {
        signals.push("URGENT_ACTION");
    }
    // A browser in a private/incognito-ish or unsigned context is not
    // detectable from titles — no claim is made there.
    let _ = process;
    signals
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credential_titles_signal() {
        let s = extract_signals("Iniciar sesión - Banco", "chrome.exe");
        assert!(s.contains(&"CREDENTIAL_REQUEST"));
    }

    #[test]
    fn payment_titles_signal() {
        let s = extract_signals("Checkout — tarjeta", "msedge.exe");
        assert!(s.contains(&"PAYMENT_REQUEST"));
    }

    #[test]
    fn urgency_titles_signal() {
        let s = extract_signals("Cuenta suspendida — act now", "firefox.exe");
        assert!(s.contains(&"URGENT_ACTION"));
    }

    #[test]
    fn benign_titles_produce_nothing() {
        assert!(extract_signals("Documento.txt - Bloc de notas", "notepad.exe").is_empty());
        assert!(extract_signals("bandeja de entrada", "OUTLOOK.EXE").is_empty());
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

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();
    if !cfg!(windows) {
        eprintln!("sovir-observer v0 reads window metadata on Windows only (ADR-0014).");
        std::process::exit(2);
    }
    tracing::info!("connecting to {}", api_base());
    let client = Client::connect().await?;
    tracing::info!("observing foreground window metadata → {SOURCE}");
    let mut last: Option<String> = None;
    loop {
        if let Some((process, title)) = win::foreground() {
            let signals = extract_signals(&title, &process);
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
                        "sensitive_data_class": "PUBLIC",
                        "signals": signals,
                    });
                    match client.post("/v1/events", &body).await {
                        Ok(()) => tracing::info!(?signals, %process, "emitted"),
                        Err(e) => tracing::warn!("ingest failed: {e}"),
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(POLL_MS)).await;
    }
}
