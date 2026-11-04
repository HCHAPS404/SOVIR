#!/usr/bin/env python3
"""Build the synthetic text corpus for the multi-label signal classifier.

Template-based generation, English + Spanish, no user content: every sample
is authored here from public scam-pattern knowledge (FTC/INCIBE advisories
describe these lures publicly). Signals that are not text-observable
(QR_PRESENT, TRACKING_OBSERVED, DOM_BRAND_MISMATCH, IDENTITY_UNVERIFIED,
USER_DEFINED_EXPOSURE_LIMIT, SUSPICIOUS_DOMAIN) are produced by other
voters and intentionally absent from the label space.

Output: ml/datasets/text-corpus/{train,val,benign}.jsonl
Rows: {"text": ..., "signals": [...], "lang": "en"|"es", "src": "tmpl"}
"""
from __future__ import annotations

import itertools
import json
import pathlib
import random
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "ml/datasets/text-corpus"

BRANDS = ["PayPal", "Amazon", "Netflix", "Microsoft", "Apple", "DHL", "FedEx",
          "Chase Bank", "BBVA", "Santander", "Banco Azteca", "Mercado Libre",
          "Coinbase", "Binance", "Steam", "Instagram", "WhatsApp", "AT&T",
          "Telcel", "Movistar", "OXXO", "SAT", "IMSS", "Reniec", "Correos"]
AMOUNTS = ["$19.99", "$49.99", "$299", "$1,250", "MXN 850", "€120", "$39.90"]
DAYS = ["24 hours", "48 hours", "12 hours", "24 horas", "48 horas", "hoy mismo"]
FEES = ["$4.99", "$12.50", "$25", "MXN 99", "$2.99", "$49"]

# (signal, [templates]) — {b}=brand {a}=amount {d}=deadline {f}=fee
T: dict[str, list[str]] = {
    "URGENT_ACTION": [
        "URGENT: your {b} account will be suspended within {d}",
        "Immediate action required — verify now or lose access in {d}",
        "Final notice: respond within {d} to avoid permanent closure",
        "ACCIÓN URGENTE: tu cuenta de {b} será suspendida en {d}",
        "Último aviso: responde en {d} o perderás el acceso",
        "Debes actuar AHORA — quedan {d} para confirmar tu identidad",
    ],
    "PAYMENT_REQUEST": [
        "Send {a} to release your pending transaction",
        "Pay the {f} processing fee to complete your order",
        "Wire {a} to the following account to secure the deal",
        "Envía {a} para liberar tu pedido retenido",
        "Paga la comisión de {f} para completar la transferencia",
        "Transfiere {a} a esta cuenta para asegurar la operación",
    ],
    "CREDENTIAL_REQUEST": [
        "Confirm your {b} password to restore access",
        "Enter your card number and CVV to verify your identity",
        "Reply with your username and password for manual verification",
        "Confirma tu contraseña de {b} para restablecer el acceso",
        "Ingresa tu número de tarjeta y CVV para verificar tu identidad",
        "Escribe tu usuario y contraseña para validar tu cuenta",
    ],
    "EXTORTION_LANGUAGE": [
        "We have compromising videos of you — pay {a} or we share them",
        "Your files are encrypted. Send {a} in Bitcoin or lose everything",
        "Tenemos videos comprometedores tuyos — paga {a} o los publicamos",
        "Tus archivos están cifrados. Envía {a} en Bitcoin o lo pierdes todo",
        "If you don't cooperate we will expose your data to your contacts",
    ],
    "SCAREWARE_CLAIM": [
        "WARNING: 5 viruses detected on your device — clean now",
        "Your system is infected! Call support immediately",
        "ALERTA: se detectaron virus en tu dispositivo — limpia ahora",
        "Tu sistema está infectado. Llama a soporte inmediatamente",
        "Critical security breach detected — do not turn off your PC",
    ],
    "PRIZE_LOTTERY_CLAIM": [
        "Congratulations! You won {a} in the {b} sweepstakes",
        "You've been selected for a {a} reward — claim now",
        "¡Felicidades! Ganaste {a} en el sorteo de {b}",
        "Fuiste seleccionado para un premio de {a} — reclámalo ya",
        "Winner notification: your prize of {a} awaits",
    ],
    "INVESTMENT_PROMISE": [
        "Guaranteed 300% returns in 30 days — join our crypto fund",
        "Turn {a} into {a} weekly with our AI trading bot",
        "Gana 300% garantizado en 30 días con nuestro fondo crypto",
        "Convierte {a} en ganancias semanales con nuestro bot de trading",
        "Risk-free investment, double your money in two weeks",
    ],
    "GIFT_CARD_PAYMENT": [
        "Buy {a} in iTunes gift cards and send the codes",
        "Pay via Steam/Google Play gift card — no refunds needed",
        "Compra tarjetas de regalo de {b} por {a} y envía los códigos",
        "Paga con tarjetas Google Play — solo así aceptamos el pago",
        "Scratch the gift card and send a photo of the code",
    ],
    "SEED_PHRASE_REQUEST": [
        "Enter your 12-word recovery phrase to sync your wallet",
        "Verify your seed phrase to prevent wallet suspension",
        "Ingresa tu frase de recuperación de 12 palabras para sincronizar",
        "Escribe tu seed phrase para evitar la suspensión de tu wallet",
        "Type your mnemonic phrase to complete wallet validation",
    ],
    "DELIVERY_CUSTOMS_FEE": [
        "Your package is held at customs — pay {f} to release it",
        "{b} shipment pending: settle the {f} customs fee",
        "Tu paquete está retenido en aduana — paga {f} para liberarlo",
        "Envío de {b} pendiente: cubre el cargo aduanero de {f}",
        "Delivery failed — pay {f} redelivery charge",
    ],
    "SCARCITY_PRESSURE": [
        "Only 2 left at this price — buy before midnight",
        "Last chance: offer expires in {d}",
        "Quedan solo 2 unidades a este precio — compra ya",
        "Última oportunidad: la oferta vence en {d}",
        "97% claimed — reserve your spot now",
    ],
    "JOB_SCAM_OFFER": [
        "Work from home, earn {a}/week — no experience needed",
        "Mystery shopper position: keep the items + {a} pay",
        "Trabaja desde casa, gana {a} por semana — sin experiencia",
        "Puesto de comprador misterioso: quédate los productos + {a}",
        "Easy task job: like videos and earn daily",
    ],
    "ROMANCE_BAIT": [
        "I feel such a connection with you — can you help me with {a}?",
        "My flight to meet you needs {a} for paperwork",
        "Siento una conexión contigo — ¿me prestas {a} para el viaje?",
        "Mi vuelo para conocerte requiere {a} de trámites",
        "I love you — please send funds so we can finally meet",
    ],
    "MIRACLE_CURE_CLAIM": [
        "Doctors hate this trick — cure diabetes in 7 days naturally",
        "Secret remedy the pharma industry hides from you",
        "Los doctores odian este truco — cura natural en 7 días",
        "Remedio secreto que la industria farmacéutica te oculta",
        "Lose 15kg in 2 weeks with one pill — no diet needed",
    ],
    "DATA_HARVESTING": [
        "Complete this survey with your SSN and birthdate for a gift",
        "Enter your full name, address and ID to claim eligibility",
        "Llena esta encuesta con tu CURP y fecha de nacimiento para el regalo",
        "Escribe tu nombre completo, dirección e identificación para aplicar",
        "Verify your personal data to continue",
    ],
    "OFF_PLATFORM_MOVE": [
        "Let's continue on Telegram — message me at @dealer",
        "Move this conversation to WhatsApp for faster reply",
        "Sigamos por Telegram — escríbeme a @vendedor",
        "Pasemos la conversación a WhatsApp para responderte rápido",
        "Contact me on Signal instead, it's safer",
    ],
    "BULK_BUYER_LURE": [
        "I'll buy your entire stock at double price — ship first",
        "Bulk order: 50 units, paying in advance via check",
        "Te compro todo el stock al doble de precio — envía primero",
        "Pedido mayorista: 50 unidades, pago por adelantado con cheque",
        "I need 200 items for my company — no questions asked",
    ],
    "HIDDEN_FEE_PATTERN": [
        "Free trial* (*auto-renews at {a}/month, cancel within {d})",
        "$0 today — service fee of {f} applies after activation",
        "Prueba gratis* (*se renueva a {a}/mes, cancela en {d})",
        "$0 hoy — cargo de servicio de {f} tras la activación",
        "Free* (*shipping, handling and membership fees apply)",
    ],
    "CONSENT_DARK_PATTERN": [
        "By clicking Accept you agree to share your data with 412 partners",
        "Declining requires mailing a letter to our office",
        "Al aceptar compartes tus datos con 412 socios comerciales",
        "Para rechazar debes enviar una carta física a nuestras oficinas",
        "Uncheck 47 boxes to opt out of marketing",
    ],
    "AUTHORITY_IMPERSONATION": [
        "This is the IRS — you owe {a} in back taxes, pay immediately",
        "Official notice from {b} legal department — case #8841",
        "Somos el SAT — debes {a} de impuestos, paga de inmediato",
        "Aviso oficial del departamento legal de {b} — caso #8841",
        "Federal warrant issued — contact us to avoid arrest",
    ],
    "LINK_DESTINATION_MISMATCH": [
        "Click here to verify your {b} account: {b}-secure-login.info",
        "Login at secure-{b}-verify.top to confirm",
        "Verifica tu cuenta de {b} aquí: {b}-seguro-login.info",
        "Entra a verificar-{b}.top para confirmar tu acceso",
        "Visit our official portal at {b}-support-help.xyz",
    ],
}

BENIGN = [
    "Your order has shipped — tracking number attached",
    "Reminder: your appointment is tomorrow at 10am",
    "Team meeting moved to 3pm, see you there",
    "Your statement for October is ready to download",
    "Thanks for your purchase — receipt attached",
    "Tu pedido fue enviado — adjuntamos número de rastreo",
    "Recordatorio: tu cita es mañana a las 10am",
    "La reunión se movió a las 3pm, nos vemos ahí",
    "Tu estado de cuenta de octubre ya está disponible",
    "Gracias por tu compra — adjuntamos el recibo",
    "Password reset completed successfully — no action needed",
    "Your subscription renews on the 15th as usual",
    "Weekly digest: 3 new items in your lists",
    "Flight check-in opens 24h before departure",
    "Tu contraseña se actualizó correctamente — no necesitas hacer nada",
    "Tu suscripción se renueva el día 15 como siempre",
    "Resumen semanal: 3 elementos nuevos en tus listas",
    "El check-in de tu vuelo abre 24h antes de la salida",
    "Invoice #1024 paid — thank you",
    "Factura #1024 pagada — gracias",
    "Welcome back — here's what's new this week",
    "Bienvenido de vuelta — esto es lo nuevo esta semana",
    "Your refund was processed and will appear in 3-5 days",
    "Tu reembolso fue procesado y llegará en 3-5 días",
    "Meeting notes from today's call attached",
    "Notas de la llamada de hoy adjuntas",
    "Your package arrives today — see tracking for details",
    "Tu paquete llega hoy — revisa el rastreo para detalles",
    "New login from Chrome on Windows — was this you?",
    "Nuevo inicio de sesión desde Chrome en Windows — ¿fuiste tú?",
    "Your {b} receipt for {a} is attached",
    "Tu recibo de {b} por {a} está adjunto",
    "Scheduled maintenance this Sunday 2-4am — brief downtime expected",
    "Mantenimiento programado este domingo 2-4am — breve corte esperado",
    "Your trial ends soon — upgrade to keep premium features",
    "Tu prueba termina pronto — actualiza para mantener funciones premium",
    "Dinner at 8? I made the reservation",
    "¿Cena a las 8? Ya hice la reservación",
    "The report you asked for is in the shared folder",
    "El reporte que pediste está en la carpeta compartida",
    "Happy birthday! Hope you have a great day",
    "¡Feliz cumpleaños! Que tengas un gran día",
    "Pick up milk on your way home please",
    "Compra leche de camino a casa porfa",
    "Can you review my pull request when you get a chance?",
    "¿Puedes revisar mi pull request cuando tengas chance?",
    "Your {b} bill for {a} is due on the 5th",
    "Tu factura de {b} por {a} vence el día 5",
    "Delivery scheduled for Friday between 9am-1pm",
    "Entrega programada para el viernes entre 9am-1pm",
    "Your verification code is 482913 — valid for 10 minutes",
    "Tu código de verificación es 482913 — válido por 10 minutos",
    "Webinar recording is now available in your library",
    "La grabación del webinar ya está en tu biblioteca",
    "Quarterly results attached — let me know your thoughts",
    "Resultados trimestrales adjuntos — dime qué opinas",
    "Your return was received — refund processing started",
    "Recibimos tu devolución — el reembolso está en proceso",
]


def fill(t: str, rng: random.Random) -> str:
    return (t.replace("{b}", rng.choice(BRANDS))
             .replace("{a}", rng.choice(AMOUNTS))
             .replace("{d}", rng.choice(DAYS))
             .replace("{f}", rng.choice(FEES)))


def main() -> int:
    rng = random.Random(42)
    rows: list[dict] = []
    signals = sorted(T)
    for sig, templates in T.items():
        for i, t in enumerate(itertools.cycle(templates)):
            if i >= 30:  # ~30 samples per signal
                break
            txt = fill(t, rng)
            sigs = [sig]
            # common co-occurrences: scam lures stack pressure tactics
            if sig in {"PAYMENT_REQUEST", "CREDENTIAL_REQUEST", "GIFT_CARD_PAYMENT"} and rng.random() < 0.4:
                sigs.append("URGENT_ACTION")
            if sig == "EXTORTION_LANGUAGE" and rng.random() < 0.5:
                sigs.append("PAYMENT_REQUEST")
            if sig == "DELIVERY_CUSTOMS_FEE" and rng.random() < 0.5:
                sigs.append("PAYMENT_REQUEST")
            rows.append({"text": txt, "signals": sigs,
                         "lang": "es" if any(c in txt for c in "áéíóúñ¿¡") else "en",
                         "src": "tmpl"})
    # paraphrase-style jitter: lowercase some, strip punctuation some
    for r in rows:
        if rng.random() < 0.25:
            r["text"] = r["text"].lower()
    rng.shuffle(rows)
    n_val = int(0.15 * len(rows))
    val, train = rows[:n_val], rows[n_val:]
    benign_rows = [{"text": fill(b, rng), "signals": [], "lang":
                    "es" if any(c in b for c in "áéíóúñ¿¡") else "en",
                    "src": "benign"} for b in BENIGN]
    # benign augmentation — same intent, new surface forms
    for _ in range(140):
        b = fill(rng.choice(BENIGN), rng)
        if rng.random() < 0.3:
            b = b[0].lower() + b[1:]
        if rng.random() < 0.2:
            b += " — automated message, do not reply"
        benign_rows.append({"text": b, "signals": [], "lang":
                            "es" if any(c in b for c in "áéíóúñ¿¡") else "en",
                            "src": "benign-aug"})
    OUT.mkdir(parents=True, exist_ok=True)
    for name, data in (("train", train), ("val", val), ("benign", benign_rows)):
        (OUT / f"{name}.jsonl").write_text(
            "\n".join(json.dumps(r, ensure_ascii=False) for r in data) + "\n",
            encoding="utf-8")
    print(f"wrote {len(train)} train / {len(val)} val / {len(benign_rows)} benign "
          f"-> {OUT} | signals covered: {len(signals)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
