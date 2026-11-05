// pitch/record_v2.mjs — corrected pass: full English, 1080p, real shared
// identity (extension + console report under principal "alex"), real phish.
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
const SIZE = { width: 1920, height: 1080 };
const WHO = "alex";
fs.mkdirSync(OUT, { recursive: true });
const results = {};

// live reported phish
let live = [];
for (const feed of ["https://phishunt.io/feed.txt", "https://openphish.com/feed.txt"]) {
  try {
    const t = await (await fetch(feed, { headers: { "user-agent": "Mozilla/5.0" } })).text();
    live.push(...t.split("\n").map((u) => u.trim()).filter((u) => u.startsWith("http")));
  } catch {}
}
console.log("live phish:", live.length);

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
async function segment(name, fn) {
  const ctx = await browser.newContext({
    viewport: SIZE, recordVideo: { dir: OUT, size: SIZE }, locale: "en-US",
  });
  await ctx.addCookies([{ name: "sovir_lang", value: "en",
    url: CONSOLE_URL }]);
  const page = await ctx.newPage();
  try { await fn(page); } catch (e) { results[name] = `error: ${e.message}`; }
  const v = page.video();
  await page.close(); await ctx.close();
  if (v) {
    fs.renameSync(await v.path(), path.join(OUT, `${name}.webm`));
    if (!results[name]) results[name] = "ok";
  }
}
// Invisible dev-session: real sign-in page on camera, session via POST — the
// dev form never appears (same identity the extension reports under: "alex").
async function login(page) {
  await page.goto(`${CONSOLE_URL}/sign-in`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.evaluate(async (who) => {
    await fetch("/bff/session", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `principal=${who}`,
    });
  }, WHO);
  await page.goto(CONSOLE_URL, { waitUntil: "networkidle" });
}

// S2 — sign-in (real buttons) → panel, English
await segment("s2_signin_panel", async (page) => {
  await login(page);
  await page.waitForTimeout(7000);
});

// ---------- OPERA AIR pass: shared identity + real phish + FB + popup -------
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
    await popup.setViewportSize({ width: 420, height: 640 });
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    // English UI + console-shared identity BEFORE connect
    await popup.evaluate(async () => {
      await chrome.storage.local.set({ "sovir-lang": "en", "sovir-principal": "alex" });
      return chrome.runtime.sendMessage({ type: "connect" });
    });
    const page = await ctx.newPage();
    await page.bringToFront();
    await ctx.route(/\.(exe|msi|zip|apk|dmg|scr|bat|cmd|ps1|jar|rar|7z)(\?|$)/i, (r) => r.abort());
    await page.waitForTimeout(2000);

    const rec = spawn(FFMPEG, ["-y", "-f", "gdigrab", "-framerate", "30",
      "-i", "desktop", "-c:v", "libx264", "-preset", "ultrafast",
      "-pix_fmt", "yuv420p", path.join(OUT, "opera_window.mp4")],
      { stdio: ["pipe", "ignore", "ignore"] });
    await page.waitForTimeout(1500);

    try { // benign real app
      await page.goto("https://github.com/login", { waitUntil: "domcontentloaded", timeout: 25000 });
      await page.waitForTimeout(7000);
    } catch {}
    let visited = 0;
    for (const url of live.slice(0, 6)) {
      if (visited >= 2) break;
      try {
        console.log("opera visiting:", url);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 14000 });
        await page.waitForTimeout(6500);
        visited++;
      } catch {}
    }
    // REAL social network — protected-by-default demo
    try {
      await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(7000);
      await popup.bringToFront();
      await page.waitForTimeout(5000); // popup over FB: "protected by default"
    } catch {}
    // real event under shared identity
    await popup.evaluate(() =>
      chrome.runtime.sendMessage({
        type: "observation",
        signals: ["CREDENTIAL_REQUEST", "URGENT_ACTION", "IDENTITY_UNVERIFIED", "BRAND_IMPERSONATION"],
        digest: "sha256:v2-" + Date.now(),
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

// S3 — incidents AFTER the attacks (real events under "alex")
await segment("s3_incidents", async (page) => {
  await login(page);
  await page.goto(`${CONSOLE_URL}/incidents`, { waitUntil: "networkidle" });
  await page.waitForTimeout(9000);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(3000);
});

// S5 — incident detail
await segment("s5_incident_detail", async (page) => {
  await login(page);
  await page.goto(`${CONSOLE_URL}/incidents`, { waitUntil: "networkidle" });
  const link = page.locator("table a, .incident a, a[href*='incident']").first();
  if (await link.count()) { await link.click(); await page.waitForLoadState("networkidle"); }
  await page.waitForTimeout(12000);
  await page.mouse.wheel(0, 350);
  await page.waitForTimeout(3000);
});

// S6 — permissions (export + erasure), English
await segment("s6_permissions", async (page) => {
  await login(page);
  await page.goto(`${CONSOLE_URL}/permissions`, { waitUntil: "networkidle" });
  await page.waitForTimeout(8000);
  await page.mouse.wheel(0, 450);
  await page.waitForTimeout(5000);
});

await browser.close();
console.log(JSON.stringify(results, null, 2));
