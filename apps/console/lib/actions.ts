"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  ApiDown,
  ApiUnauthorized,
  assessInference,
  dispatchInterventions,
  enforceRetention,
  exportData,
  grantConsent,
  ingestEvent,
  type PrivacyMode,
  purgeData,
  registerDevice,
  revokeConsent,
  revokeDevice,
  registerWebhook,
  revokeWebhook,
  runInvestigation,
  sendEventFeedback,
} from "./api";

const LAB_SOURCE = "console-lab";
const SIM_SOURCE = "screen-observer:sim";

async function sessionOrRedirect() {
  const jar = await cookies();
  const token = jar.get("sovir_api_token")?.value;
  const principal = jar.get("sovir_api_principal")?.value ?? "console-user";
  if (!token) redirect("/sign-in");
  return { token, principal, jar };
}

function rid(prefix: string) {
  return `${prefix}-${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
}

async function activeGrantForSource(token: string, sourceId: string): Promise<string | null> {
  const data = await exportData(token);
  const now = Date.now();
  const active = data.grants.find(
    (g) => g.source_id === sourceId && !g.revoked && g.expires_at_ms > now,
  );
  return active?.grant_id ?? null;
}

// Lab action: ensures an active consent grant for `console-lab` owned by this principal.
export async function mintLabConsent(): Promise<void> {
  const { token, principal } = await sessionOrRedirect();
  try {
    const existing = await activeGrantForSource(token, LAB_SOURCE);
    if (!existing) {
      await grantConsent(
        token,
        `lab-${principal}-${crypto.randomUUID().slice(0, 6)}`,
        LAB_SOURCE,
        24 * 60 * 60 * 1000,
      );
    }
  } catch (e) {
    if (e instanceof ApiUnauthorized) redirect("/sign-in?error=session");
    if (e instanceof ApiDown) redirect("/?error=backend");
    throw e;
  }
  revalidatePath("/", "layout");
}

// Mints an active consent grant for `screen-observer:sim` owned by this principal.
export async function mintObserverConsentAction(): Promise<void> {
  const { token, principal } = await sessionOrRedirect();
  try {
    const existing = await activeGrantForSource(token, SIM_SOURCE);
    if (!existing) {
      await grantConsent(
        token,
        `sim-${principal}-${crypto.randomUUID().slice(0, 6)}`,
        SIM_SOURCE,
        24 * 60 * 60 * 1000,
      );
    }
  } catch (e) {
    if (e instanceof ApiUnauthorized) redirect("/sign-in?error=session");
    if (e instanceof ApiDown) redirect("/permissions?error=backend");
    throw e;
  }
  revalidatePath("/", "layout");
}

// Lab action: emits the canonical hook→payment pair 1000ms apart — the
// deterministic path to a HookThenPayment sequence finding and a `warn`
// intervention. Ensures an active lab grant exists for the current principal.
export async function emitSequencePair(): Promise<void> {
  const { token, principal } = await sessionOrRedirect();
  const now = Date.now();
  try {
    let grantId = await activeGrantForSource(token, LAB_SOURCE);
    if (!grantId) {
      grantId = `lab-${principal}-${crypto.randomUUID().slice(0, 6)}`;
      await grantConsent(token, grantId, LAB_SOURCE, 24 * 60 * 60 * 1000);
    }
    const base = {
      source_id: LAB_SOURCE,
      modality: "NOTIFICATION",
      content_digest: "sha256:console-lab",
      consent_grant_id: grantId,
      sensitive_data_class: "PUBLIC",
    };
    await ingestEvent(
      token,
      { ...base, event_id: rid("hook"), observed_at_ms: now - 1000, signals: ["URGENT_ACTION"] },
      rid("idem-h"),
    );
    await ingestEvent(
      token,
      {
        ...base,
        event_id: rid("pay"),
        observed_at_ms: now,
        signals: ["PAYMENT_REQUEST", "IDENTITY_UNVERIFIED"],
      },
      rid("idem-p"),
    );
  } catch (e) {
    if (e instanceof ApiUnauthorized) redirect("/sign-in?error=session");
    if (e instanceof ApiDown) redirect("/?error=backend");
    throw e;
  }
  revalidatePath("/", "layout");
}

// Lab action: exercises the screen-observer contract (ADR-0014) — a
// UI_TREE modality event carrying typed signals.
export async function emitUiTreeObservation(): Promise<void> {
  const { token, principal } = await sessionOrRedirect();
  try {
    let grantId = await activeGrantForSource(token, SIM_SOURCE);
    if (!grantId) {
      grantId = `sim-${principal}-${crypto.randomUUID().slice(0, 6)}`;
      await grantConsent(token, grantId, SIM_SOURCE, 24 * 60 * 60 * 1000);
    }
    await ingestEvent(
      token,
      {
        event_id: rid("uit"),
        source_id: SIM_SOURCE,
        observed_at_ms: Date.now(),
        modality: "UI_TREE",
        content_digest: "sha256:sim-ui-tree",
        consent_grant_id: grantId,
        sensitive_data_class: "PUBLIC",
        signals: ["CONSENT_DARK_PATTERN", "IDENTITY_UNVERIFIED"],
      },
      rid("idem-u"),
    );
  } catch (e) {
    if (e instanceof ApiUnauthorized) redirect("/sign-in?error=session");
    if (e instanceof ApiDown) redirect("/?error=backend");
    throw e;
  }
  revalidatePath("/", "layout");
}

// View toggle: user (plain language only) <-> dev (shows technical ids).
export async function toggleView(): Promise<void> {
  const jar = await cookies();
  const next = jar.get("sovir_console_view")?.value === "dev" ? "user" : "dev";
  jar.set("sovir_console_view", next, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
  });
  revalidatePath("/", "layout");
}

export async function registerDeviceAction(formData: FormData): Promise<void> {
  const { token } = await sessionOrRedirect();
  const label = String(formData.get("label") ?? "").trim() || "Consola web";
  const platform = String(formData.get("platform") ?? "BROWSER_EXTENSION").trim();
  try {
    await registerDevice(token, platform, label);
  } catch (e) {
    if (e instanceof ApiUnauthorized) redirect("/sign-in?error=session");
    if (e instanceof ApiDown) redirect("/devices?error=backend");
    throw e;
  }
  revalidatePath("/", "layout");
}

// What a real client does on first run: registers itself under the session.
export async function connectThisDeviceAction(): Promise<void> {
  const { token } = await sessionOrRedirect();
  try {
    await registerDevice(token, "BROWSER_EXTENSION", "Este navegador");
  } catch (e) {
    if (e instanceof ApiUnauthorized) redirect("/sign-in?error=session");
    if (e instanceof ApiDown) redirect("/devices?error=backend");
    throw e;
  }
  revalidatePath("/", "layout");
}

export async function revokeDeviceAction(formData: FormData): Promise<void> {
  const { token } = await sessionOrRedirect();
  const deviceId = String(formData.get("device_id") ?? "").trim();
  if (!deviceId) redirect("/devices");
  try {
    await revokeDevice(token, deviceId);
  } catch (e) {
    if (e instanceof ApiUnauthorized) redirect("/sign-in?error=session");
    if (e instanceof ApiDown) redirect("/devices?error=backend");
    throw e;
  }
  revalidatePath("/", "layout");
}

export async function revokeConsentAction(formData: FormData): Promise<void> {
  const { token } = await sessionOrRedirect();
  const grantId = String(formData.get("grant_id") ?? "").trim();
  if (!grantId) redirect("/permissions");
  try {
    await revokeConsent(token, grantId);
  } catch (e) {
    if (e instanceof ApiUnauthorized) redirect("/sign-in?error=session");
    if (e instanceof ApiDown) redirect("/permissions?error=backend");
    throw e;
  }
  revalidatePath("/", "layout");
}

// Dispatches due pending interventions (`POST /v1/interventions/dispatch`).
export async function dispatchInterventionsAction(): Promise<void> {
  const { token } = await sessionOrRedirect();
  try {
    await dispatchInterventions(token);
  } catch (e) {
    if (e instanceof ApiUnauthorized) redirect("/sign-in?error=session");
    if (e instanceof ApiDown) redirect("/incidents?error=backend");
    throw e;
  }
  revalidatePath("/", "layout");
}

// Runs a deterministic investigation sweep (`POST /v1/investigations`).
export async function runInvestigationAction(formData: FormData): Promise<void> {
  const { token } = await sessionOrRedirect();
  const rawWindow = Number(formData.get("window_ms") ?? 60 * 60 * 1000);
  const windowMs = Number.isFinite(rawWindow) && rawWindow > 0 ? rawWindow : 60 * 60 * 1000;
  try {
    await runInvestigation(token, windowMs);
  } catch (e) {
    if (e instanceof ApiUnauthorized) redirect("/sign-in?error=session");
    if (e instanceof ApiDown) redirect("/investigations?error=backend");
    throw e;
  }
  revalidatePath("/", "layout");
}

// Evaluates risk signals via `/v1/inference/assess` in Private (local heuristic)
// or Standard (remote Meta gateway, fail-closed in record mode).
export async function assessInferenceAction(formData: FormData): Promise<void> {
  const { token, jar } = await sessionOrRedirect();
  const privacyRaw = String(formData.get("privacy") ?? "private");
  const privacy: PrivacyMode = privacyRaw === "standard" ? "standard" : "private";
  const preset = String(formData.get("preset") ?? "phishing");
  const signals =
    preset === "dark_pattern"
      ? ["CONSENT_DARK_PATTERN", "HIDDEN_FEE_PATTERN", "TRACKING_OBSERVED"]
      : preset === "payment_scam"
        ? ["URGENT_ACTION", "PAYMENT_REQUEST", "IDENTITY_UNVERIFIED"]
        : ["CREDENTIAL_REQUEST", "URGENT_ACTION", "IDENTITY_UNVERIFIED"];
  const reqId = rid("inf");
  try {
    const verdict = await assessInference(token, reqId, signals, privacy);
    jar.set(
      "sovir_last_inference",
      JSON.stringify({
        ok: true,
        privacy,
        signals,
        at_ms: Date.now(),
        verdict,
      }),
      { httpOnly: true, sameSite: "lax", secure: false, path: "/" },
    );
  } catch (e) {
    if (e instanceof ApiUnauthorized) redirect("/sign-in?error=session");
    if (e instanceof ApiDown) redirect("/investigations?error=backend");
    const code = e instanceof Error ? e.message : "provider_unavailable";
    jar.set(
      "sovir_last_inference",
      JSON.stringify({
        ok: false,
        privacy,
        signals,
        at_ms: Date.now(),
        error: code,
      }),
      { httpOnly: true, sameSite: "lax", secure: false, path: "/" },
    );
  }
  revalidatePath("/investigations");
  revalidatePath("/", "layout");
}

// Per-event analysis from /incidents: runs `/v1/inference/assess` with the
// event's own typed signals (never content), keyed by event id so the
// verdict lands next to its card. Standard privacy => remote provider.
export async function assessEventSignalsAction(formData: FormData): Promise<void> {
  const { token, jar } = await sessionOrRedirect();
  const eventId = String(formData.get("event_id") ?? "").slice(0, 64);
  const privacy: PrivacyMode = formData.get("privacy") === "standard" ? "standard" : "private";
  const signals = String(formData.get("signals") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
  if (!eventId || signals.length === 0) return;
  try {
    const verdict = await assessInference(token, rid("inf"), signals, privacy);
    jar.set(
      "sovir_last_inference",
      JSON.stringify({ ok: true, privacy, signals, event_id: eventId, at_ms: Date.now(), verdict }),
      { httpOnly: true, sameSite: "lax", secure: false, path: "/" },
    );
  } catch (e) {
    if (e instanceof ApiUnauthorized) redirect("/sign-in?error=session");
    if (e instanceof ApiDown) redirect("/incidents?error=backend");
    const code = e instanceof Error ? e.message : "provider_unavailable";
    jar.set(
      "sovir_last_inference",
      JSON.stringify({ ok: false, privacy, signals, event_id: eventId, at_ms: Date.now(), error: code }),
      { httpOnly: true, sameSite: "lax", secure: false, path: "/" },
    );
  }
  revalidatePath("/incidents");
  revalidatePath("/", "layout");
}

// Human verdict on one of the caller's own events (POST /v1/events/{id}/feedback).
// Labels feed the eval loop; a foreign or missing event is refused upstream.
export async function sendEventFeedbackAction(formData: FormData): Promise<void> {
  const { token } = await sessionOrRedirect();
  const eventId = String(formData.get("event_id") ?? "").slice(0, 64);
  const raw = String(formData.get("verdict") ?? "");
  const verdict =
    raw === "correct" || raw === "false_positive" || raw === "unsure" ? raw : null;
  if (!eventId || !verdict) return;
  try {
    await sendEventFeedback(token, eventId, verdict);
  } catch (e) {
    if (e instanceof ApiUnauthorized) redirect("/sign-in?error=session");
    if (e instanceof ApiDown) redirect("/incidents?error=backend");
    throw e;
  }
  revalidatePath("/incidents");
  revalidatePath("/", "layout");
}

// Registers a signed webhook endpoint (POST /v1/webhooks). The URL must
// pass the server-side egress allowlist — a refused host fails closed.
export async function registerWebhookAction(formData: FormData): Promise<void> {
  const { token } = await sessionOrRedirect();
  const url = String(formData.get("url") ?? "").trim().slice(0, 512);
  const kinds = (["notify", "warn_banner", "require_review"] as const).filter((k) =>
    formData.getAll("kinds").includes(k),
  );
  if (!url || kinds.length === 0) return;
  try {
    await registerWebhook(token, url, [...kinds]);
  } catch (e) {
    if (e instanceof ApiUnauthorized) redirect("/sign-in?error=session");
    if (e instanceof ApiDown) redirect("/webhooks?error=backend");
    throw e;
  }
  revalidatePath("/webhooks");
  revalidatePath("/", "layout");
}

export async function revokeWebhookAction(formData: FormData): Promise<void> {
  const { token } = await sessionOrRedirect();
  const endpointId = String(formData.get("endpoint_id") ?? "").trim();
  if (!endpointId) redirect("/webhooks");
  try {
    await revokeWebhook(token, endpointId);
  } catch (e) {
    if (e instanceof ApiUnauthorized) redirect("/sign-in?error=session");
    if (e instanceof ApiDown) redirect("/webhooks?error=backend");
    throw e;
  }
  revalidatePath("/webhooks");
  revalidatePath("/", "layout");
}

export async function enforceRetentionAction(): Promise<void> {
  const { token } = await sessionOrRedirect();
  try {
    await enforceRetention(token);
  } catch (e) {
    if (e instanceof ApiUnauthorized) redirect("/sign-in?error=session");
    if (e instanceof ApiDown) redirect("/permissions?error=backend");
    throw e;
  }
  revalidatePath("/", "layout");
}

export async function purgeDataAction(): Promise<void> {
  const { token } = await sessionOrRedirect();
  try {
    await purgeData(token);
  } catch (e) {
    if (e instanceof ApiUnauthorized) redirect("/sign-in?error=session");
    if (e instanceof ApiDown) redirect("/permissions?error=backend");
    throw e;
  }
  revalidatePath("/", "layout");
}
