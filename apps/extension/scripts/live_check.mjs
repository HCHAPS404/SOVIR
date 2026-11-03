// Live extension check — launches REAL Chromium with the SOVIR extension
// loaded and drives the service worker the same way a content script /
// popup does. Verifies what node:test cannot:
//   1. MV3 service worker boots — CSP `wasm-unsafe-eval`, no console errors
//   2. connect() → dev-session → API round-trip (ready + principal)
//   3. observation → POST /v1/events → authoritative EventDecision back
//   4. vision ONNX — the real wasm + 3.7MB model running in a real worker,
//      fed a real captured frame (screenshot of a live page via CDP)
//   5. API side — the event lands in GET /v1/events for the same principal
//
// What it CANNOT do (Chrome security boundary, by design): click the host-
// permission grant dialog. That one step stays human — it is the consent
// gesture itself.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/jesui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core"
);

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.SOVIR_API_URL ?? "http://127.0.0.1:8787";
const sha256 = (s) => "sha256:" + createHash("sha256").update(s).digest("hex");
const results = { checks: {}, errors: [] };

// A headed window opens briefly on the desktop — MV3 workers do not run
// headless. It closes itself when the script finishes.
const ctx = await chromium.launchPersistentContext("", {
  executablePath:
    "C:/Users/jesui/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe",
  headless: false,
  viewport: { width: 1280, height: 800 },
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    "--disable-component-extensions-with-background-pages",
  ],
});

const t0 = Date.now();
const swErrors = [];

// 1 — wait for the extension service worker and tap its console.
let sw = ctx.serviceWorkers().find((w) => w.url().includes("background.js"));
if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
const extId = new URL(sw.url()).host;
sw.on("console", (m) => {
  if (m.type() === "error") swErrors.push(m.text());
});
sw.on("crash", () => swErrors.push("WORKER_CRASH"));
results.checks.extension_id = extId;
results.checks.sw_boot_ms = Date.now() - t0;

// Give the worker a moment for any boot-time module errors to surface.
await new Promise((r) => setTimeout(r, 1500));
results.checks.sw_boot_errors = swErrors.slice();
results.checks.sw_boot_ok = swErrors.length === 0;

// 2 — popup.html opened as a normal tab is still the extension origin:
// chrome.runtime works and sendMessage reaches the service worker.
const popup = await ctx.newPage();
await popup.goto(`chrome-extension://${extId}/popup.html`);
const connect = await popup.evaluate(async () => {
  await chrome.storage.local.set({ "sovir-vision-enabled": true });
  return chrome.runtime.sendMessage({ type: "connect" });
});
results.checks.connect = connect;

// 3 — emit an observation through the REAL message path → POST /v1/events.
const digest = sha256(`live-check-${Date.now()}`);
const obs = await popup.evaluate((d) =>
  chrome.runtime.sendMessage({
    type: "observation",
    signals: ["CREDENTIAL_REQUEST", "URGENT_ACTION", "IDENTITY_UNVERIFIED"],
    digest: d,
    observed_at_ms: Date.now(),
    text_hint: "synthetic live-check: sign in immediately to verify your account",
  }), digest);
results.checks.observation = obs;
await new Promise((r) => setTimeout(r, 2500)); // assessment + badge settle
results.checks.state = await popup.evaluate(() =>
  chrome.runtime.sendMessage({ type: "get-state" }));

// 4 — real ONNX in the real worker: capture a REAL page via CDP, feed the
// PNG dataUrl straight into the exported analyze().
const page = await ctx.newPage();
let frameDataUrl = null;
try {
  await page.goto("https://www.microsoft.com", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  const shot = await page.screenshot({ type: "png" });
  frameDataUrl = "data:image/png;base64," + shot.toString("base64");
} catch (e) {
  results.checks.frame_capture = `skipped: ${e.message}`;
}
if (frameDataUrl) {
  // analyze() expects {data,width,height} RGBA — decode in the worker via
  // OffscreenCanvas (same conversion capturePixels does on the real path).
  const analysis = await sw.evaluate(async ({ f, host }) => {
    if (!globalThis.sovirVisionOnnx?.analyze) return { error: "no_analyze_export" };
    // The real init path — importScripts ort + fetch models + m.load —
    // the same visionOnnxEnsure() the scan path uses (classic worker
    // script → top-level fns live on globalThis).
    // ort loads at worker boot now (MV3 importScripts is startup-only);
    // visionOnnxEnsure does wasmPaths + model fetch + InferenceSession.
    const steps = { ort_at_boot: typeof globalThis.ort };
    const ready = await globalThis.visionOnnxEnsure?.();
    steps.ensure = ready;
    if (!ready) return { error: "onnx_init_failed", steps };
    const bmp = await createImageBitmap(await (await fetch(f)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext("2d");
    g.drawImage(bmp, 0, 0);
    const img = g.getImageData(0, 0, bmp.width, bmp.height);
    const frame = { data: img.data, width: img.width, height: img.height };
    return {
      same_host: await globalThis.sovirVisionOnnx.analyze(frame, host, null),
      foreign_host: await globalThis.sovirVisionOnnx.analyze(
        frame,
        "phish-check.invalid",
        null,
      ),
    };
  }, { f: frameDataUrl, host: "www.microsoft.com" });
  results.checks.vision_onnx_real = analysis;
}

// Consent boundary probe: WITHOUT any host/activeTab grant the pixel
// capture path must be refused — even for the extension's own page. A
// refusal here is the invariant holding, not a failure.
await popup.bringToFront();
results.checks.capture_requires_grant = await popup.evaluate(() =>
  chrome.runtime.sendMessage({ type: "vision-check" }));

// 5 — API side: same-principal dev-session → the emitted event must land.
try {
  const sess = await fetch(`${API}/v1/auth/dev-session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      principal_id: connect?.principal ?? "ext-demo",
      device_id: "live-check",
      tenant_id: "dev",
    }),
  }).then((r) => r.json());
  const events = await fetch(`${API}/v1/events?limit=25`, {
    headers: { authorization: `Bearer ${sess.token}` },
  }).then((r) => r.json());
  const list = Array.isArray(events) ? events : (events?.events ?? []);
  const emitted = results.checks.observation?.event_id;
  results.checks.api_emitted_event =
    list.find((e) => e.event_id === emitted) ??
    `not_found_in_${list.length}_events`;
} catch (e) {
  results.checks.api_latest_event = `error: ${e.message}`;
}

console.log(JSON.stringify(results, null, 2));
await ctx.close();
process.exit(results.checks.sw_boot_ok ? 0 : 1);
