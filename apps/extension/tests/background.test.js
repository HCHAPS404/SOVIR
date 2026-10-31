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

function installMocks() {
  storageLocal = {};
  storageSession = {};
  registeredScripts = [];
  unregisteredIds = [];
  fetchCalls = [];
  permissionOrigins = [];
  messageHandler = null;
  permAddedListeners = [];
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
      onAdded: { addListener: (fn) => permAddedListeners.push(fn) },
      onRemoved: { addListener: () => {} },
    },
    scripting: {
      unregisterContentScripts: async ({ ids }) => unregisteredIds.push(...ids),
      registerContentScripts: async (defs) => registeredScripts.push(...defs),
    },
    runtime: {
      onStartup: { addListener: () => {} },
      onInstalled: { addListener: () => {} },
      onMessage: { addListener: (fn) => (messageHandler = fn) },
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
  assert.ok(paths.includes("/v1/auth/dev-session"));
  assert.ok(paths.includes("/v1/devices"));
  assert.ok(paths.includes("/v1/consents"));
  assert.ok(paths.includes("/v1/events"));
  const event = fetchCalls.find((c) => c.url.endsWith("/v1/events"));
  assert.equal(event.init.headers["idempotency-key"].startsWith("extidem-"), true);
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
  permissionOrigins = ["https://example.com/*", "http://127.0.0.1:8787/*"];
  for (const fn of permAddedListeners) await fn();
  assert.equal(registeredScripts.length, 1);
  const def = registeredScripts[0];
  assert.deepEqual(def.matches, ["https://example.com/*"]); // API origin excluded
  assert.deepEqual(def.js, ["extractor.js", "content.js"]);
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
