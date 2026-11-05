// pitch/record_v3b.mjs — console-only re-capture (headless, fast): reuses the
// TR map + single-session flow; also re-grabs the popup page in ENGLISH.
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
const SIZE = { width: 2560, height: 1440 };
const results = {};

// reuse the TR map literal from record_v3.mjs
const src = readFileSync(path.join(ROOT, "pitch", "record_v3.mjs"), "utf8");
const tStart = src.indexOf("const TR = new Map") + "const TR = ".length;
const TR = eval(src.slice(tStart, src.indexOf("));", tStart) + 2));

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const cctx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT, size: SIZE }, locale: "en-US" });
await cctx.addCookies([{ name: "sovir_lang", value: "en", url: CONSOLE_URL }]);
await cctx.route("**://127.0.0.1:3001/**", async (route) => {
  const res = await route.fetch();
  if (!(res.headers()["content-type"] ?? "").includes("text/html")) return route.fulfill({ response: res });
  let body = await res.text();
  for (const [es, en] of TR) body = body.split(es).join(en);
  body = body.replace(/HACE (\d+) MIN/g, "$1 MIN AGO").replace(/HACE (\d+) D[IÍ]AS?/g, "$1 DAYS AGO");
  route.fulfill({ response: res, body });
});
async function clip(name, path_, wait, scroll = 0) {
  const page = await cctx.newPage();
  try {
    await page.goto(CONSOLE_URL + path_, { waitUntil: "networkidle" });
    if (path_ === "/sign-in") {
      await page.waitForTimeout(3000);
      await page.evaluate(async () => {
        await fetch("/bff/session", { method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: "principal=alex" });
      });
      await page.goto(CONSOLE_URL, { waitUntil: "networkidle" });
    }
    await page.waitForTimeout(wait);
    if (scroll) { await page.mouse.wheel(0, scroll); await page.waitForTimeout(3000); }
    results[name] = "ok";
  } catch (e) { results[name] = `error: ${e.message}`; }
  const v = page.video();
  await page.close();
  fs.renameSync(await v.path(), path.join(OUT, `${name}.webm`));
}
await clip("s2_signin_panel", "/sign-in", 6000);
await clip("s3b_incidents_fresh", "/incidents", 11000, 300);
await clip("s5_incident_detail", "/incidents", 12000, 300);
await clip("s6_permissions", "/permissions", 9000, 400);
await cctx.close();

// popup re-grab in ENGLISH (headed Opera, set lang then reload)
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
  await popup.reload({ waitUntil: "networkidle" }); // re-render in EN
  await popup.waitForTimeout(8000);
  const v = popup.video();
  await popup.close();
  fs.renameSync(await v.path(), path.join(OUT, "s7_opera_popup.webm"));
  results.popup_en = "ok";
} catch (e) { results.popup_en = `error: ${e.message}`; }
await ctx.close();
await browser.close();
console.log(JSON.stringify(results, null, 2));
