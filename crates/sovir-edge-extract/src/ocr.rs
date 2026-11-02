//! OCR-text → typed signals (ADR-0019). The platform adapter runs an
//! on-device OCR engine over a *gated* region and hands the recognized
//! text here; this module evaluates it against the same multilingual
//! term families as the DOM extractor and emits typed hypotheses.
//!
//! Same hard boundaries as the pixel path: no I/O, no retention — the
//! output is signals + a digest of the text, never the text itself.
//! Fail-closed by construction: empty/unreadable input emits nothing.

use sha2::{Digest, Sha256};
use sovir_domain::RiskSignal;

use crate::{ExtractedSignal, Rect, MAX_REGIONS};

/// Maximum characters of OCR text evaluated per region — bounding the
/// scan the same way the DOM extractor bounds its block list.
pub const MAX_OCR_CHARS: usize = 2_000;

/// One region's recognized text, provided by the capture adapter.
pub struct OcrRegion<'a> {
    pub text: &'a str,
    pub region: Rect,
}

/// Text-path result: a digest of the region text plus typed signals —
/// never the text itself (mirrors `Extraction` for the pixel path).
#[derive(Debug, Clone)]
pub struct OcrExtraction {
    /// "sha256:{hex}" over the evaluated text — the region-level
    /// content digest an `ObservedEvent` may carry.
    pub content_digest: String,
    pub signals: Vec<ExtractedSignal>,
}

/// A term family: one signal, representative phrases per language.
/// Data-driven: adding a pattern is appending terms, not touching logic.
struct TermSet {
    signal: RiskSignal,
    /// Latin-script terms are matched on word boundaries; CJK terms by
    /// substring (no reliable spaces).
    terms: &'static [&'static str],
}

static TERMS: &[TermSet] = &[
    TermSet {
        signal: RiskSignal::UrgentAction,
        terms: &[
            "urgente", "actúa ahora", "cuenta suspendida", "urgent", "act now", "account suspended",
            "limited time", "urgente", "agora mesmo", "urgent", "agissez maintenant", "urgente",
            "agisci ora", "dringend", "jetzt handeln", "konto gesperrt", "緊急", "今すぐ", "紧急",
            "立即", "账户已暂停",
        ],
    },
    TermSet {
        signal: RiskSignal::PaymentRequest,
        terms: &[
            "paga ahora", "datos de tu tarjeta", "número de tarjeta", "pay now", "card number",
            "payment details", "pague agora", "cartão", "payez maintenant", "numéro de carte",
            "paga ora", "carta di credito", "jetzt zahlen", "kartennummer", "支払", "カード番号",
            "付款", "卡号", "银行卡",
        ],
    },
    TermSet {
        signal: RiskSignal::CredentialRequest,
        terms: &[
            "inicia sesión", "contraseña", "verifica tu cuenta", "sign in", "password",
            "verify your account", "entrar", "senha", "connectez-vous", "mot de passe", "accedi",
            "password", "anmelden", "passwort", "konto bestätigen", "ログイン", "パスワード",
            "登录", "密码", "验证账户",
        ],
    },
    TermSet {
        signal: RiskSignal::ExtortionLanguage,
        terms: &[
            "grabamos", "publicaremos", "tus fotos íntimas", "te vimos", "we recorded",
            "we will publish", "your private videos", "gravamos", "publicaremos", "nous avons
enregistré", "registrato", "veröffentlichen", "wir haben aufgenommen",
            "公開します", "録画しました", "我们会公开", "你的私密",
        ],
    },
    TermSet {
        signal: RiskSignal::ScarewareClaim,
        terms: &[
            "virus detectado", "dispositivo infectado", "virus detected", "device infected",
            "vírus detectado", "virus détecté", "virus rilevato", "virus erkannt", "ウイルス",
            "感染しています", "检测到病毒", "设备已感染",
        ],
    },
    TermSet {
        signal: RiskSignal::OffPlatformMove,
        terms: &[
            "escríbeme por whatsapp", "hablamos por telegram", "contáctame por wechat",
            "message me on whatsapp", "dm me on telegram", "wechat me", "me chama no whatsapp",
            "écris-moi sur whatsapp", "scrivimi su whatsapp", "schreib mir auf whatsapp",
            "hidden information", "información oculta", "whatsappで", "微信联系",
            "加我微信",
        ],
    },
    TermSet {
        signal: RiskSignal::BulkBuyerLure,
        terms: &[
            "compra inmediata", "pago de contado", "te compramos", "compramos toda clase",
            "instant purchase", "cash upfront", "we buy all kinds", "compra imediata",
            "achat immédiat", "compro subito", "sofortkauf", "barzahlung", "即購入", "現金で",
            "立即购买", "现金支付", "我们收购",
        ],
    },
    TermSet {
        signal: RiskSignal::GiftCardPayment,
        terms: &[
            "tarjeta de regalo", "gift card", "itunes", "google play card", "cartão presente",
            "carte cadeau", "carta regalo", "geschenkkarte", "ギフトカード", "礼品卡",
        ],
    },
    TermSet {
        signal: RiskSignal::SeedPhraseRequest,
        terms: &[
            "frase semilla", "palabras de recuperación", "seed phrase", "recovery phrase",
            "12 words", "24 words", "frase de recuperação", "phrase de récupération",
            "frase di recupero", "wiederherstellungsphrase", "復元フレーズ", "助记词", "恢复短语",
        ],
    },
    TermSet {
        signal: RiskSignal::InvestmentPromise,
        terms: &[
            "ganancias garantizadas", "duplica tu dinero", "guaranteed profits",
            "double your money", "rendement garanti", "garantierte gewinne", "guadagni
garantiti", "lucros garantidos", "保証された利益", "保证收益", "双倍收益",
        ],
    },
    TermSet {
        signal: RiskSignal::DeliveryCustomsFee,
        terms: &[
            "cargo de aduana", "tarifa de envío", "customs fee", "delivery fee", "frais de
douane", "taxa de alfândega", "tassa doganale", "zollgebühr", "通関料", "海关费用",
        ],
    },
    TermSet {
        signal: RiskSignal::AuthorityImpersonation,
        terms: &[
            "hacienda", "policía nacional", "irs", "hmrc", "finanzamt", "bundespolizei",
            "receita federal", "police nationale", "polizia di stato", "税務署", "税务局", "公安局",
        ],
    },
];

/// Case-folded needle match. Latin terms require non-alphanumeric
/// boundaries (prevents "unlocked" matching "locked"); terms containing
/// CJK characters match by substring.
fn matches(text: &str, term: &str) -> bool {
    if term.chars().any(|c| ('\u{2e80}'..='\u{9fff}').contains(&c)) {
        return text.contains(term);
    }
    let mut start = 0usize;
    while let Some(pos) = text[start..].find(term) {
        let i = start + pos;
        let before_ok = i == 0
            || !text.as_bytes()[i - 1].is_ascii_alphanumeric();
        let end = i + term.len();
        let after_ok = end >= text.len()
            || !text.as_bytes()[end].is_ascii_alphanumeric();
        if before_ok && after_ok {
            return true;
        }
        start = i + 1;
        if start >= text.len() {
            break;
        }
    }
    false
}

/// Bounded evaluation of OCR'd region text → typed signal hypotheses.
/// The digest covers the text; the text itself is never returned.
pub fn extract_from_ocr(regions: &[OcrRegion<'_>]) -> OcrExtraction {
    let mut signals = Vec::new();
    let mut hasher = Sha256::new();
    for r in regions.iter().take(MAX_REGIONS) {
        let text: String = r
            .text
            .chars()
            .take(MAX_OCR_CHARS)
            .collect::<String>()
            .to_lowercase();
        hasher.update(text.as_bytes());
        if text.is_empty() {
            continue;
        }
        for set in TERMS {
            if set.terms.iter().any(|t| matches(&text, t)) {
                signals.push(ExtractedSignal {
                    signal: set.signal,
                    // Text presence is binary in v1: a matched phrase is a
                    // hypothesis at fixed mid confidence — the policy pack
                    // decides corroboration.
                    confidence_bp: 5_000,
                    region: r.region,
                });
            }
        }
    }
    OcrExtraction {
        content_digest: format!("sha256:{:x}", hasher.finalize()),
        signals,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(t: &str) -> OcrRegion<'_> {
        OcrRegion {
            text: t,
            region: Rect {
                x: 0,
                y: 0,
                w: 10,
                h: 10,
            },
        }
    }
    fn has(out: &OcrExtraction, s: RiskSignal) -> bool {
        out.signals.iter().any(|x| x.signal == s)
    }

    #[test]
    fn ocr_text_yields_same_signals_as_dom_terms() {
        let out = extract_from_ocr(&[r("URGENT: your account suspended — verify your account now")]);
        assert!(has(&out, RiskSignal::UrgentAction));
        assert!(has(&out, RiskSignal::CredentialRequest));
    }

    #[test]
    fn marketplace_lure_detected_in_image_text() {
        let out = extract_from_ocr(&[r("compra inmediata pago de contado, escríbeme por whatsapp")]);
        assert!(has(&out, RiskSignal::BulkBuyerLure));
        assert!(has(&out, RiskSignal::OffPlatformMove));
    }

    #[test]
    fn cjk_terms_match_without_spaces() {
        let out = extract_from_ocr(&[r("緊急:アカウントが停止されました。支払いが必要です")]);
        assert!(has(&out, RiskSignal::UrgentAction));
        assert!(has(&out, RiskSignal::PaymentRequest));
        let out2 = extract_from_ocr(&[r("检测到病毒，请立即付款")]);
        assert!(has(&out2, RiskSignal::ScarewareClaim));
        assert!(has(&out2, RiskSignal::PaymentRequest));
    }

    #[test]
    fn benign_text_stays_silent() {
        let out = extract_from_ocr(&[r("grandma's birthday dinner is on saturday, bring cake")]);
        assert!(out.signals.is_empty());
        let out2 = extract_from_ocr(&[r("your device is unlocked and verified")]);
        assert!(out2.signals.is_empty());
    }

    #[test]
    fn empty_and_huge_text_fail_closed_and_bounded() {
        let out = extract_from_ocr(&[r("")]);
        assert!(out.signals.is_empty());
        let big = "x".repeat(MAX_OCR_CHARS * 3) + " paga ahora";
        let out2 = extract_from_ocr(&[r(&big)]);
        assert!(out2.signals.is_empty());
    }

    #[test]
    fn output_carries_digest_not_text() {
        let out = extract_from_ocr(&[r("paga ahora")]);
        assert!(out.content_digest.starts_with("sha256:"));
        assert!(!out.content_digest.contains("paga"));
    }
}
