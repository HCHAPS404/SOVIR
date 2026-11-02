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
