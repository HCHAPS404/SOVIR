// pitch/record_v3c.mjs — (a) extension popup re-grab with DOM ES->EN patch;
// (b) mobile-viewport console (English) for the phone segment.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
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
const CONSOLE_URL = "http://127.0.0.1:3001";
const results = {};

const src = readFileSync(path.join(ROOT, "pitch", "record_v3.mjs"), "utf8");
const tStart = src.indexOf("const TR = new Map") + "const TR = ".length;
const TR = eval(src.slice(tStart, src.indexOf("));", tStart) + 2));

const POP_EN = {
  "Protección activa": "Protection active",
  "Protección en pausa": "Protection paused",
  "Sin conexión": "No connection",
  "Observando las páginas que visitas en busca de riesgos.": "Watching the pages you visit for risks.",
  "Reanúdala para seguir protegido.": "Resume it to stay protected.",
  "No se pudo hablar con el servicio de SOVIR.": "Could not reach the SOVIR service.",
  "páginas revisadas": "pages reviewed", "señales vistas": "signals seen",
  "avisos": "alerts", "Pausar protección": "Pause protection",
  "Pausar": "Pause", "Ajustes": "Settings",
  "Esta pestaña no se puede observar": "This tab can't be observed",
  "No observar esta página": "Don't observe this page",
  "SOVIR lee solo señales de riesgo — nunca guarda tu contenido, contraseñas ni capturas.":
    "SOVIR reads risk signals only — never stores content, passwords or captures.",
  "Banca y redes sociales quedan fuera salvo que las actives en Ajustes.":
    "Banking and social media stay excluded unless you enable them in Settings.",
};
const POP_PATCH = `(() => {
  const M = ${JSON.stringify(POP_EN)};
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) { const t = M[n.nodeValue.trim()]; if (t) n.nodeValue = " " + t + " "; }
})()`;

// --- A: mobile console (headless, English, real alerts) ---
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const mctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true,
  recordVideo: { dir: OUT }, locale: "en-US",
});
await mctx.addCookies([{ name: "sovir_lang", value: "en", url: CONSOLE_URL }]);
await mctx.route("**://127.0.0.1:3001/**", async (route) => {
  const res = await route.fetch();
  if (!(res.headers()["content-type"] ?? "").includes("text/html")) return route.fulfill({ response: res });
  let body = await res.text();
  for (const [es, en] of TR) body = body.split(es).join(en);
  route.fulfill({ response: res, body });
});
const mp = await mctx.newPage();
try {
  const login = await mctx.newPage();
  await login.goto(CONSOLE_URL + "/sign-in", { waitUntil: "networkidle" });
  await login.evaluate(async () => {
    await fetch("/bff/session", { method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "principal=alex" });
  });
  await login.close();
  await mp.goto(CONSOLE_URL + "/incidents", { waitUntil: "networkidle" });
  await mp.waitForTimeout(9000);
  await mp.mouse.wheel(0, 500);
  await mp.waitForTimeout(7000);
  results.mobile = "ok";
} catch (e) { results.mobile = `error: ${e.message}`; }
const mv = mp.video();
await mp.close();
fs.renameSync(await mv.path(), path.join(OUT, "s7b_mobile_en.webm"));
await mctx.close();
await browser.close();

// --- B: popup EN via DOM patch (headed Opera, short) ---
const ctx = await chromium.launchPersistentContext("", {
  executablePath: OPERA, headless: false, viewport: null,
  recordVideo: { dir: OUT },
  args: ["--no-first-run", "--lang=en-US", "--window-size=460,680",
    `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
try {
  let sw = ctx.serviceWorkers().find((w) => w.url().includes("background.js"));
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  const popup = await ctx.newPage();
  await popup.setViewportSize({ width: 400, height: 620 });
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.evaluate(async () => {
    await chrome.storage.local.set({ "sovir-lang": "en", "sovir-principal": "console-alex" });
    return chrome.runtime.sendMessage({ type: "connect" });
  });
  await popup.waitForTimeout(2500);
  await popup.evaluate(POP_PATCH);   // translate hardcoded ES strings
  await popup.waitForTimeout(7000);
  const v = popup.video();
  await popup.close();
  fs.renameSync(await v.path(), path.join(OUT, "s7_opera_popup.webm"));
  results.popup_en2 = "ok";
} catch (e) { results.popup_en2 = `error: ${e.message}`; }
await ctx.close();
console.log(JSON.stringify(results, null, 2));
