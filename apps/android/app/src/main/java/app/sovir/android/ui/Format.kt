package app.sovir.android.ui

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val ES = Locale("es")

fun fmtDateTime(ms: Long): String = SimpleDateFormat("d MMM yyyy, HH:mm", ES).format(Date(ms))
fun fmtDate(ms: Long): String = SimpleDateFormat("d MMM yyyy", ES).format(Date(ms))
fun fmtTime(ms: Long): String = SimpleDateFormat("HH:mm", ES).format(Date(ms))
fun fmtUsd(v: Double): String = String.format(Locale.US, "$%.2f", v)
fun fmtMicroUsd(v: Long): String = String.format(Locale.US, "$%.4f", v / 1_000_000.0)
fun fmtPct(bp: Int): String = "${bp / 100} %"
fun shortDigest(d: String): String = d.removePrefix("sha256:").take(12)
fun plural(n: Int, one: String, many: String) = if (n == 1) "1 $one" else "$n $many"
