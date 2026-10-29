"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { grantConsent, ingestEvent, registerDevice } from "./api";
import { ApiDown, ApiUnauthorized } from "./api";

const LAB_GRANT = "console-lab-grant";
const LAB_SOURCE = "console-lab";

async function tokenOrRedirect() {
  const jar = await cookies();
  const token = jar.get("sovir_api_token")?.value;
  if (!token) redirect("/sign-in");
  return token;
}

function rid(prefix: string) {
  return `${prefix}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

// Lab action: mints the shared synthetic consent grant (idempotent — the
// grant_id is stable so repeated clicks don't multiply grants).
export async function mintLabConsent(): Promise<void> {
  const token = await tokenOrRedirect();
  try {
    await grantConsent(token, LAB_GRANT, LAB_SOURCE, 24 * 60 * 60 * 1000);
  } catch (e) {
    // The grant_id is stable → the API's duplicate_event means the lab
    // consent already exists: safe idempotent success, not a failure.
    if (e instanceof Error && e.message === "duplicate_event") {
      revalidatePath("/");
      revalidatePath("/permissions");
      return;
    }
    if (e instanceof ApiUnauthorized) redirect("/sign-in?error=session");
    if (e instanceof ApiDown) redirect("/?error=backend");
    throw e;
  }
  revalidatePath("/");
  revalidatePath("/permissions");
}

// Lab action: emits the canonical hook→payment pair 1000ms apart — the
// deterministic path to a HookThenPayment sequence finding and a `warn`
// intervention. This is the full API loop exercisable from the browser.
export async function emitSequencePair(): Promise<void> {
  const token = await tokenOrRedirect();
  const now = Date.now();
  const base = {
    source_id: LAB_SOURCE,
    modality: "NOTIFICATION",
    content_digest: "sha256:console-lab",
    consent_grant_id: LAB_GRANT,
    sensitive_data_class: "PUBLIC",
  };
  try {
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
  revalidatePath("/");
  revalidatePath("/incidents");
  revalidatePath("/enterprise/audit");
}

export async function registerDeviceAction(formData: FormData): Promise<void> {
  const token = await tokenOrRedirect();
  const label = String(formData.get("label") ?? "").trim() || "Consola web";
  const platform = String(formData.get("platform") ?? "BROWSER_EXTENSION").trim();
  try {
    await registerDevice(token, platform, label);
  } catch (e) {
    if (e instanceof ApiUnauthorized) redirect("/sign-in?error=session");
    if (e instanceof ApiDown) redirect("/devices?error=backend");
    throw e;
  }
  revalidatePath("/devices");
}
