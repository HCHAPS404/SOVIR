// SOVIR extension background service worker — the only piece that talks
// to the loopback API. Content scripts produce typed signals; this worker
// owns the session token (chrome.storage.session — never persisted),
// registers the device, holds the consent grant, and posts events.
//
// ADR-0014 invariant: nothing raw ever leaves the page. The event body
// carries a sha256 digest and the signal enum set — no DOM, no text.

const DEFAULT_API = "http://127.0.0.1:8787";
const API_URL_KEY = "sovir-api-url"; // storage.local — user setting
const PRINCIPAL_KEY = "sovir-principal"; // storage.local — console identity
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

// The console principal this extension reports under — configurable in
// options so observations land on the user's own account, not a demo one.
async function principalId() {
  const s = await chrome.storage.local.get(PRINCIPAL_KEY);
  return s[PRINCIPAL_KEY] || "ext-demo";
}

// ---------------------------------------------------------------------------
// OIDC Authorization Code + PKCE via chrome.identity.launchWebAuthFlow.
// Enabled only when issuer + client id are set in options — with neither,
// the extension keeps using the local dev-session path. The flow runs in
// the IdP's own web UI; the extension never sees the user's password.
// ---------------------------------------------------------------------------
const OIDC_ISSUER_KEY = "sovir-oidc-issuer";
const OIDC_CLIENT_KEY = "sovir-oidc-client";

const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function oidcConfig() {
  const s = await chrome.storage.local.get([OIDC_ISSUER_KEY, OIDC_CLIENT_KEY]);
  const issuer = (s[OIDC_ISSUER_KEY] || "").replace(/\/+$/, "");
  const clientId = s[OIDC_CLIENT_KEY] || "";
  return issuer && clientId ? { issuer, clientId } : null;
}

async function oidcLogin() {
  const cfg = await oidcConfig();
  if (!cfg || typeof chrome.identity?.launchWebAuthFlow !== "function") return null;
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
  );
  const redirectUri = chrome.identity.getRedirectURL();
  const url = new URL(`${cfg.issuer}/protocol/openid-connect/auth`);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile",
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  const redirected = await chrome.identity.launchWebAuthFlow({
    url: url.toString(),
    interactive: true,
  });
  const code = redirected ? new URL(redirected).searchParams.get("code") : null;
  if (!code) return null;
  const res = await fetch(`${cfg.issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cfg.clientId,
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) return null;
  const tokens = await res.json();
  return tokens.access_token || null;
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

// Mint a session + register device + consent for this source. Runs once
// per worker lifetime; re-calls are idempotent (stable device_id). When
// OIDC is configured the real IdP token is the bearer; otherwise the
// local dev-session path mints one.
async function connect() {
  let token;
  let principal;
  const oidcToken = await oidcLogin().catch(() => null);
  if (oidcToken) {
    token = oidcToken;
    principal = "oidc";
  } else {
    const session = await api("/v1/auth/dev-session", {
      method: "POST",
      body: { principal_id: await principalId(), device_id: DEVICE, tenant_id: "dev" },
    });
    token = session.token;
    principal = session.principal_id;
  }
  // Stable device_id: re-registration of the same id returns 409 and is
  // tolerated — the alternative (server-generated ids per connect) made
  // the device list grow without bound.
  await api("/v1/devices", {
    token,
    method: "POST",
    body: { device_id: DEVICE, platform: "BROWSER_EXTENSION", label: "Extensión de navegador" },
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
  return setState({ token, principal, ready: true, lastError: null });
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
