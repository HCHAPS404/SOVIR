package app.sovir.android.model

// Same vocabulary as the web console (apps/console/lib/humanize.ts and
// digest.ts): meaning first, technical id as a muted second line.

enum class Tone { Success, Warning, Danger, Unknown, Brand, Muted }

object Humanize {
    private val SIGNALS = mapOf(
        "PAYMENT_REQUEST" to "Pago solicitado bajo sospecha",
        "CREDENTIAL_REQUEST" to "Petición de contraseña",
        "URGENT_ACTION" to "Presión de urgencia",
        "IDENTITY_UNVERIFIED" to "Identidad sin verificar",
        "CONSENT_DARK_PATTERN" to "Diseño engañoso",
        "TRACKING_OBSERVED" to "Rastreo oculto",
        "HIDDEN_FEE_PATTERN" to "Cargo oculto",
        "USER_DEFINED_EXPOSURE_LIMIT" to "Límite de exposición",
        "LINK_DESTINATION_MISMATCH" to "Enlace que miente su destino",
        "SUSPICIOUS_DOMAIN" to "Dominio de dudosa procedencia",
        "EXTORTION_LANGUAGE" to "Lenguaje de amenaza o chantaje",
        "SCAREWARE_CLAIM" to "Falsa alarma de virus",
        "PRIZE_LOTTERY_CLAIM" to "Premio o sorteo falso",
        "INVESTMENT_PROMISE" to "Promesa de dinero garantizado",
        "GIFT_CARD_PAYMENT" to "Pago con tarjetas regalo",
        "SEED_PHRASE_REQUEST" to "Petición de frase de recuperación",
        "DELIVERY_CUSTOMS_FEE" to "Paquete retenido con cargo",
        "AUTHORITY_IMPERSONATION" to "Suplantación de autoridad",
        "DOM_BRAND_MISMATCH" to "Marca servida desde dominio ajeno",
        "SCARCITY_PRESSURE" to "Presión por escasez o tiempo",
        "JOB_SCAM_OFFER" to "Oferta de trabajo sospechosa",
        "ROMANCE_BAIT" to "Cebo sentimental con petición de dinero",
        "MIRACLE_CURE_CLAIM" to "Remedio milagroso",
        "DATA_HARVESTING" to "Recolección excesiva de datos",
        "OFF_PLATFORM_MOVE" to "Conversación movida fuera de la plataforma",
        "BULK_BUYER_LURE" to "Compra inmediata al contado",
        "QR_PRESENT" to "Código QR en pantalla",
        "POLARIZATION_BAIT" to "Contenido que enfrenta bandos para provocar",
        "RAGE_BAIT_CONTENT" to "Contenido diseñado para indignar",
        "EMOTIONAL_COERCION" to "Presión emocional para que actúes",
        "IMPULSE_FUNNEL" to "Embudo de compra impulsiva manufacturado",
        "DOOM_REINFORCEMENT" to "Cadena de contenido fatalista",
        "INSECURITY_EXPLOITATION" to "Explotación de inseguridades para vender",
        "VISUAL_BRAND_MATCH" to "Logo de marca confirmado en dominio ajeno",
    )

    private val HYPOTHESES = mapOf(
        "authority_coercion" to "suplantación de autoridad para presionar",
        "bulk_buyer_lure" to "comprador falso que mueve la venta fuera",
        "credential_phishing" to "robo de credenciales",
        "credential_request_unverified" to "piden credenciales sin identidad verificada",
        "customs_fee_phish" to "cargo aduanero falso",
        "data_harvesting" to "cosecha de datos personales",
        "extortion_attempt" to "intento de extorsión",
        "gift_card_shakedown" to "exigencia de pago con tarjetas regalo",
        "guaranteed_investment" to "inversión con ganancia garantizada",
        "health_fraud_pitch" to "cura milagrosa fraudulenta",
        "identity_unverified" to "identidad no verificada",
        "job_fee_bait" to "empleo que cobra cuota inicial",
        "link_spoofing" to "enlace que finge ser otro",
        "manipulative_pattern" to "patrón manipulativo",
        "offplatform_lure" to "intento de moverte fuera de la plataforma",
        "payment_fraud_attempt" to "intento de fraude de pago",
        "payment_request_unverified" to "piden pago sin identidad verificada",
        "privacy_tracking_exposure" to "exposición de rastreo",
        "prize_advance_fee" to "premio que exige pago por adelantado",
        "qr_phishing_lure" to "cebo de phishing por QR",
        "romance_money_bait" to "gancho romántico con pedido de dinero",
        "scareware_lure" to "susto técnico para que instales algo",
        "seed_phrase_theft" to "robo de frase de recuperación",
        "urgency_pressure" to "presión de urgencia",
        "text_classifier_fraud" to "texto con forma de fraude",
        "text_classifier_spam" to "texto con forma de spam",
        "no_pattern_detected" to "sin patrón de riesgo",
    )

    /** Relative alarm weight — drives which signal names an observation. */
    private val SEVERITY = mapOf(
        "EXTORTION_LANGUAGE" to 100, "SEED_PHRASE_REQUEST" to 98,
        "GIFT_CARD_PAYMENT" to 96, "SCAREWARE_CLAIM" to 94,
        "AUTHORITY_IMPERSONATION" to 92, "CREDENTIAL_REQUEST" to 90,
        "PRIZE_LOTTERY_CLAIM" to 88, "PAYMENT_REQUEST" to 86,
        "HIDDEN_FEE_PATTERN" to 84, "DELIVERY_CUSTOMS_FEE" to 82,
        "INVESTMENT_PROMISE" to 80, "JOB_SCAM_OFFER" to 78,
        "ROMANCE_BAIT" to 76, "MIRACLE_CURE_CLAIM" to 74,
        "OFF_PLATFORM_MOVE" to 72, "BULK_BUYER_LURE" to 70,
        "DOM_BRAND_MISMATCH" to 68, "LINK_DESTINATION_MISMATCH" to 66,
        "SUSPICIOUS_DOMAIN" to 64, "IDENTITY_UNVERIFIED" to 62,
        "URGENT_ACTION" to 60, "SCARCITY_PRESSURE" to 58,
        "QR_PRESENT" to 40, "DATA_HARVESTING" to 36,
        "CONSENT_DARK_PATTERN" to 34, "TRACKING_OBSERVED" to 32,
        "USER_DEFINED_EXPOSURE_LIMIT" to 30,
        // Manipulation/wellbeing signals (ADR-0027) — exposure-level, below
        // every scam signal on purpose: they inform, they don't alarm.
        "EMOTIONAL_COERCION" to 28, "INSECURITY_EXPLOITATION" to 26,
        "IMPULSE_FUNNEL" to 24, "RAGE_BAIT_CONTENT" to 22,
        "POLARIZATION_BAIT" to 20, "DOOM_REINFORCEMENT" to 18,
    )

    /** The signal that should name an observation — most alarming first. */
    fun dominantSignal(signals: List<String>): String? =
        signals.maxByOrNull { SEVERITY[it] ?: 50 }

    fun signal(id: String) = SIGNALS[id] ?: id.lowercase().replace('_', ' ').replaceFirstChar { it.uppercase() }
    fun hypothesis(id: String) = HYPOTHESES[id] ?: id.replace('_', ' ')
    fun isBenign(hypotheses: List<String>) = hypotheses.isEmpty() || hypotheses.all { it == "no_pattern_detected" }

    fun source(sourceId: String) = when (sourceId) {
        "screen-observer:android" -> "Este teléfono"
        "screen-observer:ext" -> "Extensión del navegador"
        "screen-observer:sim" -> "Observador simulado"
        "console-lab" -> "Laboratorio de la consola"
        "browser.synthetic" -> "Navegador simulado"
        else -> sourceId
    }

    fun modality(m: String) = when (m) {
        "TEXT" -> "Texto de una página"
        "UI_TREE" -> "Pantalla de una app"
        "IMAGE_REGION" -> "Imagen o código QR"
        else -> m.lowercase()
    }

    fun dataClass(c: String) = when (c) {
        "PUBLIC" -> "Pública"
        "PERSONAL" -> "Personal"
        "SENSITIVE" -> "Sensible"
        "CREDENTIAL" -> "Credencial"
        else -> c.lowercase()
    }

    fun platform(p: String) = when (p) {
        "ANDROID" -> "Android"
        "IOS" -> "iPhone / iPad"
        "WINDOWS" -> "Windows"
        "MACOS" -> "Mac"
        "LINUX" -> "Linux"
        "BROWSER_EXTENSION" -> "Extensión de navegador"
        else -> p
    }

    /** What kind of thing a device is — "un móvil, un pc, una tablet". */
    fun deviceKind(p: String) = when (p) {
        "ANDROID" -> "Móvil"
        "IOS" -> "iPhone o iPad"
        "BROWSER_EXTENSION", "WINDOWS", "MACOS", "LINUX" -> "Ordenador"
        else -> platform(p)
    }

    fun voter(v: String) = when (v) {
        "heuristic" -> "Reglas locales"
        "onnx-text" -> "Clasificador de texto local"
        "onnx-visual" -> "Clasificador visual local"
        "remote", "meta" -> "Modelo remoto"
        else -> v
    }

    /** Council provenance → what the arbitration actually did. */
    fun councilOutcome(provenance: String) = when {
        provenance.contains("council:local_settled") -> "Resuelto en el servidor, sin modelo remoto" to Tone.Success
        provenance.contains("council:agree") -> "Los votantes coinciden" to Tone.Brand
        provenance.contains("council:disputed") -> "Los votantes no coinciden: revisa la evidencia" to Tone.Warning
        provenance.contains("council:single") -> "Un solo votante respondió" to Tone.Unknown
        else -> "Origen: $provenance" to Tone.Unknown
    }

    data class StateCopy(val label: String, val tone: Tone)

    fun interventionState(state: String) = when (state) {
        "pending" -> StateCopy("Nueva", Tone.Warning)
        "delivered" -> StateCopy("Vista", Tone.Brand)
        "failed" -> StateCopy("No se pudo mostrar", Tone.Danger)
        "cancelled" -> StateCopy("Cancelada", Tone.Unknown)
        else -> StateCopy(state, Tone.Unknown)
    }

    /** One line describing an alert from its linked evidence, never invented. */
    fun interventionSummary(i: Intervention, event: ObservedEvent?): String {
        if (event == null) return "Evidencia no disponible en este dispositivo"
        val top = event.signals.firstOrNull()?.let(::signal) ?: "Señal de riesgo"
        return "$top · ${source(event.sourceId)}"
    }

    fun auditAction(action: String) = when (action) {
        "session_issued" -> "Inicio de sesión"
        "session_revoked" -> "Cierre de sesión"
        "consent_granted" -> "Permiso concedido"
        "consent_revoked" -> "Permiso revocado"
        "event_ingested" -> "Señal observada"
        "inference_called" -> "Análisis del concilio"
        "device_registered" -> "Dispositivo registrado"
        "device_revoked" -> "Dispositivo revocado"
        "intervention_dispatched" -> "Alerta enviada"
        "data_exported" -> "Exportaste tus datos"
        "data_purged" -> "Borraste tus datos"
        else -> action.replace('_', ' ')
    }

    fun auditTone(action: String) = when (action) {
        "consent_granted", "device_registered" -> Tone.Success
        "intervention_dispatched" -> Tone.Warning
        "consent_revoked", "device_revoked", "data_purged" -> Tone.Danger
        "event_ingested" -> Tone.Brand
        else -> Tone.Unknown
    }
}
