// SOVIR extension background service worker — the only piece that talks
// to the loopback API. Content scripts produce typed signals; this worker
// owns the session token (chrome.storage.session — never persisted),
// registers the device, holds the consent grant, and posts events.
//
// ADR-0014 invariant: nothing raw ever leaves the page. The event body
// carries a sha256 digest and the signal enum set — no DOM, no text.

const DEFAULT_API = "http://127.0.0.1:8787";
const API_URL_KEY = "sovir-api-url"; // storage.local — user setting
const SOURCE = "screen-observer:ext";
const DEVICE = "ext-web";
const GRANT = "ext-observer-grant";
const STATE_KEY = "sovir-ext-state";
const SEEN_KEY = "sovir-ext-seen";
const SEEN_TTL_MS = 60_000;

async function apiBase() {
  const s = await chrome.storage.local.get(API_URL_KEY);
  return s[API_URL_KEY] ?? DEFAULT_API;
}

async function api(path, { token, method = "GET", body, idem } = {}) {
  const base = await apiBase();
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(idem ? { "idempotency-key": idem } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = new Error(`http_${res.status}`);
    err.status = res.status;
    try {
      err.code = (await res.json()).error?.code;
    } catch {}
    throw err;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : undefined;
}

async function getState() {
  const s = await chrome.storage.session.get(STATE_KEY);
  return (
    s[STATE_KEY] ?? {
      token: null,
      principal: null,
      ready: false,
      paused: false,
      lastError: null,
      lastObservation: null,
    }
  );
}

async function setState(patch) {
  const cur = await getState();
  const next = { ...cur, ...patch };
  await chrome.storage.session.set({ [STATE_KEY]: next });
  return next;
}

// Mint a dev session + register device + consent for this source. Runs
// once per worker lifetime; safe to call again (409s are tolerated).
async function connect() {
  const session = await api("/v1/auth/dev-session", {
    method: "POST",
    body: { principal_id: "ext-demo", device_id: DEVICE, tenant_id: "dev" },
  });
  const token = session.token;
  await api("/v1/devices", {
    token,
    method: "POST",
    body: { platform: "BROWSER_EXTENSION", label: "Extensión de navegador" },
  }).catch((e) => {
    if (e.status !== 409) throw e;
  });
  await api("/v1/consents", {
    token,
    method: "POST",
    body: {
      grant_id: GRANT,
      source_id: SOURCE,
      expires_at_ms: Date.now() + 24 * 60 * 60 * 1000,
    },
  }).catch((e) => {
    if (e.code !== "duplicate_event" && e.status !== 409) throw e;
  });
  return setState({ token, principal: session.principal_id, ready: true, lastError: null });
}

async function ensureConnected() {
  const st = await getState();
  if (st.ready) return st;
  return connect();
}

// Dedupe identical observations per tab for SEEN_TTL_MS — the extractor
// fires on DOM mutations and the API should not see a storm of repeats.
async function dedupe(tabId, key) {
  const { [SEEN_KEY]: seen = {} } = await chrome.storage.session.get(SEEN_KEY);
  const now = Date.now();
  const id = `${tabId}:${key}`;
  if (seen[id] && now - seen[id] < SEEN_TTL_MS) return true;
  seen[id] = now;
  for (const k of Object.keys(seen)) if (now - seen[k] > SEEN_TTL_MS) delete seen[k];
  await chrome.storage.session.set({ [SEEN_KEY]: seen });
  return false;
}

async function emitEvent(tabId, { signals, digest, observed_at_ms }) {
  if (await dedupe(tabId, digest)) return { ok: true, deduped: true };
  const eventId = `ext-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const body = {
    event_id: eventId,
    source_id: SOURCE,
    observed_at_ms,
    modality: "TEXT",
    content_digest: digest,
    consent_grant_id: GRANT,
    sensitive_data_class: "PUBLIC",
    signals,
  };
  let st = await ensureConnected();
  try {
    await api("/v1/events", {
      token: st.token,
      method: "POST",
      idem: `extidem-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
      body,
    });
  } catch (e) {
    if (e.status === 401) {
      // Session died (restart/expiry): mint once and retry exactly once.
      st = await connect();
      await api("/v1/events", {
        token: st.token,
        method: "POST",
        idem: `extidem-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
        body,
      });
    } else {
      throw e;
    }
  }
  await setState({
    lastError: null,
    lastObservation: { event_id: eventId, signals, at_ms: Date.now() },
  });
  return { ok: true, event_id: eventId };
}

// Content-script registration: sites granted via chrome.permissions get
// the extractor auto-injected on every load (persistAcrossSessions) —
// observation survives reloads/navigation until the origin is revoked.
async function syncScripts() {
  const { origins } = await chrome.permissions.getAll();
  const base = await apiBase();
  const sites = (origins ?? []).filter((o) => !o.startsWith(base));
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ["sovir-observer"] });
  } catch {}
  if (!sites.length) return;
  await chrome.scripting.registerContentScripts([
    {
      id: "sovir-observer",
      matches: sites,
      js: ["extractor.js", "content.js"],
      persistAcrossSessions: true,
      runAt: "document_idle",
    },
  ]);
}
chrome.runtime.onStartup.addListener(syncScripts);
chrome.runtime.onInstalled.addListener(syncScripts);
chrome.permissions.onAdded.addListener(syncScripts);
chrome.permissions.onRemoved.addListener(syncScripts);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "get-state") {
    Promise.all([getState(), apiBase()])
      .then(([s, base]) =>
        sendResponse({
          ready: s.ready,
          principal: s.principal,
          paused: s.paused,
          lastError: s.lastError,
          lastObservation: s.lastObservation,
          api: base,
        }),
      )
      .catch(() => sendResponse({ ready: false }));
    return true;
  }
  if (message?.type === "set-paused") {
    setState({ paused: Boolean(message.paused) })
      .then((s) => sendResponse({ paused: s.paused }))
      .catch(() => sendResponse({ paused: false }));
    return true;
  }
  if (message?.type === "connect") {
    connect()
      .then((s) => sendResponse({ ready: s.ready, principal: s.principal }))
      .catch((e) => sendResponse({ ready: false, error: e.code ?? e.message }));
    return true;
  }
  if (message?.type === "observation") {
    getState()
      .then((st) => {
        if (st.paused) return { ok: true, paused: true };
        return emitEvent(sender.tab?.id ?? 0, message);
      })
      .then(sendResponse)
      .catch((e) =>
        setState({ lastError: e.code ?? e.message }).then(() =>
          sendResponse({ ok: false, error: e.code ?? e.message }),
        ),
      );
    return true;
  }
  return false;
});
