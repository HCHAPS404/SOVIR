// NOT_VERIFIED: Android SDK is a deferred toolchain — this file has not
// been compiled. It targets stable android.view.accessibility APIs only.
package app.sovir.android.observer

import android.view.accessibility.AccessibilityNodeInfo

/**
 * Maps an accessibility node tree to TYPED SIGNALS (ADR-0014). No text,
 * no node content, no field values leave this function: the caller gets
 * a signal enum set plus a package name, and the event digest binds only
 * package + signal set.
 *
 * Vocabulary is a bounded subset of apps/extension/extractor.js (es+en),
 * chosen for mobile surfaces: seed-phrase theft, off-platform contact
 * moves, gift-card demands, scareware and prize hooks. Precision rule
 * (case 14): OFF_PLATFORM_MOVE requires contact intent, never a bare
 * channel name.
 */
object SignalExtractor {

    private fun rx(vararg phrases: String) = Regex(
        phrases.joinToString("|") { Regex.escape(it) },
        RegexOption.IGNORE_CASE,
    )

    private val URGENCY = rx(
        "urgente", "verifica", "suspendida", "bloqueada", "expira",
        "último aviso", "última oportunidad", "actúa ahora", "actua ahora",
        "plazo", "48 horas",
        "verify", "suspended", "locked", "immediately", "last chance",
    )
    private val PAYMENT = rx(
        "card", "tarjeta", "cvv", "iban", "pago", "pagos",
        "payment", "checkout", "billing", "transferencia",
    )
    // Coercion vocabulary — threat + conditional demand in one window is
    // the extortion shape the classifier expects.
    private val EXTORTION = rx(
        "si no pagas", "publicaremos", "tus contactos", "tenemos tus",
        "te grabamos", "grabamos", "chantaje", "amenaza",
        "recorded you", "your contacts", "we will publish", "pay or",
    )
    // Wallet theft: asking for the recovery phrase is never legitimate.
    private val SEED_PHRASE = rx(
        "frase semilla", "frase de recuperación", "frase secreta",
        "12 palabras", "24 palabras", "palabras de recuperación",
        "palabras secretas", "clave privada", "frase mnemotécnica",
        "seed phrase", "recovery phrase", "secret phrase", "12 words",
        "24 words", "recovery words", "secret words", "private key",
        "mnemonic phrase", "backup phrase",
    )
    // Case-14 precision ported from the extension: imperative contact
    // intent only — a bare "por whatsapp" is not a move.
    private val OFF_PLATFORM = rx(
        "escríbeme por whatsapp", "escribeme por whatsapp",
        "contáctame por whatsapp", "contactame por whatsapp",
        "hablamos por whatsapp", "me escribes por whatsapp",
        "mensaje directo", "contacto oculto", "mi número es",
        "message me on whatsapp", "whatsapp me", "text me at",
        "dm me", "contact me on telegram", "message me on telegram",
        "chat on whatsapp", "reach me at", "my number is",
    )
    private val GIFT_CARD = rx(
        "tarjeta de regalo", "tarjetas de regalo", "paga con tarjeta",
        "código de tarjeta", "gift card", "gift cards",
        "pay with gift card", "itunes card", "google play card",
        "steam card", "prepaid card",
    )
    private val SCAREWARE = rx(
        "dispositivo infectado", "virus detectado", "tu teléfono está infectado",
        "limpieza urgente", "amenaza detectada",
        "device infected", "virus detected", "your phone is infected",
        "threat detected", "infection found",
    )
    private val PRIZE_LOTTERY = rx(
        "has ganado", "felicidades ganaste", "premio", "lotería",
        "you won", "congratulations you", "prize", "lottery", "jackpot",
    )

    private val TABLE: List<Pair<Regex, String>> = listOf(
        URGENCY to "URGENT_ACTION",
        PAYMENT to "PAYMENT_REQUEST",
        EXTORTION to "EXTORTION_LANGUAGE",
        SEED_PHRASE to "SEED_PHRASE_REQUEST",
        OFF_PLATFORM to "OFF_PLATFORM_MOVE",
        GIFT_CARD to "GIFT_CARD_PAYMENT",
        SCAREWARE to "SCAREWARE_CLAIM",
        PRIZE_LOTTERY to "PRIZE_LOTTERY_CLAIM",
    )

    fun extract(root: AccessibilityNodeInfo?): Set<String> {
        if (root == null) return emptySet()
        val signals = mutableSetOf<String>()
        walk(root, signals)
        return signals
    }

    private fun walk(node: AccessibilityNodeInfo, signals: MutableSet<String>) {
        if (node.isPassword) signals += "CREDENTIAL_REQUEST"
        val text = (node.text ?: node.contentDescription)?.toString().orEmpty()
        if (text.isNotEmpty()) {
            for ((rx, signal) in TABLE) {
                if (rx.containsMatchIn(text)) signals += signal
            }
        }
        // A pre-checked checkbox inside a dialog is the classic consent
        // dark pattern (GDPR requires unticked by default).
        if (node.className?.toString()?.contains("CheckBox") == true && node.isChecked) {
            signals += "CONSENT_DARK_PATTERN"
        }
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { walk(it, signals) }
        }
    }
}
