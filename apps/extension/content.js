// SOVIR content extractor — injected per-site only after explicit user
// opt-in (chrome.permissions). Reads the DOM and emits TYPED SIGNALS +
// a metadata digest. No text, no DOM, no field values leave this file:
// that is the ADR-0014 observer invariant.

(() => {
  const URGENCY =
    /\b(urgente|verifica|verificar|suspendida|suspendido|bloqueada|expira|caduca|act now|verify|suspended|locked|immediately|último aviso)\b/i;
  const TRACKER_HOSTS = [
    "google-analytics.com",
    "googletagmanager.com",
    "connect.facebook.net",
    "doubleclick.net",
    "hotjar.com",
  ];

  function extractSignals() {
    const signals = new Set();
    const doc = document;

    if (doc.querySelector('input[type="password"]')) signals.add("CREDENTIAL_REQUEST");

    const paymentFields = doc.querySelector(
      'input[autocomplete^="cc-"], input[name*="card" i], input[id*="card" i], input[name*="cvv" i], input[name*="iban" i]',
    );
    if (paymentFields.length > 0) signals.add("PAYMENT_REQUEST");

    const headings = doc.querySelectorAll("h1, h2, button, .btn, strong, b");
    for (const el of headings) {
      if (el.textContent && URGENCY.test(el.textContent)) {
        signals.add("URGENT_ACTION");
        break;
      }
    }

    const prechecked = doc.querySelectorAll(
      'form input[type="checkbox"][checked], [class*="cookie" i] input[type="checkbox"][checked]',
    );
    if (prechecked.length > 0) signals.add("CONSENT_DARK_PATTERN");

    const scripts = doc.querySelectorAll("script[src]");
    for (const s of scripts) {
      try {
        const host = new URL(s.src).host;
        if (TRACKER_HOSTS.some((t) => host.endsWith(t))) {
          signals.add("TRACKING_OBSERVED");
          break;
        }
      } catch {}
    }

    // An unverified identity surface: any of the above on plain HTTP.
    if (signals.size > 0 && location.protocol === "http:") {
      signals.add("IDENTITY_UNVERIFIED");
    }
    return [...signals].sort();
  }

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  let lastDigest = "";
  let timer = null;

  async function report() {
    const signals = extractSignals();
    if (signals.length === 0) return;
    // Digest binds host + signal set only — no page content.
    const digest = `sha256:${await sha256(`${location.host}|${signals.join(",")}`)}`;
    if (digest === lastDigest) return;
    lastDigest = digest;
    chrome.runtime.sendMessage({
      type: "observation",
      signals,
      digest,
      observed_at_ms: Date.now(),
    });
  }

  // Initial pass + throttled rescan on DOM churn (SPA navigations,
  // lazy-rendered forms).
  report();
  const observer = new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      report();
    }, 5_000);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
