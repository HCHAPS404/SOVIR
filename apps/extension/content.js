// SOVIR content bridge — thin wrapper injected after extractor.js.
// Calls the pure extractor, digests metadata, and reports typed signals
// to the background worker. No text, no DOM, no field values leave.

(() => {
  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  let lastDigest = "";
  let timer = null;

  async function report() {
    if (typeof globalThis.sovirExtractSignals !== "function") return;
    const signals = globalThis.sovirExtractSignals(document, location);
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
