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
 *
 * ADR-0027 adds six content-side wellbeing signals: they name tactics
 * IN THE OBSERVED CONTENT (us-vs-them framing, manufactured outrage,
 * guilt pressure, zero-friction funnels, doom chains, insecurity
 * hooks) — never the state of the person looking at the screen.
 * Phrases are kept tight so legitimate journalism, verified offers
 * and emotional-support content stay clear.
 */
object SignalExtractor {

    private fun rx(vararg phrases: String) = Regex(
        phrases.joinToString("|") { Regex.escape(it) },
        RegexOption.IGNORE_CASE,
    )

    // Spanish urgency vocabulary grown from the real Gmail corpus:
    // "vence hoy"/"vencimiento" expired-notice language, "acción requerida"
    // and retail pressure frames the first pass missed (REAL_CORPUS.md).
    private val URGENCY = rx(
        "urgente", "verifica", "suspendida", "suspendido", "bloqueada", "bloqueado",
        "expira", "vence", "vencimiento", "caduca",
        "último aviso", "última oportunidad", "actúa ahora", "actua ahora",
        "plazo", "48 horas", "acción requerida", "cuenta limitada",
        "solo hoy", "sólo hoy", "tiempo limitado", "de inmediato",
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
        "has ganado", "felicidades ganaste", "premio", "lotería", "sorteo",
        "ganador", "has sido seleccionado", "eres el ganador",
        "reclama tu premio", "premio mayor", "usuario afortunado",
        "you won", "congratulations you", "prize", "lottery", "jackpot",
    )
    // --- ADR-0027: content-side manipulation signals (exposure level).
    // Only explicit framings/imperatives — a partisan op-ed, a real sale
    // or a supportive post must not trip these.
    private val POLARIZATION = rx(
        "ellos contra nosotros", "nosotros contra ellos",
        "nos quieren divididos", "nos quieren divididas",
        "nos quieren enfrentados", "nos enfrentan unos a otros",
        "despierta borregos", "despierten borregos",
        "they want us divided", "us vs them", "us versus them",
        "wake up sheeple",
    )
    private val RAGE_BAIT = rx(
        "te va a enfurecer", "te hará hervir la sangre",
        "esto te indignará", "te va a indignar",
        "comparte tu rabia", "comparte tu indignación",
        "comparte si estás harto", "comparte si estas harto",
        "nadie habla de esto",
        "will make your blood boil", "makes your blood boil",
        "share your anger", "share your outrage",
        "nobody talks about this", "nobody is talking about this",
    )
    private val EMOTIONAL_PRESSURE = rx(
        "si te importara", "si de verdad te importara",
        "si realmente te importara", "si de verdad quisieras",
        "una buena madre", "un buen padre", "un buen hijo",
        "if you cared about", "if you really cared",
        "a real friend would", "any decent person",
    )
    private val IMPULSE_FUNNEL = rx(
        "compra sin pensar", "compra ahora piensa después",
        "compra ahora y piensa después",
        "un clic y es tuyo", "un click y es tuyo",
        "a un clic de ser tuyo", "no lo consultes con nadie",
        "buy without thinking", "buy now think later",
        "one click and it's yours", "one click and it is yours",
        "1 click and it's yours", "your deal dies in",
    )
    private val DOOM_SPIRAL = rx(
        "todo se está cayendo", "todo se esta cayendo",
        "todo se cae a pedazos", "no hay salida",
        "ya nada tiene arreglo", "todo empeora", "todo va a peor",
        "everything is collapsing", "it's all falling apart",
        "there is no way out", "there's no way out",
        "might as well keep scrolling",
    )
    private val INSECURITY_HOOK = rx(
        "con esa cara nadie", "con ese cuerpo nadie", "con esa piel nadie",
        "a tu edad y sin", "nadie te contratará con ese",
        "nadie te contratara con ese", "nadie te tomará en serio con esa",
        "nobody takes you seriously with",
        "with that face nobody", "with that body nobody",
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
        POLARIZATION to "POLARIZATION_BAIT",
        RAGE_BAIT to "RAGE_BAIT_CONTENT",
        EMOTIONAL_PRESSURE to "EMOTIONAL_COERCION",
        IMPULSE_FUNNEL to "IMPULSE_FUNNEL",
        DOOM_SPIRAL to "DOOM_REINFORCEMENT",
        INSECURITY_HOOK to "INSECURITY_EXPLOITATION",
    )

    // Contract bound (observed-event.schema.json maxItems /
    // sovir_domain::MAX_EVENT_SIGNALS): an event carries at most eight
    // signals. The ordering below mirrors sovir_domain::risk_signal_priority
    // verbatim (also apps/extension/background.js SIGNAL_PRIORITY):
    // corroborants that can escalate a policy decision rank first; the
    // six ADR-0027 wellbeing signals rank last — exposure-level hints,
    // never escalation evidence on their own. Unknown labels sort after
    // the list, alphabetically.
    private const val MAX_EVENT_SIGNALS = 8
    private val SIGNAL_PRIORITY = listOf(
        "SEED_PHRASE_REQUEST",
        "EXTORTION_LANGUAGE",
        "PAYMENT_REQUEST",
        "CREDENTIAL_REQUEST",
        "GIFT_CARD_PAYMENT",
        "AUTHORITY_IMPERSONATION",
        "DOM_BRAND_MISMATCH",
        "OFF_PLATFORM_MOVE",
        "LINK_DESTINATION_MISMATCH",
        "DATA_HARVESTING",
        "SUSPICIOUS_DOMAIN",
        "SCAREWARE_CLAIM",
        "PRIZE_LOTTERY_CLAIM",
        "DELIVERY_CUSTOMS_FEE",
        "INVESTMENT_PROMISE",
        "HIDDEN_FEE_PATTERN",
        "JOB_SCAM_OFFER",
        "ROMANCE_BAIT",
        "MIRACLE_CURE_CLAIM",
        "BULK_BUYER_LURE",
        "SCARCITY_PRESSURE",
        "CONSENT_DARK_PATTERN",
        "QR_PRESENT",
        "URGENT_ACTION",
        "IDENTITY_UNVERIFIED",
        "TRACKING_OBSERVED",
        "USER_DEFINED_EXPOSURE_LIMIT",
        "POLARIZATION_BAIT",
        "RAGE_BAIT_CONTENT",
        "EMOTIONAL_COERCION",
        "IMPULSE_FUNNEL",
        "DOOM_REINFORCEMENT",
        "INSECURITY_EXPLOITATION",
    )
    private val PRIORITY_INDEX = SIGNAL_PRIORITY.withIndex().associate { it.value to it.index }

    private fun bounded(signals: Set<String>): Set<String> = signals
        .sortedWith(compareBy<String> { PRIORITY_INDEX[it] ?: SIGNAL_PRIORITY.size }.thenBy { it })
        .take(MAX_EVENT_SIGNALS)
        .toSet()

    fun extract(root: AccessibilityNodeInfo?): Set<String> = extractWithHint(root).first

    /**
     * Signals + bounded text_hint for the LOCAL council's onnx-text voter
     * (ADR-0025). Only node texts that fired a pattern are collected —
     * the scam-relevant span, ≤1500 chars. Ephemeral: forwarded to the
     * local assess endpoint, never persisted, never leaves the device
     * except to the configured SOVIR API.
     */
    fun extractWithHint(root: AccessibilityNodeInfo?): Pair<Set<String>, String> {
        if (root == null) return emptySet<String>() to ""
        val signals = mutableSetOf<String>()
        val hint = StringBuilder()
        walk(root, signals, hint)
        return bounded(signals) to hint.toString().take(1500)
    }

    private fun walk(
        node: AccessibilityNodeInfo,
        signals: MutableSet<String>,
        hint: StringBuilder = StringBuilder(),
    ) {
        // Password nodes contribute the signal only — whatever the field
        // exposes stays out of the hint.
        val text = if (node.isPassword) {
            signals += "CREDENTIAL_REQUEST"
            ""
        } else {
            node.text?.toString().orEmpty()
                .ifEmpty { node.contentDescription?.toString().orEmpty() }
        }
        if (text.isNotEmpty()) {
            var matched = false
            for ((rx, signal) in TABLE) {
                if (rx.containsMatchIn(text)) {
                    signals += signal
                    matched = true
                }
            }
            if (matched && hint.length < 1500) {
                hint.append(text.trim().replace(Regex("\\s+"), " ").take(200)).append('\n')
            }
        }
        // A pre-checked checkbox inside a dialog is the classic consent
        // dark pattern (GDPR requires unticked by default).
        if (node.className?.toString()?.contains("CheckBox") == true && node.isChecked) {
            signals += "CONSENT_DARK_PATTERN"
        }
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { walk(it, signals, hint) }
        }
    }
}
