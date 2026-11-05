// pitch/record_landing.mjs — captures the public landing (/web) scroll.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/jesui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core"
);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "pitch", "clips");
const SIZE = { width: 1280, height: 720 };
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:/Users/jesui/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe",
  headless: true,
});
const ctx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT, size: SIZE }, locale: "en-US" });
const page = await ctx.newPage();
await page.goto("http://127.0.0.1:3000/web", { waitUntil: "networkidle" });
await page.waitForTimeout(5000);
for (let i = 0; i < 4; i++) {
  await page.mouse.wheel(0, 420);
  await page.waitForTimeout(3200);
}
const v = page.video();
await page.close(); await ctx.close(); await browser.close();
fs.renameSync(await v.path(), path.join(OUT, "s1b_landing.webm"));
console.log("landing ok");
