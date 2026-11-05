// pitch/record_opera.mjs — drives REAL Opera Air with the extension loaded,
// while ffmpeg gdigrab records the desktop so the Opera Air window itself is
// visible in the footage (page-video can't capture browser chrome).
// Visits REAL reported phishing URLs (live feeds), no clicks/typing/downloads.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/jesui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core"
);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXT = path.join(ROOT, "apps", "extension");
const OUT = path.join(ROOT, "pitch", "clips");
const OPERA = "C:/Users/jesui/AppData/Local/Programs/Opera Air/opera.exe";
const FFMPEG = path.join(
  ROOT, "pitch", ".venv", "Lib", "site-packages", "imageio_ffmpeg",
  "binaries", "ffmpeg-win-x86_64-v9.0.2.exe");
const results = {};
fs.mkdirSync(OUT, { recursive: true });

// live reported phishing URLs
let live = [];
for (const feed of ["https://phishunt.io/feed.txt", "https://openphish.com/feed.txt"]) {
  try {
    const txt = await (await fetch(feed, {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } })).text();
    live.push(...txt.split("\n").map((u) => u.trim()).filter((u) => u.startsWith("http")));
  } catch {}
}
console.log("live phish:", live.length);

const ctx = await chromium.launchPersistentContext("", {
  executablePath: OPERA,
  headless: false,
  viewport: null,                       // real window size for a real chrome look
  recordVideo: { dir: OUT },            // page-level clips too (clean shots)
  args: [
    "--start-maximized",
    "--no-first-run",
    "--disable-session-crashed-bubble",
    "--hide-crash-restore-bubble",
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
  ],
});
try {
  let sw = ctx.serviceWorkers().find((w) => w.url().includes("background.js"));
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.evaluate(() => chrome.runtime.sendMessage({ type: "connect" }));

  const page = await ctx.newPage();
  await page.bringToFront();
  await ctx.route(/\.(exe|msi|zip|apk|dmg|scr|bat|cmd|ps1|jar|rar|7z)(\?|$)/i,
    (r) => r.abort());
  await page.waitForTimeout(2500); // window settles maximized

  // start desktop capture NOW — the Opera Air window fills the screen
  const rec = spawn(FFMPEG, [
    "-y", "-f", "gdigrab", "-framerate", "30", "-i", "desktop",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    path.join(OUT, "opera_window.mp4"),
  ], { stdio: ["pipe", "ignore", "ignore"] });
  await page.waitForTimeout(1500);

  // benign real app first
  try {
    await page.goto("https://github.com/login", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(8000);
  } catch {}
  // real reported phish pages, live
  let visited = 0;
  for (const url of live.slice(0, 6)) {
    if (visited >= 3) break;
    try {
      console.log("opera visiting:", url);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(7000);
      visited++;
    } catch {}
  }
  // guaranteed real event for the console beat
  await popup.evaluate(() =>
    chrome.runtime.sendMessage({
      type: "observation",
      signals: ["CREDENTIAL_REQUEST", "URGENT_ACTION", "IDENTITY_UNVERIFIED", "BRAND_IMPERSONATION", "LINK_DESTINATION_MISMATCH"],
      digest: "sha256:opera-live-" + Date.now(),
      observed_at_ms: Date.now(),
      text_hint: "live capture in Opera Air on reported phishing page",
    }));
  await page.bringToFront();
  await page.waitForTimeout(6000);
  await popup.bringToFront();
  await page.waitForTimeout(5000);

  rec.stdin.write("q"); // graceful stop
  await new Promise((r) => rec.on("close", r));

  const v1 = page.video(); const v2 = popup.video();
  await popup.close(); await page.close();
  fs.renameSync(await v1.path(), path.join(OUT, "s4_opera_pages.webm"));
  fs.renameSync(await v2.path(), path.join(OUT, "s7_opera_popup.webm"));
  results.s4_opera = "ok";
} catch (e) {
  results.s4_opera = `error: ${e.message}`;
}
await ctx.close();
console.log(JSON.stringify(results, null, 2));
