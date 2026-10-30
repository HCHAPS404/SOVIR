import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

// Load the extractor into a fresh global — it attaches to globalThis.
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "extractor.js"), "utf8");
new Function(src)();
const extract = globalThis.sovirExtractSignals;

function doc(html, protocol = "https:") {
  const { window } = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
  return { doc: window.document, loc: { protocol } };
}

test("benign page produces no signals", () => {
  const { doc: d, loc } = doc("<p>Hola mundo</p>");
  assert.deepEqual(extract(d, loc), []);
});

test("password field → CREDENTIAL_REQUEST", () => {
  const { doc: d, loc } = doc('<form><input type="password" name="p"></form>');
  assert.ok(extract(d, loc).includes("CREDENTIAL_REQUEST"));
});

test("card field → PAYMENT_REQUEST", () => {
  const { doc: d, loc } = doc('<input autocomplete="cc-number">');
  assert.ok(extract(d, loc).includes("PAYMENT_REQUEST"));
});

test("urgency heading → URGENT_ACTION", () => {
  const { doc: d, loc } = doc("<h1>Tu cuenta está suspendida, verifica ya</h1>");
  assert.ok(extract(d, loc).includes("URGENT_ACTION"));
});

test("pre-checked checkbox in form → CONSENT_DARK_PATTERN", () => {
  const { doc: d, loc } = doc('<form><input type="checkbox" checked></form>');
  assert.ok(extract(d, loc).includes("CONSENT_DARK_PATTERN"));
});

test("tracker script host → TRACKING_OBSERVED", () => {
  const { doc: d, loc } = doc('<script src="https://www.google-analytics.com/analytics.js"></script>');
  assert.ok(extract(d, loc).includes("TRACKING_OBSERVED"));
});

test("http + signal → IDENTITY_UNVERIFIED added", () => {
  const { doc: d, loc } = doc('<input type="password">', "http:");
  const s = extract(d, loc);
  assert.ok(s.includes("CREDENTIAL_REQUEST"));
  assert.ok(s.includes("IDENTITY_UNVERIFIED"));
});

test("https does not add IDENTITY_UNVERIFIED", () => {
  const { doc: d, loc } = doc('<input type="password">', "https:");
  assert.ok(!extract(d, loc).includes("IDENTITY_UNVERIFIED"));
});

test("http with zero other signals → no IDENTITY_UNVERIFIED", () => {
  const { doc: d, loc } = doc("<p>texto</p>", "http:");
  assert.deepEqual(extract(d, loc), []);
});
