// NOT_VERIFIED: Android SDK is a deferred toolchain — this file has not
// been compiled. It targets stable android.view.accessibility APIs only.
package app.sovir.android.observer

import android.view.accessibility.AccessibilityNodeInfo

/**
 * Maps an accessibility node tree to TYPED SIGNALS (ADR-0014). No text,
 * no node content, no field values leave this function: the caller gets
 * a signal enum set plus a package name, and the event digest binds only
 * package + signal set.
 */
object SignalExtractor {

    private val URGENCY = Regex(
        "(urgente|verifica|suspendida|bloqueada|expira|último aviso|verify|suspended|locked|immediately)",
        RegexOption.IGNORE_CASE,
    )
    private val PAYMENT = Regex(
        "(card|tarjeta|cvv|iban|pago|payment|checkout|billing)",
        RegexOption.IGNORE_CASE,
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
            if (URGENCY.containsMatchIn(text)) signals += "URGENT_ACTION"
            if (PAYMENT.containsMatchIn(text)) signals += "PAYMENT_REQUEST"
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
