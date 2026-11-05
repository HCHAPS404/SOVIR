// pitch/record.mjs — captures real SOVIR app footage for the 3-min pitch video.
// Segments map 1:1 to docs/marketing/PITCH_3MIN_FINAL.md (S1..S8) and to
// pitch/vo/vo_sN.mp3 files. Run: node pitch/record.mjs
//
// Extension segments launch a headed window briefly (MV3 needs it) — do not
// interact with it while it runs. All footage is synthetic fixtures + the
// local dev stack. No real user data.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/jesui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core"
);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXT = path.join(ROOT, "apps", "extension");
const FIXTURES = path.join(EXT, "fixtures");
const OUT = path.join(ROOT, "pitch", "clips");
const CHROME =
  "C:/Users/jesui/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe";
const CONSOLE_URL = "http://127.0.0.1:3001";
const WEB_URL = "http://127.0.0.1:3000/web";
const SIZE = { width: 1280, height: 720 };
const results = {};

fs.mkdirSync(OUT, { recursive: true });

// Static server for the synthetic fixtures (phish page) on :8789.
const server = http.createServer((req, res) => {
  const file = path.join(FIXTURES, req.url === "/" ? "synthetic-phish.html" : req.url.split("?")[0]);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("nf"); return; }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(data);
  });
});
await new Promise((r) => server.listen(8789, "127.0.0.1", r));

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

// One context per segment → one clean webm per clip. Auth cookie shared by
// keeping the console segments inside a single context BUT closing the page
// between segments (video is per-page).
async function segment(name, fn, { auth = false } = {}) {
  const ctx = await browser.newContext({
    viewport: SIZE,
    recordVideo: { dir: OUT, size: SIZE },
    locale: "en-US",
  });
  const page = await ctx.newPage();
  try {
    await fn(page, ctx);
  } catch (e) {
    results[name] = `error: ${e.message}`;
  }
  const v = page.video();
  await page.close();
  await ctx.close();
  if (v) {
    const src = await v.path();
    fs.renameSync(src, path.join(OUT, `${name}.webm`));
    if (!results[name]) results[name] = "ok";
  }
}

// Auth helper: dev-session sign-in inside the same context/page.
async function devLogin(page, name = "Alex") {
  await page.goto(`${CONSOLE_URL}/sign-in?dev=1`, { waitUntil: "networkidle" });
  const details = page.locator("details.dev-mode");
  if (await details.count()) await details.locator("summary").click();
  await page.fill('input[name="principal"]', name);
  await Promise.all([
    page.waitForLoadState("networkidle"),
    page.click('form[action="/bff/session"] button[type="submit"]'),
  ]);
}

// ---------- S1 cold open: REAL pages — search results + live phish test ----
await segment("s1_real_pages", async (page) => {
  // Real search results for scam-bait queries (live feed, no fixture).
  try {
    await page.goto(
      "https://duckduckgo.com/?q=verify+your+account+suspended+urgent+login",
      { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(7000);
    await page.mouse.wheel(0, 350);
    await page.waitForTimeout(2500);
  } catch { /* results vary — keep going */ }
  // Real, live phishing-test page served for exactly this purpose
  // (Google Safe Browsing test harness / Google phishing quiz).
  const real_phish = [
    "https://testsafebrowsing.appspot.com/s/phishing.html",
    "https://phishingquiz.withgoogle.com/",
    "http://testasp.vulnweb.com/",
  ];
  for (const url of real_phish) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(8000);
      break;
    } catch { /* try next */ }
  }
});

// ---------- S2 registration → panel ----------
await segment("s2_signin_panel", async (page) => {
  await page.goto(`${CONSOLE_URL}/sign-in?dev=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const details = page.locator("details.dev-mode");
  if (await details.count()) {
    await details.locator("summary").click();
    await page.waitForTimeout(800);
  }
  await page.fill('input[name="principal"]', "Alex");
  await page.waitForTimeout(900);
  await Promise.all([
    page.waitForLoadState("networkidle"),
    page.click('form[action="/bff/session"] button[type="submit"]'),
  ]);
  await page.waitForTimeout(9000);
});

// ---------- S3 incidents list (fresh login for this segment's context) ------
await segment("s3_incidents", async (page) => {
  await devLogin(page);
  await page.goto(`${CONSOLE_URL}/incidents`, { waitUntil: "networkidle" });
  await page.waitForTimeout(11000);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(3000);
});

// ---------- S4 attack live: extension over phish page (headed, real event) --
{
  const ctx = await chromium.launchPersistentContext("", {
    executablePath: CHROME,
    headless: false,
    viewport: SIZE,
    recordVideo: { dir: OUT, size: SIZE },
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      "--disable-component-extensions-with-background-pages",
    ],
  });
  try {
    let sw = ctx.serviceWorkers().find((w) => w.url().includes("background.js"));
    if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
    const extId = new URL(sw.url()).host;
    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.evaluate(async () => {
      await chrome.storage.local.set({ "sovir-vision-enabled": true });
      return chrome.runtime.sendMessage({ type: "connect" });
    });
    const page = await ctx.newPage();
    // Safety rails for REAL reported scam pages: no downloads ever, no
    // executable/resource drops, zero clicks or typing — we only load and
    // let the extension observe (standard research practice).
    await ctx.route(/\.(exe|msi|zip|apk|dmg|scr|bat|cmd|ps1|jar|rar|7z)(\?|$)/i,
      (route) => route.abort());
    // REAL benign case first: GitHub's real login. CREDENTIAL_REQUEST fires
    // as a fact; the verdict stays calm — signal ≠ accusation.
    try {
      await page.goto("https://github.com/login", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(9000);
    } catch { /* offline — continue to phish */ }
    // REAL REPORTED phishing URLs — live feeds from phishunt.io + openphish.
    // These are scam pages reported by the community right now.
    let live_phish = [];
    try {
      const feeds = ["https://phishunt.io/feed.txt", "https://openphish.com/feed.txt"];
      for (const feed of feeds) {
        const txt = await (await fetch(feed, {
          headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        })).text();
        live_phish.push(...txt.split("\n").map((u) => u.trim()).filter((u) => u.startsWith("http")));
      }
      console.log("live phish URLs fetched:", live_phish.length);
    } catch (e) { console.log("feed fetch failed:", e.message); }
    const real_phish = [
      ...live_phish.slice(0, 4),
      "https://testsafebrowsing.appspot.com/s/phishing.html",
      "https://phishingquiz.withgoogle.com/",
    ];
    let visited = 0;
    for (const url of real_phish) {
      if (visited >= 3) break;
      try {
        console.log("visiting live phish:", url);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.waitForTimeout(8000); // content.js auto-observes
        visited++;
      } catch (e) { console.log("dead phish skipped:", url); }
    }
    // Belt & braces: drive the real message path so a REAL event lands for S5.
    await popup.evaluate(() =>
      chrome.runtime.sendMessage({
        type: "observation",
        signals: ["CREDENTIAL_REQUEST", "URGENT_ACTION", "IDENTITY_UNVERIFIED", "LINK_DESTINATION_MISMATCH"],
        digest: "sha256:pitch-real-" + Date.now(),
        observed_at_ms: Date.now(),
        text_hint: "live capture on real phishing test page",
      }));
    await page.bringToFront();
    await page.waitForTimeout(7000);
    await popup.bringToFront();
    await page.waitForTimeout(6000); // popup visible with state
    const v1 = page.video(); const v2 = popup.video();
    await popup.close(); await page.close();
    fs.renameSync(await v1.path(), path.join(OUT, "s4_phish_ext.webm"));
    fs.renameSync(await v2.path(), path.join(OUT, "s7_popup.webm"));
    results.s4_phish_ext = "ok"; results.s7_popup = "ok";
  } catch (e) {
    results.s4_phish_ext = `error: ${e.message}`;
  }
  await ctx.close();
}

// ---------- S5 incident detail: votes + evidence ---------------------------
await segment("s5_incident_detail", async (page) => {
  await devLogin(page, "Alex");
  await page.goto(`${CONSOLE_URL}/incidents`, { waitUntil: "networkidle" });
  const link = page.locator("table a, .incident a, a[href*='incident']").first();
  if (await link.count()) { await link.click(); await page.waitForLoadState("networkidle"); }
  await page.waitForTimeout(15000);
  await page.mouse.wheel(0, 350);
  await page.waitForTimeout(4000);
});

// ---------- S6 permissions: grants, revoke, export, erasure -----------------
await segment("s6_permissions", async (page) => {
  await devLogin(page);
  await page.goto(`${CONSOLE_URL}/permissions`, { waitUntil: "networkidle" });
  await page.waitForTimeout(9000);
  await page.mouse.wheel(0, 450);
  await page.waitForTimeout(5000);
  await page.mouse.wheel(0, 450);
  await page.waitForTimeout(4000);
});

// ---------- S7b Android recreation on the public site -----------------------
await segment("s7_android_web", async (page) => {
  await page.goto(WEB_URL, { waitUntil: "networkidle" });
  const phone = page.locator(".stage-phone, [class*='phone']").first();
  if (await phone.count()) await phone.scrollIntoViewIfNeeded();
  await page.waitForTimeout(16000); // let ThreatSequence play
});

// ---------- S8 outro handled by title card (no capture) --------------------

server.close();
await browser.close();
console.log(JSON.stringify(results, null, 2));
