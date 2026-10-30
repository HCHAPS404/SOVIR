// SOVIR signal extractor — PURE function, no DOM side effects, no chrome
// APIs. Loaded before content.js (shared content-script global scope) and
// imported by the jsdom test suite. Maps a document+location to the typed
// signal enum set — the ADR-0014 observer invariant.

(function attach(global) {
  const URGENCY =
    /\b(urgente|verifica|verificar|suspendida|suspendido|bloqueada|expira|caduca|act now|verify|suspended|locked|immediately|último aviso)\b/i;
  const TRACKER_HOSTS = [
    "google-analytics.com",
    "googletagmanager.com",
    "connect.facebook.net",
    "doubleclick.net",
    "hotjar.com",
  ];

  function sovirExtractSignals(doc, loc) {
    const signals = new Set();

    if (doc.querySelector('input[type="password"]')) signals.add("CREDENTIAL_REQUEST");

    const paymentFields = doc.querySelectorAll(
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

    if (signals.size > 0 && loc.protocol === "http:") {
      signals.add("IDENTITY_UNVERIFIED");
    }
    return [...signals].sort();
  }

  global.sovirExtractSignals = sovirExtractSignals;
})(globalThis);
