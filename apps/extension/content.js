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

  // visual_hint (ADR-0028): a base64 PNG of a DOM logo candidate for the
  // LOCAL onnx-visual voter — same local-only channel as text_hint
  // (local assess endpoint only; never stored, never in any remote
  // envelope). Any failure — no candidate, oversized or unloaded image,
  // cross-origin canvas taint — abstains silently, never blocks.
  const VISUAL_HINT_MAX_SIDE_PX = 1024;
  // ~256KB decoded ≈ ~341KB base64; the voter refuses larger payloads.
  const VISUAL_HINT_MAX_B64_CHARS = 340_000;
  const VISUAL_HINT_MAX_CANDIDATES = 4;
  const PNG_PREFIX = "data:image/png;base64,";

  function visualHint() {
    if (typeof globalThis.sovirLogoCandidateImages !== "function") return undefined;
    let candidates;
    try {
      candidates = globalThis.sovirLogoCandidateImages(document);
    } catch {
      return undefined;
    }
    for (const img of (candidates ?? []).slice(0, VISUAL_HINT_MAX_CANDIDATES)) {
      try {
        const w = img.naturalWidth | 0;
        const h = img.naturalHeight | 0;
        // Unloaded/broken (0) or oversized — skip, never downscale.
        if (!w || !h || w > VISUAL_HINT_MAX_SIDE_PX || h > VISUAL_HINT_MAX_SIDE_PX)
          continue;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.drawImage(img, 0, 0, w, h);
        // A cross-origin <img> without CORS taints the canvas: export
        // throws SecurityError → candidate skipped, page untouched.
        const url = canvas.toDataURL("image/png");
        const b64 = url.startsWith(PNG_PREFIX) ? url.slice(PNG_PREFIX.length) : "";
        if (b64 && b64.length <= VISUAL_HINT_MAX_B64_CHARS) return b64;
      } catch {
        // Tainted or undrawable image → try the next candidate.
      }
    }
    return undefined;
  }

  async function report() {
    if (typeof globalThis.sovirExtractSignals !== "function") return;
    const hintBlocks = [];
    const signals = globalThis.sovirExtractSignals(document, location, hintBlocks);
    if (signals.length === 0) return;
    // Digest binds host + signal set only — no page content.
    const digest = `sha256:${await sha256(`${location.host}|${signals.join(",")}`)}`;
    if (digest === lastDigest) return;
    lastDigest = digest;
    chrome.runtime.sendMessage({
      type: "observation",
      signals,
      digest,
      // Bounded pattern-matched copy for the LOCAL ONNX text voter only
      // (≤1.5KB). Ephemeral: the worker forwards it to the local assess
      // endpoint; it is never stored in the event nor sent to Meta.
      text_hint: hintBlocks.join("\n").slice(0, 1500),
      // Bounded PNG logo crop (≤1024px, ~256KB decoded) for the LOCAL
      // visual voter — same ephemeral local-only rules as text_hint.
      // undefined when no candidate could be rasterized.
      visual_hint: visualHint(),
      observed_at_ms: Date.now(),
    });
    // Cheap nudge — the worker decides whether the opt-in visual scan
    // runs (flag off = no-op). Sent only when the signal set changed.
    chrome.runtime.sendMessage({ type: "vision-check", logo_frame: logoFrame() });
  }

  // DOM-guided logo regions for the local visual matcher (geometry only,
  // never leaves the extension). Absent extractor → undefined → the
  // matcher falls back to its own crop heuristic.
  function logoFrame() {
    if (typeof globalThis.sovirExtractLogoRegions !== "function") return undefined;
    return globalThis.sovirExtractLogoRegions(document);
  }

  // One unconditional nudge per load: a QR-only page carries no text
  // signals, so the scan trigger cannot depend on them.
  chrome.runtime.sendMessage({ type: "vision-check", logo_frame: logoFrame() });

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
