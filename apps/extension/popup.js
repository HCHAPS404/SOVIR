const heroEl = document.querySelector("#hero");
const heroState = document.querySelector("#hero-state");
const heroSub = document.querySelector("#hero-sub");
const siteEl = document.querySelector("#site");
const siteText = document.querySelector("#site-text");
const alertEl = document.querySelector("#alert");
const observeBtn = document.querySelector("#observe");
const includeBtn = document.querySelector("#include");
const excludeBtn = document.querySelector("#exclude");
const pauseBtn = document.querySelector("#pause");
const errorEl = document.querySelector("#error");
const stPages = document.querySelector("#st-pages");
const stSignals = document.querySelector("#st-signals");
const stWarns = document.querySelector("#st-warns");

let currentTab = null;
let siteReason = "unobservable";

// Friendly words for the council's typed hypotheses — consumers should
// never see enum names.
const SIGNAL_WORDS = {
  credential_request: "pide tus credenciales",
  payment_request: "pide datos de pago",
  authority_impersonation: "suplanta una marca conocida",
  gift_card_payment: "pide pagar con tarjetas regalo",
  seed_phrase_request: "pide tu frase semilla",
  urgency_pressure: "te presiona con urgencia",
  prize_lottery: "promete un premio",
  scareware: "simula un virus para asustarte",
  customs_fee: "cobra una aduana falsa",
};

function fmtTime(ms) {
  return new Date(ms).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

function friendlySignals(signals) {
  return (signals ?? []).map((s) => SIGNAL_WORDS[s] ?? s.replaceAll("_", " ")).join(", ");
}

async function paint() {
  const [tab, state, site] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => t),
    chrome.runtime.sendMessage({ type: "get-state" }),
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([t]) =>
        t?.url
          ? chrome.runtime
              .sendMessage({ type: "site-state", url: t.url })
              .catch(() => null)
          : null,
      ),
  ]);
  currentTab = tab;
  siteReason = site?.reason ?? "unobservable";

  // --- hero -------------------------------------------------------------
  if (!state?.ready) {
    heroState.textContent = "Sin conexión";
    heroSub.textContent = "No se pudo hablar con el servicio de SOVIR.";
  } else if (state.paused) {
    heroState.textContent = "Protección en pausa";
    heroSub.textContent = "Reanúdala para seguir protegido.";
  } else {
    heroState.textContent = "Protección activa";
    heroSub.textContent =
      site?.reason === "sensitive"
        ? "Este sitio está protegido: SOVIR no lo observa."
        : "Observando las páginas que visitas en busca de riesgos.";
  }
  heroEl.dataset.state = !state?.ready ? "off" : state.paused ? "paused" : "on";

  // --- stats ------------------------------------------------------------
  const stats = state?.stats ?? { observed: 0, signals: 0, warns: 0 };
  stPages.textContent = stats.observed;
  stSignals.textContent = stats.signals;
  stWarns.textContent = stats.warns;

  // --- this site ----------------------------------------------------------
  const host = currentTab?.url && /^https?:/.test(currentTab.url)
    ? new URL(currentTab.url).hostname
    : null;
  siteEl.dataset.state = siteReason;
  siteText.textContent = !host
    ? "Esta pestaña no se puede observar"
    : {
        observed: `Observando ${host}`,
        sensitive: `${host} está protegido por defecto — no se observa`,
        sensitive_included: `Observando ${host} — la incluiste aunque es sensible`,
        excluded: `Excluiste ${host} — no se observa`,
        not_granted: `${host} aún no está observado`,
        unobservable: "Esta pestaña no se puede observar",
      }[siteReason] ?? `${host} aún no está observado`;

  observeBtn.hidden = !(host && siteReason === "not_granted" && state?.ready && !state?.paused);

  // Voluntary per-site exclusion: on any observable page — while observed,
  // preventively when it isn't yet, and as the undo path when it sits on
  // the user's own blocklist. Not offered on sensitive hosts: those are
  // governed by the shield toggle in Options, not the per-site list.
  excludeBtn.hidden = !(
    host &&
    state?.ready &&
    siteReason !== "sensitive" &&
    siteReason !== "sensitive_included" &&
    siteReason !== "unobservable"
  );
  excludeBtn.textContent =
    siteReason === "excluded" ? "Volver a observarla" : "No observar esta página";

  // Per-site opt-in through the sensitive shield: "include this one" on a
  // protected host, or the undo path once included.
  includeBtn.hidden = !(
    host &&
    state?.ready &&
    (siteReason === "sensitive" || siteReason === "sensitive_included")
  );
  includeBtn.textContent =
    siteReason === "sensitive_included"
      ? "Volver a protegerla"
      : "Observarla de todos modos";

  // --- latest warning -----------------------------------------------------
  const d = state?.lastDecision;
  const obs = state?.lastObservation;
  if (d?.decision === "warn" && obs) {
    alertEl.hidden = false;
    alertEl.textContent = `Aviso ${fmtTime(d.at_ms)}: ${friendlySignals(obs.signals)} — riesgo ${d.risk_level}.`;
  } else {
    alertEl.hidden = true;
    alertEl.textContent = "";
  }

  pauseBtn.textContent = state?.paused ? "Reanudar protección" : "Pausar protección";
  pauseBtn.dataset.paused = state?.paused ? "true" : "false";
  errorEl.textContent = state?.lastError ? `Último error: ${state.lastError}` : "";
}

observeBtn.addEventListener("click", async () => {
  if (!currentTab?.url) return;
  const origin = new URL(currentTab.url).origin;
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) return;
  await chrome.scripting.executeScript({
    target: { tabId: currentTab.id },
    files: ["brand-domains.js", "extractor.js", "content.js"],
  });
  await paint();
});

// The user's own blocklist is the same store Options edits — the popup
// just toggles the current origin in it; syncScripts re-registers the
// exclusion on storage change, no extra plumbing.
const BLOCKLIST_KEY = "sovir-observe-blocklist";
excludeBtn.addEventListener("click", async () => {
  if (!currentTab?.url) return;
  const pattern = `${new URL(currentTab.url).origin}/*`;
  const s = await chrome.storage.local.get(BLOCKLIST_KEY);
  const list = s[BLOCKLIST_KEY] ?? [];
  const next = list.includes(pattern)
    ? list.filter((p) => p !== pattern)
    : [...list, pattern];
  await chrome.storage.local.set({ [BLOCKLIST_KEY]: next });
  await paint();
});

// Punch a single origin through the sensitive shield (or undo it). Same
// mechanism as the blocklist — a storage write that syncScripts picks up.
const SENSITIVE_ALLOW_KEY = "sovir-sensitive-allowed";
includeBtn.addEventListener("click", async () => {
  if (!currentTab?.url) return;
  const pattern = `${new URL(currentTab.url).origin}/*`;
  const s = await chrome.storage.local.get(SENSITIVE_ALLOW_KEY);
  const list = s[SENSITIVE_ALLOW_KEY] ?? [];
  const next = list.includes(pattern)
    ? list.filter((p) => p !== pattern)
    : [...list, pattern];
  await chrome.storage.local.set({ [SENSITIVE_ALLOW_KEY]: next });
  await paint();
});

pauseBtn.addEventListener("click", async () => {
  const paused = pauseBtn.dataset.paused !== "true";
  await chrome.runtime.sendMessage({ type: "set-paused", paused });
  await paint();
});

document.querySelector("#open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

paint().then(() => {
  // First open without a session: connect once, then repaint.
  chrome.runtime.sendMessage({ type: "get-state" }).then((s) => {
    if (!s?.ready) chrome.runtime.sendMessage({ type: "connect" }, paint);
  });
});
