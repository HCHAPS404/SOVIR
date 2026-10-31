import "server-only";

// Server-side client for the SOVIR dev API (backend-dev.v0). Every call
// runs inside a RSC/route handler — the bearer token lives in an httpOnly
// cookie and never reaches the browser. No CORS needed: the console is the
// only client and it talks server-to-server on loopback.
//
// Types mirror packages/contracts/openapi/backend-dev.v0.yaml exactly —
// if the contract changes, these change (they are checked by hand today;
// generation from the YAML is the follow-up).

export type Scope = "consent_write" | "events_write" | "devices_write" | "sessions_write";

export interface Principal {
  principal_id: string;
  tenant_id: string;
  device_id: string;
  session_id: string;
  scopes: Scope[];
}

export interface DevSessionResponse {
  token: string;
  session_id: string;
  principal_id: string;
  tenant_id: string;
  device_id: string;
  scopes: Scope[];
  expires_at_ms: number;
  revoked: boolean;
}

export interface Device {
  device_id: string;
  principal_id: string;
  tenant_id: string;
  platform: string;
  label: string;
  registered_at_ms: number;
  revoked_at_ms: number | null;
}

export interface Intervention {
  intervention_id: string;
  event_id: string;
  principal_id: string;
  tenant_id: string;
  device_id: string;
  kind: string;
  state: "pending" | "delivered" | "failed" | "cancelled";
  attempts: number;
  next_attempt_at_ms: number;
  created_at_ms: number;
  last_error: string | null;
  audit: { from: string; to: string; detail: string }[];
}

export interface AuditEvent {
  audit_id: string;
  tenant_id: string;
  principal_id: string;
  action: string;
  detail: string;
  at_ms: number;
}

export interface ConsentGrant {
  grant_id: string;
  source_id: string;
  scopes: string[];
  issued_at_ms: number;
  expires_at_ms: number;
  revoked: boolean;
}

export interface ObservedEvent {
  event_id: string;
  source_id: string;
  observed_at_ms: number;
  modality: string;
  content_digest: string;
  consent_grant_id: string;
  sensitive_data_class: string;
  signals: string[];
}

export interface PrincipalDataExport {
  principal_id: string;
  grants: ConsentGrant[];
  events: ObservedEvent[];
  devices: Device[];
  interventions: Intervention[];
  deletion_receipts: unknown[];
  audit_events: AuditEvent[];
}

export interface ApiErrorBody {
  error?: { code: string; request_id: string; retryable: boolean };
}

const BASE = process.env.SOVIR_API_URL ?? "http://127.0.0.1:8787";

export class ApiDown extends Error {}
export class ApiUnauthorized extends Error {}

async function call<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiDown(`SOVIR API unreachable at ${BASE}`);
  }
  if (res.status === 401) throw new ApiUnauthorized();
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
    throw new Error(body.error?.code ?? `http_${res.status}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// --- unauthenticated ---

export const apiVersion = () =>
  call<{ version: string; contract: string; build_sha: string }>("/v1/version", null);

export const devSession = (principalId: string, deviceId: string, tenantId = "dev") =>
  call<DevSessionResponse>("/v1/auth/dev-session", null, {
    method: "POST",
    body: JSON.stringify({ principal_id: principalId, device_id: deviceId, tenant_id: tenantId }),
  });

export const logout = (token: string) =>
  call<void>("/v1/auth/logout", token, { method: "POST" }).catch(() => undefined);

// --- authenticated ---

export const whoami = (t: string) => call<Principal>("/v1/auth/whoami", t);
export const listDevices = (t: string) => call<Device[]>("/v1/devices", t);
export const listInterventions = (t: string, limit = 50) =>
  call<Intervention[]>(`/v1/interventions?limit=${limit}`, t);
export const listAudit = (t: string, limit = 50) =>
  call<AuditEvent[]>(`/v1/me/audit?limit=${limit}`, t);
export const exportData = (t: string) => call<PrincipalDataExport>("/v1/me/data", t);
export const listEvents = (t: string, limit = 50) =>
  call<ObservedEvent[]>(`/v1/events?limit=${limit}`, t);

export const registerDevice = (t: string, platform: string, label: string) =>
  call<Device>("/v1/devices", t, {
    method: "POST",
    body: JSON.stringify({ platform, label }),
  });

export const grantConsent = (t: string, grantId: string, sourceId: string, ttlMs: number) =>
  call<void>("/v1/consents", t, {
    method: "POST",
    body: JSON.stringify({ grant_id: grantId, source_id: sourceId, expires_at_ms: Date.now() + ttlMs }),
  });

export const ingestEvent = (t: string, event: ObservedEvent, idemKey: string) =>
  call<unknown>("/v1/events", t, {
    method: "POST",
    headers: { "idempotency-key": idemKey },
    body: JSON.stringify(event),
  });
