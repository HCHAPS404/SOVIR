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

function doc(html, protocol = "https:", host = "site.example") {
  const { window } = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
  return { doc: window.document, loc: { protocol, host, href: `${protocol}//${host}/` } };
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

test("password form posting cross-origin → IDENTITY_UNVERIFIED", () => {
  const { doc: d, loc } = doc(
    '<form action="https://evil.example/collect"><input type="password"></form>',
  );
  const s = extract(d, loc);
  assert.ok(s.includes("CREDENTIAL_REQUEST"));
  assert.ok(s.includes("IDENTITY_UNVERIFIED"));
});

test("password form posting same-origin → no IDENTITY_UNVERIFIED", () => {
  const { doc: d, loc } = doc('<form action="/login"><input type="password"></form>');
  assert.ok(!extract(d, loc).includes("IDENTITY_UNVERIFIED"));
});

test("cross-origin form without password field → no IDENTITY_UNVERIFIED", () => {
  const { doc: d, loc } = doc('<form action="https://cdn.example/x"><input type="text"></form>');
  assert.ok(!extract(d, loc).includes("IDENTITY_UNVERIFIED"));
});

test("http with zero other signals → no IDENTITY_UNVERIFIED", () => {
  const { doc: d, loc } = doc("<p>texto</p>", "http:");
  assert.deepEqual(extract(d, loc), []);
});

// --- Deceptive-link and domain detectors (v0.3) ---

test("link text domain ≠ href domain → LINK_DESTINATION_MISMATCH", () => {
  const { doc: d, loc } = doc(
    '<a href="http://secure-verify.tk/login">https://www.tubanco.com</a>',
  );
  assert.ok(extract(d, loc).includes("LINK_DESTINATION_MISMATCH"));
});

test("link text domain matching href domain → no mismatch", () => {
  const { doc: d, loc } = doc(
    '<a href="https://www.tubanco.com/login">https://www.tubanco.com</a>',
  );
  assert.ok(!extract(d, loc).includes("LINK_DESTINATION_MISMATCH"));
});

test("anchor text without a domain → no mismatch", () => {
  const { doc: d, loc } = doc('<a href="https://otro.example/x">haz clic aquí</a>');
  assert.ok(!extract(d, loc).includes("LINK_DESTINATION_MISMATCH"));
});

test("page on abusive TLD → SUSPICIOUS_DOMAIN", () => {
  const { doc: d, loc } = doc("<p>x</p>", "https:", "login-banco.tk");
  assert.ok(extract(d, loc).includes("SUSPICIOUS_DOMAIN"));
});

test("link href to abusive TLD → SUSPICIOUS_DOMAIN", () => {
  const { doc: d, loc } = doc('<a href="http://verify.tk/x">verificar</a>');
  assert.ok(extract(d, loc).includes("SUSPICIOUS_DOMAIN"));
});

test("punycode host → SUSPICIOUS_DOMAIN", () => {
  const { doc: d, loc } = doc("<p>x</p>", "https:", "xn--bnk-9wa.example");
  assert.ok(extract(d, loc).includes("SUSPICIOUS_DOMAIN"));
});

test("bare-IP host → SUSPICIOUS_DOMAIN", () => {
  const { doc: d, loc } = doc("<p>x</p>", "http:", "192.168.0.50");
  assert.ok(extract(d, loc).includes("SUSPICIOUS_DOMAIN"));
});

test("normal domain → no SUSPICIOUS_DOMAIN", () => {
  const { doc: d, loc } = doc("<p>x</p>", "https:", "www.pinterest.com");
  assert.ok(!extract(d, loc).includes("SUSPICIOUS_DOMAIN"));
});

test("sextortion phrasing → EXTORTION_LANGUAGE", () => {
  const { doc: d, loc } = doc(
    "<p>Tenemos tus videos. Paga ahora o publicamos todo a tus contactos.</p>",
  );
  assert.ok(extract(d, loc).includes("EXTORTION_LANGUAGE"));
});

test("ransom phrasing EN → EXTORTION_LANGUAGE", () => {
  const { doc: d, loc } = doc(
    "<p>Your files will be deleted unless you pay to this bitcoin wallet.</p>",
  );
  assert.ok(extract(d, loc).includes("EXTORTION_LANGUAGE"));
});

test("fake infection scare → SCAREWARE_CLAIM", () => {
  const { doc: d, loc } = doc(
    "<strong>Tu dispositivo está infectado. Llame ahora a soporte.</strong>",
  );
  assert.ok(extract(d, loc).includes("SCAREWARE_CLAIM"));
});

test("late fee disclosure → HIDDEN_FEE_PATTERN", () => {
  const { doc: d, loc } = doc("<p>Total + $9.99 service fee al finalizar.</p>");
  assert.ok(extract(d, loc).includes("HIDDEN_FEE_PATTERN"));
});

test("benign pricing text → no HIDDEN_FEE_PATTERN", () => {
  const { doc: d, loc } = doc("<p>Envío gratis en pedidos superiores a 50€.</p>");
  assert.ok(!extract(d, loc).includes("HIDDEN_FEE_PATTERN"));
});

// --- Multilingual coverage (v0.4): DE / FR / IT / PT / JA / ZH ---

test("DE urgency → URGENT_ACTION", () => {
  const { doc: d, loc } = doc(
    "<h1>Ihr Konto wurde gesperrt. Handeln Sie jetzt zur Verifizierung.</h1>",
  );
  assert.ok(extract(d, loc).includes("URGENT_ACTION"));
});

test("FR scareware → SCAREWARE_CLAIM", () => {
  const { doc: d, loc } = doc(
    "<p>Virus détecté sur votre ordinateur. Appelez maintenant le support.</p>",
  );
  assert.ok(extract(d, loc).includes("SCAREWARE_CLAIM"));
});

test("IT prize → PRIZE_LOTTERY_CLAIM", () => {
  const { doc: d, loc } = doc("<h2>Congratulazioni! Hai vinto il jackpot.</h2>");
  assert.ok(extract(d, loc).includes("PRIZE_LOTTERY_CLAIM"));
});

test("PT gift card → GIFT_CARD_PAYMENT", () => {
  const { doc: d, loc } = doc(
    "<p>Para liberar sua conta, pague com cartão presente.</p>",
  );
  assert.ok(extract(d, loc).includes("GIFT_CARD_PAYMENT"));
});

test("JA scareware substring (no \b needed) → SCAREWARE_CLAIM", () => {
  const { doc: d, loc } = doc(
    "<p>ウイルスが検出されました。今すぐお電話ください。</p>",
  );
  const s = extract(d, loc);
  assert.ok(s.includes("SCAREWARE_CLAIM"));
  assert.ok(s.includes("URGENT_ACTION"));
});

test("ZH urgency substring → URGENT_ACTION", () => {
  const { doc: d, loc } = doc("<h1>您的账户已冻结，请立即验证</h1>");
  assert.ok(extract(d, loc).includes("URGENT_ACTION"));
});

test("ZH prize substring → PRIZE_LOTTERY_CLAIM", () => {
  const { doc: d, loc } = doc("<p>恭喜中奖！请领取您的奖品。</p>");
  assert.ok(extract(d, loc).includes("PRIZE_LOTTERY_CLAIM"));
});

test("JA prize substring → PRIZE_LOTTERY_CLAIM", () => {
  const { doc: d, loc } = doc("<p>当選おめでとうございます！賞金を受け取る。</p>");
  assert.ok(extract(d, loc).includes("PRIZE_LOTTERY_CLAIM"));
});

// --- New signal detectors ---

test("investment promise EN → INVESTMENT_PROMISE", () => {
  const { doc: d, loc } = doc(
    "<p>Double your money with guaranteed returns in 30 days.</p>",
  );
  assert.ok(extract(d, loc).includes("INVESTMENT_PROMISE"));
});

test("honest risk disclosure → no INVESTMENT_PROMISE", () => {
  const { doc: d, loc } = doc(
    "<p>All investments carry risk of loss. Past performance varies.</p>",
  );
  assert.ok(!extract(d, loc).includes("INVESTMENT_PROMISE"));
});

test("seed phrase text ES → SEED_PHRASE_REQUEST", () => {
  const { doc: d, loc } = doc(
    "<p>Para recuperar tu billetera introduce la frase de recuperación de 24 palabras.</p>",
  );
  assert.ok(extract(d, loc).includes("SEED_PHRASE_REQUEST"));
});

test("seed phrase input placeholder → SEED_PHRASE_REQUEST", () => {
  const { doc: d, loc } = doc(
    '<input type="text" placeholder="Enter your seed phrase">',
  );
  assert.ok(extract(d, loc).includes("SEED_PHRASE_REQUEST"));
});

test("normal input → no SEED_PHRASE_REQUEST", () => {
  const { doc: d, loc } = doc('<input type="text" name="username">');
  assert.ok(!extract(d, loc).includes("SEED_PHRASE_REQUEST"));
});

test("customs parcel text → DELIVERY_CUSTOMS_FEE", () => {
  const { doc: d, loc } = doc(
    "<p>Your package is held at customs. Pay the customs fee to release it.</p>",
  );
  assert.ok(extract(d, loc).includes("DELIVERY_CUSTOMS_FEE"));
});

test("DE authority fine → AUTHORITY_IMPERSONATION", () => {
  const { doc: d, loc } = doc(
    "<p>Das Finanzamt hat eine offizielle Strafe gegen Sie verhängt.</p>",
  );
  assert.ok(extract(d, loc).includes("AUTHORITY_IMPERSONATION"));
});

test("scarcity text DE → SCARCITY_PRESSURE", () => {
  const { doc: d, loc } = doc("<p>Nur noch wenige verfügbar — nur heute!</p>");
  assert.ok(extract(d, loc).includes("SCARCITY_PRESSURE"));
});

test("countdown widget → SCARCITY_PRESSURE", () => {
  const { doc: d, loc } = doc('<div class="countdown">04:59:58</div>');
  assert.ok(extract(d, loc).includes("SCARCITY_PRESSURE"));
});

test("empty countdown widget → no SCARCITY_PRESSURE", () => {
  const { doc: d, loc } = doc('<div class="countdown"></div>');
  assert.ok(!extract(d, loc).includes("SCARCITY_PRESSURE"));
});

test("job scam pitch EN → JOB_SCAM_OFFER", () => {
  const { doc: d, loc } = doc(
    "<p>Work from home. No experience needed. Weekly payout guaranteed position.</p>",
  );
  assert.ok(extract(d, loc).includes("JOB_SCAM_OFFER"));
});

test("normal careers page → no JOB_SCAM_OFFER", () => {
  const { doc: d, loc } = doc(
    "<p>Our careers page lists open engineering positions in Madrid.</p>",
  );
  assert.ok(!extract(d, loc).includes("JOB_SCAM_OFFER"));
});

test("miracle cure EN → MIRACLE_CURE_CLAIM", () => {
  const { doc: d, loc } = doc(
    "<p>Doctors hate this miracle cure! Cures diabetes in 7 days.</p>",
  );
  assert.ok(extract(d, loc).includes("MIRACLE_CURE_CLAIM"));
});

test("love + money in same block → ROMANCE_BAIT", () => {
  const { doc: d, loc } = doc(
    "<p>My love, I want to meet you but I need money for the plane ticket.</p>",
  );
  assert.ok(extract(d, loc).includes("ROMANCE_BAIT"));
});

test("love without money → no ROMANCE_BAIT", () => {
  const { doc: d, loc } = doc("<p>My love, I hope to meet you soon.</p>");
  assert.ok(!extract(d, loc).includes("ROMANCE_BAIT"));
});

test("money ask without romance → no ROMANCE_BAIT", () => {
  const { doc: d, loc } = doc(
    "<p>Please send money for the emergency hospital bill.</p>",
  );
  assert.ok(!extract(d, loc).includes("ROMANCE_BAIT"));
});

test("password + ssn field → DATA_HARVESTING", () => {
  const { doc: d, loc } = doc(
    '<form><input type="password" name="p"><input type="text" name="ssn"></form>',
  );
  const s = extract(d, loc);
  assert.ok(s.includes("CREDENTIAL_REQUEST"));
  assert.ok(s.includes("DATA_HARVESTING"));
});

test("password + email field → no DATA_HARVESTING", () => {
  const { doc: d, loc } = doc(
    '<form><input type="password" name="p"><input type="email" name="e"></form>',
  );
  assert.ok(!extract(d, loc).includes("DATA_HARVESTING"));
});

test("DE extortion → EXTORTION_LANGUAGE", () => {
  const { doc: d, loc } = doc(
    "<p>Wir haben deine Videos. Zahl oder wir veröffentlichen alles.</p>",
  );
  assert.ok(extract(d, loc).includes("EXTORTION_LANGUAGE"));
});

test("FR extortion → EXTORTION_LANGUAGE", () => {
  const { doc: d, loc } = doc(
    "<p>Nous avons vos vidéos. Payez ou nous publions tout.</p>",
  );
  assert.ok(extract(d, loc).includes("EXTORTION_LANGUAGE"));
});

test("DE hidden fee → HIDDEN_FEE_PATTERN", () => {
  const { doc: d, loc } = doc(
    "<p>Zusätzliche Gebühren fallen an: Servicegebühr 4,99 €.</p>",
  );
  assert.ok(extract(d, loc).includes("HIDDEN_FEE_PATTERN"));
});

test("word-boundary: 'unlocked' must not match 'locked'", () => {
  const { doc: d, loc } = doc("<p>Your account is now unlocked and active.</p>");
  assert.ok(!extract(d, loc).includes("URGENT_ACTION"));
});

// --- Marketplace off-platform + bulk-buyer lures + wide selectors (v0.5) ---

test("whatsapp move in a div (FB-style DOM) → OFF_PLATFORM_MOVE", () => {
  const { doc: d, loc } = doc("<div>Escríbeme por whatsapp para coordinar</div>");
  assert.ok(extract(d, loc).includes("OFF_PLATFORM_MOVE"));
});

test("hidden contact info in a span → OFF_PLATFORM_MOVE", () => {
  const { doc: d, loc } = doc("<span>Teléfono: [hidden information]</span>");
  assert.ok(extract(d, loc).includes("OFF_PLATFORM_MOVE"));
});

test("ZH off-platform move → OFF_PLATFORM_MOVE", () => {
  const { doc: d, loc } = doc("<div>请加微信联系</div>");
  assert.ok(extract(d, loc).includes("OFF_PLATFORM_MOVE"));
});

test("ES bulk-buyer lure → BULK_BUYER_LURE", () => {
  const { doc: d, loc } = doc(
    "<div>Compra inmediata pago de contado — te compramos toda clase de motos</div>",
  );
  assert.ok(extract(d, loc).includes("BULK_BUYER_LURE"));
});

test("JA bulk-buyer lure → BULK_BUYER_LURE", () => {
  const { doc: d, loc } = doc("<div>何でも即金買取します</div>");
  assert.ok(extract(d, loc).includes("BULK_BUYER_LURE"));
});

test("ordinary marketplace copy → neither lure", () => {
  const { doc: d, loc } = doc(
    "<div>Vendo bicicleta en buen estado, precio negociable</div>",
  );
  const s = extract(d, loc);
  assert.ok(!s.includes("OFF_PLATFORM_MOVE"));
  assert.ok(!s.includes("BULK_BUYER_LURE"));
});

test("span inside feed markup is now scanned (selector widening)", () => {
  const { doc: d, loc } = doc(
    "<article><div><span><span>Solo quedan 2 unidades</span></span></div></article>",
  );
  assert.ok(extract(d, loc).includes("SCARCITY_PRESSURE"));
});

test("real fixture page emits the broad synthetic taxonomy", () => {
  // The fixture is the repo's own end-to-end target — pin that it
  // still trips a wide slice of the enum (the transport bound is
  // asserted separately in background.test.js).
  const html = readFileSync(join(here, "..", "fixtures", "synthetic-phish.html"), "utf8");
  const { window } = new JSDOM(html);
  const loc = { protocol: "http:", host: "127.0.0.1:8789", href: "http://127.0.0.1:8789/synthetic-phish.html" };
  const signals = extract(window.document, loc);
  assert.ok(signals.length >= 14, `expected broad taxonomy, got ${signals.length}`);
  for (const s of [
    "CREDENTIAL_REQUEST",
    "PAYMENT_REQUEST",
    "SEED_PHRASE_REQUEST",
    "OFF_PLATFORM_MOVE",
    "LINK_DESTINATION_MISMATCH",
    "IDENTITY_UNVERIFIED",
  ]) {
    assert.ok(signals.includes(s), `fixture must emit ${s}`);
  }
});

test("romance bait split across chat bubbles (fixture 12)", () => {
  const html = readFileSync(
    join(here, "..", "fixtures", "training", "12-romance-split.html"),
    "utf8",
  );
  const { window } = new JSDOM(html, { url: "https://chat.example/" });
  const signals = extract(window.document, window.location);
  assert.ok(signals.includes("ROMANCE_BAIT"), "split love+money must trigger");
});

// --- DOM_BRAND_MISMATCH: brand identity served from a foreign domain ---
const BRAND_LEX = [
  { n: "paypal", m: false, d: ["paypal.com", "paypal.me"] },
  { n: "bank of america", m: true, d: ["bankofamerica.com"] },
  { n: "netflix", m: false, d: ["netflix.com"] },
  { n: "amazon", m: false, d: ["amazon.com"] },
  { n: "apple", m: false, d: ["apple.com", "icloud.com"] },
];

function docHead(bodyHtml, headHtml, host) {
  const { window } = new JSDOM(
    `<!doctype html><html><head>${headHtml}</head><body>${bodyHtml}</body></html>`,
  );
  return {
    doc: window.document,
    loc: { protocol: "https:", host, href: `https://${host}/` },
  };
}

test("brand name in title on foreign domain → DOM_BRAND_MISMATCH", () => {
  globalThis.SOVIR_BRAND_DOMAINS = BRAND_LEX;
  const { doc: d, loc } = docHead("<p>x</p>", "<title>PayPal - Sign In</title>", "paypa1-secure.example");
  assert.ok(extract(d, loc).includes("DOM_BRAND_MISMATCH"));
  delete globalThis.SOVIR_BRAND_DOMAINS;
});

test("brand title on the brand's own domain → no signal", () => {
  globalThis.SOVIR_BRAND_DOMAINS = BRAND_LEX;
  const { doc: d, loc } = docHead("<p>x</p>", "<title>PayPal - Sign In</title>", "secure.paypal.com");
  assert.ok(!extract(d, loc).includes("DOM_BRAND_MISMATCH"));
  delete globalThis.SOVIR_BRAND_DOMAINS;
});

test("single-word brand without identity context does not fire", () => {
  globalThis.SOVIR_BRAND_DOMAINS = BRAND_LEX;
  const { doc: d, loc } = docHead("<p>x</p>", "<title>Amazon river tours 2026</title>", "travelblog.example");
  assert.ok(!extract(d, loc).includes("DOM_BRAND_MISMATCH"));
  delete globalThis.SOVIR_BRAND_DOMAINS;
});

test("multi-word brand in og:site_name on foreign domain → signal", () => {
  globalThis.SOVIR_BRAND_DOMAINS = BRAND_LEX;
  const { doc: d, loc } = docHead(
    "<p>x</p>",
    '<meta property="og:site_name" content="Bank of America">',
    "boa-verify.example",
  );
  assert.ok(extract(d, loc).includes("DOM_BRAND_MISMATCH"));
  delete globalThis.SOVIR_BRAND_DOMAINS;
});

test("single-word brand as exact og:site_name → signal", () => {
  globalThis.SOVIR_BRAND_DOMAINS = BRAND_LEX;
  const { doc: d, loc } = docHead(
    "<p>x</p>",
    '<meta property="og:site_name" content="Netflix">',
    "netfl1x.example",
  );
  assert.ok(extract(d, loc).includes("DOM_BRAND_MISMATCH"));
  delete globalThis.SOVIR_BRAND_DOMAINS;
});

test("logo img alt on foreign domain → signal", () => {
  globalThis.SOVIR_BRAND_DOMAINS = BRAND_LEX;
  const { doc: d, loc } = docHead(
    '<header><img alt="Netflix logo" src="l.png"></header>',
    "<title>Member area</title>",
    "netflix-billing.example",
  );
  assert.ok(extract(d, loc).includes("DOM_BRAND_MISMATCH"));
  delete globalThis.SOVIR_BRAND_DOMAINS;
});

test("ambiguous single word in og:site_name is not a claim", () => {
  globalThis.SOVIR_BRAND_DOMAINS = BRAND_LEX;
  const { doc: d, loc } = docHead(
    "<p>x</p>",
    '<meta property="og:site_name" content="Apple Pie Blog">',
    "recipes.example",
  );
  assert.ok(!extract(d, loc).includes("DOM_BRAND_MISMATCH"));
  delete globalThis.SOVIR_BRAND_DOMAINS;
});

test("no brand lexicon loaded → abstain even on phish-shaped title", () => {
  delete globalThis.SOVIR_BRAND_DOMAINS;
  const { doc: d, loc } = docHead("<p>x</p>", "<title>PayPal - Sign In</title>", "paypa1.example");
  assert.ok(!extract(d, loc).includes("DOM_BRAND_MISMATCH"));
});

// ---------------------------------------------------------------------------
// DOM-guided logo regions (ADR-0024 direction) — geometry only.
// ---------------------------------------------------------------------------
const extractLogoRegions = globalThis.sovirExtractLogoRegions;

function rectStub(el, x, y, w, h) {
  el.getBoundingClientRect = () => ({ x, y, width: w, height: h });
}

test("header/nav/logo-marked images yield bounded regions", () => {
  const { doc: d } = doc(
    '<header><img id="lg"></header><nav><svg id="nv"></svg></nav><img id="buried">',
  );
  rectStub(d.getElementById("lg"), 12, 8, 120, 40);
  rectStub(d.getElementById("nv"), 200, 8, 32, 32);
  rectStub(d.getElementById("buried"), 0, 900, 300, 200);
  const r = extractLogoRegions(d);
  assert.equal(r.regions.length, 2);
  assert.deepEqual(r.regions[0], { x: 12, y: 8, w: 120, h: 40 });
  assert.ok(r.vw > 0 && r.vh > 0, "viewport dims emitted for CSS→capture scaling");
});

test("top-zone plain img is a candidate; buried img is not", () => {
  const { doc: d } = doc('<img id="top"><img id="deep">');
  rectStub(d.getElementById("top"), 40, 60, 80, 40);
  rectStub(d.getElementById("deep"), 40, 600, 80, 40);
  const r = extractLogoRegions(d);
  assert.equal(r.regions.length, 1);
  assert.deepEqual(r.regions[0], { x: 40, y: 60, w: 80, h: 40 });
});

test("tiny/zero rects and duplicates are dropped; cap is bounded", () => {
  const { doc: d } = doc(
    '<header>' +
      Array.from({ length: 30 }, (_, i) => `<img id="i${i}">`).join("") +
      '</header>',
  );
  for (const img of d.querySelectorAll("img")) {
    rectStub(img, 0, 0, 0, 0);
  }
  rectStub(d.getElementById("i0"), 10, 10, 40, 40);
  rectStub(d.getElementById("i1"), 10, 10, 40, 40); // exact dup
  for (let i = 2; i < 30; i++) rectStub(d.getElementById(`i${i}`), i, i, 40, 40);
  const r = extractLogoRegions(d);
  assert.ok(r.regions.length <= 16, `bounded: ${r.regions.length}`);
  assert.equal(
    r.regions.filter((x) => x.x === 10 && x.y === 10).length,
    1,
    "duplicate rect deduped",
  );
});

test("missing document fails closed", () => {
  const r = extractLogoRegions(null);
  assert.deepEqual(r.regions, []);
});
