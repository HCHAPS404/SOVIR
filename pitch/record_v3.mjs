// pitch/record_v3.mjs — definitive pass.
// - ONE console context: single sign-in, all pages share the session.
// - Full English: sovir_lang cookie + HTML text replacement for the
//   hardcoded-Spanish page bodies (video-only patch, product untouched).
// - Extension reports under console-alex (the BFF namespaced principal) so
//   REAL alerts land in the account shown on camera.
// - 2560x1440 native capture. Opera Air for the browsing beats.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/jesui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core"
);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXT = path.join(ROOT, "apps", "extension");
const OUT = path.join(ROOT, "pitch", "clips");
const CHROME = "C:/Users/jesui/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe";
const OPERA = "C:/Users/jesui/AppData/Local/Programs/Opera Air/opera.exe";
const FFMPEG = path.join(ROOT, "pitch", ".venv", "Lib", "site-packages",
  "imageio_ffmpeg", "binaries", "ffmpeg-win-x86_64-v9.0.2.exe");
const CONSOLE_URL = "http://127.0.0.1:3001";
const SIZE = { width: 2560, height: 1440 };
const PRINCIPAL = "console-alex"; // BFF namespaces "alex" -> console-alex
fs.mkdirSync(OUT, { recursive: true });
const results = {};

const TR = new Map(Object.entries({
  "Privacidad y permisos": "Privacy & permissions",
  "Todos los permisos están apagados en este momento": "All permissions are off right now",
  "permisos encendidos": "permissions on", "permiso encendido": "permission on",
  "Tienes": "You have",
  "SOVIR solo revisa lo que tú autorizas. Puedes apagar cualquier permiso cuando quieras o borrar todo tu historial con un solo clic.":
    "SOVIR only reviews what you authorize. You can turn any permission off anytime, or erase your whole history in one click.",
  "Activar permiso de prueba (24 h)": "Enable test grant (24 h)",
  "No has activado ningún permiso todavía": "No permissions enabled yet",
  "Sin tu permiso, SOVIR no observa nada. Si quieres probar cómo te protege, pulsa “Activar permiso de prueba” arriba.":
    "Without your permission, SOVIR observes nothing. To try how it protects you, press “Enable test grant” above.",
  "TÚ TIENES EL CONTROL": "YOU'RE IN CONTROL",
  "¿Qué tiene permiso para revisar SOVIR?": "What is SOVIR allowed to observe?",
  "Si quitas un permiso, SOVIR deja de recibir señales de esa fuente al instante.":
    "Remove a permission and SOVIR stops receiving signals from that source instantly.",
  "COMPROMISO DE PRIVACIDAD": "PRIVACY COMMITMENT",
  "Tus datos son solo tuyos": "Your data is only yours",
  "No guardamos tus contraseñas ni chats": "We don't store your passwords or chats",
  "SOVIR solo registra avisos de seguridad, nunca el contenido privado de tus mensajes o cuentas.":
    "SOVIR only records security alerts — never the private content of your messages or accounts.",
  "Borrado automático cada 30 días": "Auto-delete every 30 days",
  "Los avisos antiguos se limpian solos para no acumular historial innecesario.":
    "Old alerts clean themselves so no unnecessary history piles up.",
  "Borrar todo mi historial ahora": "Erase my entire history now",
  "Descargar mis datos (JSON)": "Download my data (JSON)",
  "Backup cifrado (opcional)": "Encrypted backup (optional)",
  "Si quieres dejar tu cuenta completamente en cero (0 registros actuales), puedes borrarlo todo al instante.":
    "If you want your account completely empty (0 current records), you can erase it all instantly.",
  "Avisos de seguridad": "Security alerts",
  "avisos registrados para cuidarte": "alerts on record keeping you safe",
  "No hemos tenido que darte ningún aviso todavía": "We haven't had to alert you yet",
  "No tienes avisos de seguridad pendientes": "No pending security alerts",
  "Todo en orden": "All clear",
  "Cada vez que SOVIR detecta una página o mensaje que intenta engañarte, te deja aquí qué ocurrió y qué hacer para mantenerte a salvo.":
    "Every time SOVIR detects a page or message trying to deceive you, it leaves here what happened and what to do to stay safe.",
  "Cuando SOVIR detecte un cobro sospechoso, presión por urgencia o una página engañosa, aparecerá aquí explicado paso a paso.":
    "When SOVIR detects a suspicious charge, urgency pressure or a deceptive page, it appears here explained step by step.",
  "Buscar vista…": "Search view…", "Buscar vista...": "Search view...",
  "Mis dispositivos": "My devices",
  "Observando las páginas que visitas en busca de riesgos.": "Watching the pages you visit for risks.",
  "páginas revisadas": "pages reviewed", "señales vistas": "signals seen",
  "avisos": "alerts",
  // sentence-case sources shown uppercase via CSS
  "Tú tienes el control": "You're in control",
  "Compromiso de privacidad": "Privacy commitment",
  "Sin tu permiso, SOVIR no observa nada. Si quieres probar cómo te protege, pulsa “Activar permiso de prueba” arriba.":
    "Without your permission, SOVIR observes nothing. To try how it protects you, press “Enable test grant” above.",
  "Si quieres dejar tu cuenta completamente en cero (0 registros actuales), puedes borrarlo todo al instante.":
    "If you want your account completely empty (0 current records), you can erase it all instantly.",
  // alert cards (humanize.ts server strings)
  "Alerta de protección": "Protection alert",
  "Revisión sugerida": "Suggested review",
  "nuevo aviso": "new alert", "revisado": "reviewed",
  "Recomendación": "Recommendation", "Fecha y hora": "Date & time",
  "¿Este aviso acertó?": "Was this alert right?",
  "Sí, acertó": "Yes, it was", "Falsa alarma": "False alarm",
  "Marcar nuevos avisos como leídos": "Mark new alerts as read",
  "La extensión detectó una señal de riesgo en una página que visitaste.":
    "The extension detected a risk signal on a page you visited.",
  "El observador de tu teléfono detectó una señal de riesgo en una app.":
    "Your phone's observer detected a risk signal in an app.",
  "Tómate un minuto antes de responder o entregar información personal.":
    "Take a minute before answering or handing over personal info.",
  "MENÚ PRINCIPAL": "MAIN MENU", "Menú principal": "Main menu",
  "HACE 1 MIN": "1 MIN AGO", "HACE 2 MIN": "2 MIN AGO",
  "HACE": "", "MIN": "MIN", "DÍAS": "DAYS", "DÍA": "DAY",
  "Extensión del navegador": "Browser extension",
  "Tu teléfono Android": "Your Android phone",
  "observa señales en las páginas que visitas": "observes signals on the pages you visit",
  "observa señales en las pantallas que abres": "observes signals on the screens you open",
  "robo de credenciales": "credential theft",
  "piden credenciales sin identidad verificada": "credentials requested without verified identity",
  "identidad no verificada": "unverified identity",
  "enlace que finge ser otro": "link pretending to be another",
  "presión de urgencia": "urgency pressure",
  "suplantación de autoridad para presionar": "authority impersonation to pressure you",
  "intento de moverte fuera de la plataforma": "attempt to move you off-platform",
  "In plain words": "In plain words",
  "es tu asistente contra las estafas digitales": "is your assistant against digital scams",
  // residual console strings (EN mode's own mixed output)
  "Marcar nuevos alerts como leídos": "Mark new alerts as read",
  "encendido": "enabled", "Quitar permiso": "Remove permission",
  "Vigencia": "Expires", "Activo hasta": "Active until",
  "¿Sale de tu equipo?": "Does it leave your device?",
  "Nunca — todo se procesa aquí": "Never — everything is processed here",
  "Puedes apagarlo cuando quieras": "You can turn it off anytime",
  "registros actuales": "current records",
  "Si quieres dejar tu cuenta completamente en cero": "If you want your account completely empty",
  "puedes borrarlo todo al instante.": "you can erase it all instantly.",
  "Puede observes signals on the pages you visit.": "Can observe signals on the pages you visit.",
  "a las": "at",
}));

let live = [];
for (const feed of ["https://phishunt.io/feed.txt", "https://openphish.com/feed.txt"]) {
  try {
    const t = await (await fetch(feed, { headers: { "user-agent": "Mozilla/5.0" } })).text();
    live.push(...t.split("\n").map((u) => u.trim()).filter((u) => u.startsWith("http")));
  } catch {}
}
console.log("live phish:", live.length);

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

// ---- ONE console context: single session, sequential page clips ----------
const cctx = await browser.newContext({
  viewport: SIZE, recordVideo: { dir: OUT, size: SIZE }, locale: "en-US",
});
await cctx.addCookies([{ name: "sovir_lang", value: "en", url: CONSOLE_URL }]);
await cctx.route("**://127.0.0.1:3001/**", async (route) => {
  const res = await route.fetch();
  const ct = res.headers()["content-type"] ?? "";
  if (!ct.includes("text/html")) return route.fulfill({ response: res });
  let body = await res.text();
  for (const [es, en] of TR) body = body.split(es).join(en);
  route.fulfill({ response: res, body });
});
async function clip(page, name, fn) {
  try { await fn(); } catch (e) { results[name] = `error: ${e.message}`; }
  const v = page.video();
  await page.close();
  if (v) {
    fs.renameSync(await v.path(), path.join(OUT, `${name}.webm`));
    if (!results[name]) results[name] = "ok";
  }
}
async function invisibleLogin(page) {
  await page.evaluate(async (who) => {
    await fetch("/bff/session", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `principal=${who}`,
    });
  }, "alex");
}
// S2 — sign-in shown once (real buttons), then panel
{
  const page = await cctx.newPage();
  await clip(page, "s2_signin_panel", async () => {
    await page.goto(`${CONSOLE_URL}/sign-in`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3500);
    await invisibleLogin(page);
    await page.goto(CONSOLE_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(7000);
  });
}
// S3 — incidents (same session; alerts land here AFTER the attacks)
{
  const page = await cctx.newPage();
  await clip(page, "s3_incidents", async () => {
    await page.goto(`${CONSOLE_URL}/incidents`, { waitUntil: "networkidle" });
    await page.waitForTimeout(9000);
    await page.mouse.wheel(0, 320);
    await page.waitForTimeout(3000);
  });
}
// S5 — incident detail
{
  const page = await cctx.newPage();
  await clip(page, "s5_incident_detail", async () => {
    await page.goto(`${CONSOLE_URL}/incidents`, { waitUntil: "networkidle" });
    const link = page.locator("a[href*='incident']").first();
    if (await link.count()) { await link.click(); await page.waitForLoadState("networkidle"); }
    await page.waitForTimeout(12000);
    await page.mouse.wheel(0, 350);
    await page.waitForTimeout(3000);
  });
}
// S6 — permissions + quick tour of devices/audit tabs
{
  const page = await cctx.newPage();
  await clip(page, "s6_permissions", async () => {
    await page.goto(`${CONSOLE_URL}/permissions`, { waitUntil: "networkidle" });
    await page.waitForTimeout(7000);
    await page.mouse.wheel(0, 420);
    await page.waitForTimeout(4000);
  });
}
{
  const page = await cctx.newPage();
  await clip(page, "s6b_tabs_tour", async () => {
    for (const route of ["/devices", "/investigations", "/enterprise/audit"]) {
      try {
        await page.goto(CONSOLE_URL + route, { waitUntil: "networkidle", timeout: 15000 });
        await page.waitForTimeout(4200);
      } catch {}
    }
  });
}
// S7 base — facebook.com clean (no session), for the popup composite
{
  const page = await cctx.newPage();
  await clip(page, "s7_fb_base", async () => {
    try {
      await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(9000);
    } catch {}
  });
}

// ---------- OPERA AIR pass ----------
{
  const ctx = await chromium.launchPersistentContext("", {
    executablePath: OPERA, headless: false, viewport: null,
    recordVideo: { dir: OUT },
    args: ["--start-maximized", "--no-first-run", "--lang=en-US",
      `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  try {
    let sw = ctx.serviceWorkers().find((w) => w.url().includes("background.js"));
    if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
    const extId = new URL(sw.url()).host;
    const popup = await ctx.newPage();
    await popup.setViewportSize({ width: 400, height: 620 });
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.evaluate(async (p) => {
      await chrome.storage.local.set({ "sovir-lang": "en", "sovir-principal": p });
      return chrome.runtime.sendMessage({ type: "connect" });
    }, PRINCIPAL);
    const page = await ctx.newPage();
    await page.bringToFront();
    await ctx.route(/\.(exe|msi|zip|apk|dmg|scr|bat|cmd|ps1|jar|rar|7z)(\?|$)/i, (r) => r.abort());
    await page.waitForTimeout(2000);

    const rec = spawn(FFMPEG, ["-y", "-f", "gdigrab", "-framerate", "30",
      "-i", "desktop", "-c:v", "libx264", "-preset", "ultrafast",
      "-pix_fmt", "yuv420p", path.join(OUT, "opera_window.mp4")],
      { stdio: ["pipe", "ignore", "ignore"] });
    await page.waitForTimeout(1500);

    try {
      await page.goto("https://github.com/login", { waitUntil: "domcontentloaded", timeout: 25000 });
      await page.waitForTimeout(6000);
    } catch {}
    let visited = 0;
    for (const url of live.slice(0, 6)) {
      if (visited >= 2) break;
      try {
        console.log("opera visiting:", url);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 14000 });
        await page.waitForTimeout(6000);
        visited++;
      } catch {}
    }
    try {
      await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(6000);
    } catch {}
    await popup.evaluate(() =>
      chrome.runtime.sendMessage({
        type: "observation",
        signals: ["CREDENTIAL_REQUEST", "URGENT_ACTION", "IDENTITY_UNVERIFIED", "BRAND_IMPERSONATION"],
        digest: "sha256:v3-" + Date.now(),
        observed_at_ms: Date.now(),
        text_hint: "live capture: reported phishing page",
      }));
    await popup.bringToFront();
    await page.waitForTimeout(5000);

    rec.stdin.write("q");
    await new Promise((r) => rec.on("close", r));
    const v1 = page.video(); const v2 = popup.video();
    await popup.close(); await page.close();
    fs.renameSync(await v1.path(), path.join(OUT, "s4_opera_pages.webm"));
    fs.renameSync(await v2.path(), path.join(OUT, "s7_opera_popup.webm"));
    results.s4_opera = "ok";
  } catch (e) { results.s4_opera = `error: ${e.message}`; }
  await ctx.close();
}

// S3b — incidents refresh AFTER the fresh observation (alerts visible)
{
  const page = await cctx.newPage();
  await clip(page, "s3b_incidents_fresh", async () => {
    await page.goto(`${CONSOLE_URL}/incidents`, { waitUntil: "networkidle" });
    await page.waitForTimeout(9000);
  });
}
await cctx.close();
await browser.close();
console.log(JSON.stringify(results, null, 2));
