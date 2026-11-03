// Build the benign side of the vision eval corpus: real screenshots of
// LEGIT brand homepages (the primary curated domain per brand) — the
// adversarial negatives the voter must NOT flag on their own domain.
// Public pages fetched once; no user data, no credentials, nothing that
// touches the API. Failures are recorded and skipped, never faked.
//
// Usage (repo root):
//   node ml/pipelines/build_benign_corpus.mjs [--limit 150] [--out-dir ml/datasets/benign-brands]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PW_PATH =
  "C:/Users/jesui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core";
const CHROME =
  "C:/Users/jesui/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const LIMIT = Number(arg("limit", "150"));
const OUT_DIR = join(ROOT, arg("out-dir", "ml/datasets/benign-brands"));
const CORPUS_OUT = join(ROOT, "ml/datasets/eval-corpus-vision-benign.v1.json");
const CONCURRENCY = 4;
const NAV_TIMEOUT_MS = 18_000;

const src = JSON.parse(readFileSync(join(ROOT, "ml/brand-domains.json"), "utf8"));
const brands = Object.entries(src)
  .filter(([k, v]) => !k.startsWith("_") && Array.isArray(v) && v.length)
  .slice(0, LIMIT);

const slug = (s) =>
  s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const { chromium } = await import(pathToFileURL(join(PW_PATH, "index.mjs")).href);
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
mkdirSync(OUT_DIR, { recursive: true });

const cases = [];
const skipped = [];
let idx = 0;

async function worker() {
  while (idx < brands.length) {
    const [brand, domains] = brands[idx++];
    const host = domains[0];
    const shot = join(OUT_DIR, `${slug(brand)}.png`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    try {
      await page.goto(`https://${host}`, {
        waitUntil: "domcontentloaded",
        timeout: NAV_TIMEOUT_MS,
      });
      await page.waitForTimeout(1800);
      await page.screenshot({ path: shot });
      cases.push({
        id: `bv-${cases.length.toString().padStart(4, "0")}`,
        screenshot: `ml/datasets/benign-brands/${slug(brand)}.png`,
        host,
        expect_brand: null,
        expect_signal: "none",
        note: `legit ${brand} homepage on its own domain`,
      });
      process.stdout.write(`+ ${brand} (${host})\n`);
    } catch (e) {
      skipped.push({ brand, host, reason: String(e.message || e).slice(0, 120) });
      process.stdout.write(`- ${brand} (${host}) SKIP\n`);
    } finally {
      await page.close();
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await browser.close();

const corpus = {
  version: "v1",
  status: `populated — ${cases.length} legit homepages, ${skipped.length} skipped`,
  purpose:
    "Benign side of the ADR-0024 gated eval: legit brand pages on their OWN domains must never fire. Scores are still recorded — a high score against a FOREIGN brand on an own-domain page exposes cross-brand near-misses the domain check would have masked.",
  model: "sovir-onnx-visual-v0",
  cases,
  skipped,
};
writeFileSync(CORPUS_OUT, JSON.stringify(corpus, null, 2));
console.log(`\nwrote ${cases.length} benign cases (${skipped.length} skipped) -> ${CORPUS_OUT}`);
