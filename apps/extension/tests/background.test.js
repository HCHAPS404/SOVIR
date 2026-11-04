import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Load background.js into a sandbox: it registers listeners via chrome.*
// globals on load. We capture the onMessage handler and drive it.
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "background.js"), "utf8");

let messageHandler;
let storageLocal;
let storageSession;
let registeredScripts;
let unregisteredIds;
let fetchCalls;
let fetchBehavior;
let permissionOrigins;
let permAddedListeners;
let badgeCalls;

function installMocks() {
  storageLocal = {};
  storageSession = {};
  registeredScripts = [];
  unregisteredIds = [];
  fetchCalls = [];
  permissionOrigins = [];
  messageHandler = null;
  permAddedListeners = [];
  badgeCalls = [];
  fetchBehavior = (url, init) =>
    new Response(JSON.stringify({ token: "tok-1", principal_id: "ext-demo" }), { status: 200 });

  const store = (backing) => ({
    get: async (key) => ({ [key]: backing[key] }),
    set: async (obj) => Object.assign(backing, obj),
  });

  globalThis.chrome = {
    storage: {
      local: store(storageLocal),
      session: store(storageSession),
    },
    permissions: {
      getAll: async () => ({ origins: permissionOrigins }),
      contains: async (req) =>
        req.origins?.every((o) => permissionOrigins.includes(o) || permissionOrigins.includes("<all_urls>")),
      onAdded: { addListener: (fn) => permAddedListeners.push(fn) },
      onRemoved: { addListener: () => {} },
    },
    action: {
      setBadgeText: async (o) => (badgeCalls.push({ fn: "text", ...o })),
      setBadgeBackgroundColor: async (o) => (badgeCalls.push({ fn: "color", ...o })),
    },
    scripting: {
      unregisterContentScripts: async ({ ids }) => unregisteredIds.push(...ids),
      registerContentScripts: async (defs) => registeredScripts.push(...defs),
    },
    runtime: {
      onStartup: { addListener: () => {} },
      onInstalled: { addListener: () => {} },
      onMessage: { addListener: (fn) => (messageHandler = fn) },
      getURL: (p) => `chrome-extension://test/${p}`,
    },
  };
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    const res = fetchBehavior(url, init);
    return res;
  };
}

function loadWorker() {
  new Function(src)();
  assert.ok(messageHandler, "onMessage listener registered");
}

function send(message, tabId = 7) {
  return new Promise((resolve) => messageHandler(message, { tab: { id: tabId } }, resolve));
}

// Minimal Response stand-in (node has real fetch/Response — use them).
function okJson(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  installMocks();
  loadWorker();
});

test("observation mints session, registers device+grant, posts event", async () => {
  const res = await send({
    type: "observation",
    signals: ["PAYMENT_REQUEST"],
    digest: "sha256:abc",
    observed_at_ms: 1,
  });
  assert.equal(res.ok, true);
  const paths = fetchCalls.map((c) => new URL(c.url).pathname);
  for (const p of ["/v1/auth/dev-session", "/v1/devices", "/v1/consents", "/v1/events"])
    assert.ok(paths.some((x) => x.endsWith(p)), `missing ${p}`);
  const event = fetchCalls.find((c) => c.url.endsWith("/v1/events"));
  assert.equal(event.init.headers["idempotency-key"].startsWith("extidem-"), true);
});

test("text_hint goes to a private, snake_case council assess — never STANDARD", async () => {
  await send({
    type: "observation",
    signals: ["PAYMENT_REQUEST"],
    digest: "sha256:hint",
    observed_at_ms: 1,
    text_hint: "Pague la tasa de aduana ahora",
  });
  await new Promise((r) => setTimeout(r, 10));
  const assess = fetchCalls.find((c) => c.url.endsWith("/v1/inference/assess"));
  assert.ok(assess, "assess called when a hint exists");
  const body = JSON.parse(assess.init.body);
  assert.equal(body.privacy, "private");
  assert.equal(body.text_hint, "Pague la tasa de aduana ahora");
  const event = fetchCalls.find((c) => c.url.endsWith("/v1/events"));
  assert.equal(JSON.parse(event.init.body).text_hint, undefined, "stored event stays signal-only");
});

test("dedupe suppresses the same digest within the TTL window", async () => {
  const obs = {
    type: "observation",
    signals: ["URGENT_ACTION"],
    digest: "sha256:same",
    observed_at_ms: 1,
  };
  const first = await send(obs);
  const second = await send(obs);
  assert.equal(first.ok, true);
  assert.equal(second.deduped, true);
  const events = fetchCalls.filter((c) => c.url.endsWith("/v1/events"));
  assert.equal(events.length, 1);
});

test("emitted event honours the ≤8-signal contract bound", async () => {
  // observed-event.schema.json caps signals at 8; a pathological page
  // can trip more. The emitter must keep the highest-evidence ones.
  const res = await send({
    type: "observation",
    signals: [
      "TRACKING_OBSERVED",
      "IDENTITY_UNVERIFIED",
      "URGENT_ACTION",
      "CONSENT_DARK_PATTERN",
      "SCARCITY_PRESSURE",
      "SUSPICIOUS_DOMAIN",
      "LINK_DESTINATION_MISMATCH",
      "OFF_PLATFORM_MOVE",
      "AUTHORITY_IMPERSONATION",
      "GIFT_CARD_PAYMENT",
      "CREDENTIAL_REQUEST",
      "PAYMENT_REQUEST",
      "EXTORTION_LANGUAGE",
      "SEED_PHRASE_REQUEST",
    ],
    digest: "sha256:big",
    observed_at_ms: 1,
  });
  assert.equal(res.ok, true);
  const event = fetchCalls.find((c) => c.url.endsWith("/v1/events"));
  const emitted = JSON.parse(event.init.body).signals;
  assert.equal(emitted.length, 8);
  assert.deepEqual(emitted, [
    "SEED_PHRASE_REQUEST",
    "EXTORTION_LANGUAGE",
    "PAYMENT_REQUEST",
    "CREDENTIAL_REQUEST",
    "GIFT_CARD_PAYMENT",
    "AUTHORITY_IMPERSONATION",
    "OFF_PLATFORM_MOVE",
    "LINK_DESTINATION_MISMATCH",
  ]);
});

test("401 on ingest triggers exactly one reconnect then retry", async () => {
  let eventCalls = 0;
  fetchBehavior = (url) => {
    if (url.endsWith("/v1/events")) {
      eventCalls += 1;
      if (eventCalls === 1) {
        return new Response(JSON.stringify({ error: { code: "unauthorized" } }), { status: 401 });
      }
      return okJson({}, 201);
    }
    return okJson({ token: "tok-2", principal_id: "ext-demo" });
  };
  const res = await send({
    type: "observation",
    signals: ["CREDENTIAL_REQUEST"],
    digest: "sha256:x",
    observed_at_ms: 1,
  });
  assert.equal(res.ok, true);
  assert.equal(eventCalls, 2);
  const sessions = fetchCalls.filter((c) => c.url.endsWith("/v1/auth/dev-session"));
  assert.equal(sessions.length, 2); // initial + one reconnect, no third
});

test("paused state drops observations without calling the API", async () => {
  await send({ type: "set-paused", paused: true });
  const before = fetchCalls.length;
  const res = await send({
    type: "observation",
    signals: ["URGENT_ACTION"],
    digest: "sha256:p",
    observed_at_ms: 1,
  });
  assert.equal(res.paused, true);
  assert.equal(fetchCalls.length, before);
});

test("API failure is stored as lastError, not swallowed", async () => {
  fetchBehavior = () => okJson({ error: { code: "internal_error" } }, 500);
  const res = await send({
    type: "observation",
    signals: ["URGENT_ACTION"],
    digest: "sha256:e",
    observed_at_ms: 1,
  });
  assert.equal(res.ok, false);
  const state = await send({ type: "get-state" });
  assert.ok(state.lastError);
});

test("syncScripts registers content scripts for granted origins only", async () => {
  permissionOrigins = ["https://example.com/*", "https://hell.taile32c7d.ts.net/*"];
  for (const fn of permAddedListeners) await fn();
  assert.equal(registeredScripts.length, 1);
  const def = registeredScripts[0];
  assert.deepEqual(def.matches, ["https://example.com/*"]); // API origin excluded
  assert.deepEqual(def.js, ["brand-domains.js", "extractor.js", "content.js"]);
  assert.equal(def.persistAcrossSessions, true);
  assert.deepEqual(unregisteredIds, ["sovir-observer"]); // replaced cleanly
});

test("syncScripts with no granted origins registers nothing", async () => {
  permissionOrigins = [];
  for (const fn of permAddedListeners) await fn();
  assert.equal(registeredScripts.length, 0);
});

test("event body never carries page text — only digest + enum signals", async () => {
  await send({
    type: "observation",
    signals: ["PAYMENT_REQUEST"],
    digest: "sha256:lean",
    observed_at_ms: 42,
    url: "https://evil.example/login?u=victim", // must not be forwarded
    title: "Bank login page", // must not be forwarded
  });
  const event = fetchCalls.find((c) => c.url.endsWith("/v1/events"));
  const body = JSON.parse(event.init.body);
  assert.equal(body.content_digest, "sha256:lean");
  assert.deepEqual(body.signals, ["PAYMENT_REQUEST"]);
  assert.equal(body.url, undefined);
  assert.equal(body.title, undefined);
  assert.equal(body.sensitive_data_class, "PUBLIC");
  assert.equal(body.modality, "TEXT");
});

// ---------------------------------------------------------------------------
// Vision path: the real vision.js scan runs against a stubbed capture
// seam — the test pins gating, modality, and the no-pixels invariant.
// ---------------------------------------------------------------------------
const visionSrc = readFileSync(join(here, "..", "vision.js"), "utf8");

function installVision(qrFrame) {
  new Function(visionSrc)();
  globalThis.sovirCapturePixels = async () => qrFrame;
}

function qrImage() {
  // Synthetic QR: three finder patterns on light ground.
  const w = 96;
  const data = new Uint8ClampedArray(w * w * 4);
  for (let i = 0; i < data.length; i += 4) data.set([240, 240, 240, 255], i);
  const paint = (x0, y0, x1, y1, px) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) data.set(px, (y * w + x) * 4);
  };
  const finder = (ox, oy) => {
    paint(ox, oy, ox + 14, oy + 14, [20, 20, 20, 255]);
    paint(ox + 2, oy + 2, ox + 12, oy + 12, [240, 240, 240, 255]);
    paint(ox + 4, oy + 4, ox + 10, oy + 10, [20, 20, 20, 255]);
  };
  finder(8, 8);
  finder(72, 8);
  finder(8, 72);
  return { data, width: w, height: w };
}

function sendVision(windowId = 3) {
  return new Promise((resolve) =>
    messageHandler({ type: "vision-check" }, { tab: { id: 7, windowId } }, resolve),
  );
}

test("vision-check with the flag off never captures", async () => {
  installVision(qrImage());
  const res = await sendVision();
  assert.equal(res.disabled, true);
  assert.equal(fetchCalls.length, 0);
});

test("vision-check enabled emits IMAGE_REGION event with QR_PRESENT", async () => {
  installVision(qrImage());
  storageLocal["sovir-vision-enabled"] = true;
  permissionOrigins = ["<all_urls>"];
  const res = await sendVision();
  assert.equal(res.ok, true);
  const event = fetchCalls.find((c) => c.url.endsWith("/v1/events"));
  const body = JSON.parse(event.init.body);
  assert.equal(body.modality, "IMAGE_REGION");
  assert.deepEqual(body.signals, ["QR_PRESENT"]);
  assert.ok(body.content_digest.startsWith("sha256:"));
  assert.equal(body.sensitive_data_class, "PUBLIC");
  // The invariant: no pixels, no dataUrl, no DOM — only enums + digest.
  assert.equal(body.data, undefined);
  assert.equal(body.image, undefined);
  assert.equal(body.url, undefined);
});

test("vision-check on a clean page emits nothing", async () => {
  installVision({ data: new Uint8ClampedArray(96 * 96 * 4).fill(240), width: 96, height: 96 });
  storageLocal["sovir-vision-enabled"] = true;
  permissionOrigins = ["<all_urls>"];
  const res = await sendVision();
  assert.deepEqual(res.signals, []);
  assert.equal(fetchCalls.filter((c) => c.url.endsWith("/v1/events")).length, 0);
});

test("vision-check paused is dropped before any capture", async () => {
  installVision(qrImage());
  storageLocal["sovir-vision-enabled"] = true;
  await send({ type: "set-paused", paused: true });
  const res = await sendVision();
  assert.equal(res.paused, true);
  assert.equal(fetchCalls.filter((c) => c.url.endsWith("/v1/events")).length, 0);
});

test("logo_frame from the page reaches the ONNX analyzer", async () => {
  installVision({ data: new Uint8ClampedArray(96 * 96 * 4).fill(240), width: 96, height: 96 });
  storageLocal["sovir-vision-enabled"] = true;
  permissionOrigins = ["<all_urls>"];
  let seen = null;
  globalThis.ort = { env: {} }; // skips the importScripts path in ensure
  globalThis.sovirVisionOnnx = {
    load: async () => true,
    loaded: () => true,
    analyze: async (frame, host, logoFrame) => {
      seen = logoFrame;
      return { signals: [] };
    },
  };
  const frame = { regions: [{ x: 8, y: 8, w: 40, h: 24 }], vw: 96, vh: 96 };
  await new Promise((resolve) =>
    messageHandler({ type: "vision-check", logo_frame: frame }, { tab: { id: 7, windowId: 3 } }, resolve),
  );
  assert.deepEqual(seen, frame, "DOM logo regions forwarded to the matcher");
  delete globalThis.ort;
  delete globalThis.sovirVisionOnnx;
});

test("warn decision marks the badge and stores lastDecision", async () => {
  fetchBehavior = () =>
    new Response(
      JSON.stringify({
        assessment: { risk_level: "high", decision: "warn" },
      }),
      { status: 200 },
    );
  // Dev-session + device + consent calls need their own responses; the
  // events POST is what returns the EventDecision. Route by path.
  fetchBehavior = (url) => {
    if (url.endsWith("/v1/events"))
      return new Response(
        JSON.stringify({ assessment: { risk_level: "high", decision: "warn" } }),
        { status: 200 },
      );
    return okJson({ token: "tok-1", principal_id: "ext-demo" });
  };
  await send({
    type: "observation",
    signals: ["PAYMENT_REQUEST"],
    digest: "sha256:w1",
    observed_at_ms: 1,
  });
  const badge = badgeCalls.find((b) => b.fn === "text" && b.tabId === 7);
  assert.equal(badge?.text, "!", "warn decision → ! badge on the tab");
  assert.ok(
    badgeCalls.some((b) => b.fn === "color"),
    "warn color set",
  );
  const state = await new Promise((r) =>
    messageHandler({ type: "get-state" }, {}, r),
  );
  assert.equal(state.lastDecision?.decision, "warn");
  assert.equal(state.lastDecision?.risk_level, "high");
});
