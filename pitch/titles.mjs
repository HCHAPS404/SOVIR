// pitch/titles.mjs — renders titles.html cards to PNG at 1280x720.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/jesui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core"
);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "pitch", "titles");
fs.mkdirSync(OUT, { recursive: true });

const CARDS = [
  ["t0_intro", { k: "SOVIR", t: "Digital Autonomy Intelligence", s: "See clearly. Decide freely." }],
  ["t8_outro", { k: "SOVIR", t: "See the signals.", s: "Keep the choice.", g: "sovir — local-first protection" }],
];

const browser = await chromium.launch({
  executablePath: "C:/Users/jesui/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
const base = "file:///" + path.join(ROOT, "pitch", "titles.html").replaceAll("\\", "/");
for (const [name, q] of CARDS) {
  await page.goto(base + "?" + new URLSearchParams(q));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log("wrote", name);
}
await browser.close();
