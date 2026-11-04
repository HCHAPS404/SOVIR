#!/usr/bin/env python3
"""Expand the synthetic text corpus (invariant 5: synthetic only, no user content).

Reads ml/datasets/text-corpus/{train,val,benign}.jsonl, emits expanded
{train,val,benign}.jsonl alongside (writes .expanded.jsonl so the seed set
stays reviewable). Two goals:

  1. Volume + lexical diversity: template banks per signal with slot fills
     (brand, amount, channel, deadline) in es-LATAM and en register.
  2. Hard benign negatives: legitimate texts that look like scams
     (urgency, payments, prizes, account notices) with ZERO signals.
     This is what drives benign FP from 5.4% toward the <=1% gate and
     unfreezes labels like URGENT_ACTION.

Run: python ml/pipelines/expand_corpus.py
"""
from __future__ import annotations

import itertools
import json
import pathlib
import random

ROOT = pathlib.Path(__file__).resolve().parents[2]
CORPUS = ROOT / "ml/datasets/text-corpus"
rng = random.Random(20261104)

BRANDS = ["BBVA", "Santander", "MercadoLibre", "Amazon", "Netflix", "OXXO",
          "Telcel", "CFE", "SAT", "DHL", "Correos", "PayPal", "Banco Azteca",
          "Nu", "Liverpool", "Walmart", "Coppel", "Elektra"]
AMOUNTS = ["$49", "$99", "$149", "$299", "$500", "$1,200", "$2,500", "49.99 USD",
           "350 MXN", "890 MXN", "1,500 MXN", "€30", "€75"]
DEADLINES = ["hoy", "en 24 horas", "en 48 horas", "antes del viernes",
             "esta semana", "hoy mismo", "de inmediato", "ahora"]
CHANNELS = ["WhatsApp", "Telegram", "SMS", "correo", "llamada", "el enlace"]

def fill(t: str) -> str:
    return (t.replace("{b}", rng.choice(BRANDS))
             .replace("{a}", rng.choice(AMOUNTS))
             .replace("{d}", rng.choice(DEADLINES))
             .replace("{c}", rng.choice(CHANNELS)))

# --- scam templates: signal -> template list --------------------------------
T = {
    "URGENT_ACTION": [
        "Tu cuenta de {b} será suspendida {d} si no verificas tus datos",
        "Actividad inusual detectada — actúa {d} o perderás acceso",
        "Último aviso: confirma tu identidad {d}",
        "Tu suscripción vence {d}, renuévala ya o pierdes el servicio",
        "Alerta de seguridad: tu sesión caduca {d}",
        "Acción requerida: tu envío será devuelto si no respondes {d}",
        "Your {b} account expires {d} — verify now to keep access",
        "Final notice: respond {d} or your case will be closed",
    ],
    "PAYMENT_REQUEST": [
        "Para liberar tu paquete paga {a} por {c}",
        "Se requiere un pago de {a} para completar la verificación",
        "Transfiere {a} a la cuenta indicada para continuar",
        "Realiza el depósito de {a} {d} para activar tu beneficio",
        "Payment of {a} required to process your {b} claim",
        "Wire {a} {d} to unlock your account",
        "Debes cubrir {a} en comisión antes de recibir los fondos",
    ],
    "CREDENTIAL_REQUEST": [
        "Ingresa tu contraseña de {b} para confirmar la transacción",
        "Confirma tu usuario y clave {d} para evitar el bloqueo",
        "Necesitamos que valides tu PIN y contraseña por seguridad",
        "Escribe tu número de tarjeta y CVV para verificar tu identidad",
        "Enter your {b} login and password to restore access",
        "Reply with your account number and security code",
    ],
    "PRIZE_LOTTERY_CLAIM": [
        "¡Felicidades! Ganaste {a} en el sorteo de {b}",
        "Has sido seleccionado como ganador del premio {b}",
        "Eres el usuario afortunado #{d} — reclama tu premio {d}",
        "Tu número ganó la rifa: reclama {a} por {c}",
        "Congratulations! You won {a} in the {b} giveaway",
        "You are the lucky winner — claim your prize {d}",
        "Premio confirmado: {a} esperándote, solo cubre el envío",
    ],
    "DELIVERY_CUSTOMS_FEE": [
        "Tu paquete está retenido en aduana — paga {a} de gestión",
        "Envío detenido: cubre el impuesto de importación de {a}",
        "Tu pedido de {b} requiere pago de arancel {a} para liberarse",
        "Package held at customs — pay {a} clearance fee {d}",
        "Tu encomienda internacional necesita una cuota de {a}",
    ],
    "EXTORTION_LANGUAGE": [
        "Tenemos tus videos grabados — paga {a} en bitcoin o publicamos todo",
        "Sabemos lo que hiciste; envía {a} o tus contactos lo verán",
        "Grabamos tu pantalla; transfiere {a} {d} o filtramos tus fotos",
        "We recorded you through your camera — send {a} or we leak it",
        "Si no pagas {a} {d}, hablaremos con tu familia",
    ],
    "SEED_PHRASE_REQUEST": [
        "Ingresa tu frase semilla de 12 palabras para validar la wallet",
        "Para recuperar tu billetera escribe tu mnemonic phrase",
        "Confirma tu seed phrase para sincronizar tu cuenta crypto",
        "Enter your 24-word recovery phrase to verify wallet ownership",
    ],
    "INVESTMENT_PROMISE": [
        "Invierte {a} y gana rendimientos del 300% mensual garantizado",
        "Nuestro bot de trading convierte {a} en ganancias semanales",
        "Duplica tu inversión en cripto con retorno asegurado",
        "Earn guaranteed 10x returns investing {a} with our AI fund",
        "Oportunidad única: {a} hoy, libertad financiera mañana",
    ],
    "AUTHORITY_IMPERSONATION": [
        "Aviso oficial del {b}: caso abierto a tu nombre, responde {d}",
        "El SAT requiere tu confirmación de datos fiscales {d}",
        "Este es el departamento legal de {b} — multa pendiente {a}",
        "Official notice from {b} compliance department — act {d}",
        "Habla la fiscalía: tu cuenta fue usada en un delito, coopera",
    ],
    "SCAREWARE_CLAIM": [
        "Tu teléfono tiene 5 virus — descarga el limpiador {d}",
        "Alerta crítica: tu dispositivo está infectado, actúa ya",
        "Detectamos troyanos en tu sistema — llama a soporte {d}",
        "Your device is infected — install the security fix now",
    ],
    "ROMANCE_BAIT": [
        "Mi amor, necesito {a} para el vuelo y por fin conocernos",
        "Eres especial para mí; ayúdame con {a} y te lo devuelvo",
        "Quiero verte pero mi tarjeta está bloqueada — préstame {a}",
        "I miss you so much — send {a} so I can finally visit you",
    ],
    "JOB_SCAM_OFFER": [
        "Trabaja desde casa 2h al día y gana {a} semanal — solo paga el kit",
        "Empleo inmediato: deposita {a} de capacitación y empiezas {d}",
        "Earn {a} weekly rating apps — pay a small registration fee",
        "Vacante exclusiva: salario de {a}, solo cubre el material inicial",
    ],
    "GIFT_CARD_PAYMENT": [
        "Paga con tarjeta de regalo de {b} y envíanos el código",
        "El pago solo se acepta en gift cards — compra {a} en {b}",
        "Buy a {a} gift card and send the code to complete payment",
    ],
    "OFF_PLATFORM_MOVE": [
        "Mejor seguimos por {c}, aquí es muy lento",
        "Escríbeme por {c} para cerrar el trato fuera de la app",
        "Let's move this conversation to {c} — faster there",
        "Contáctame directo por {c}, la plataforma cobra comisión",
    ],
    "MIRACLE_CURE_CLAIM": [
        "Cura la diabetes en 7 días con este remedio que ocultan",
        "Este suplemento elimina cualquier dolor — médicos lo prohiben",
        "This secret cure melts fat overnight — doctors hate it",
        "Adelgaza 10 kilos sin dieta con la gota milagrosa",
    ],
    "CONSENT_DARK_PATTERN": [
        "Acepta todas las cookies o no podrás continuar",
        "Para cancelar tu suscripción llama al 900 en horario de 9 a 10",
        "Tu prueba gratis se renueva automáticamente — cancelar es complicado",
        "You must accept data sharing to use the free version",
    ],
    "SCARCITY_PRESSURE": [
        "Solo quedan 2 unidades — compra {d} o lo pierdes",
        "Oferta por tiempo limitado: {d} termina para siempre",
        "Quedan 3 lugares en la promoción — aparta el tuyo ya",
        "Only 1 left at this price — buy {d}",
    ],
    "HIDDEN_FEE_PATTERN": [
        "Precio {a} — más cargos por servicio que verás al pagar",
        "Gratis el primer mes, luego se cobra automáticamente sin aviso",
        "Total at checkout includes mandatory convenience fees",
    ],
    "DATA_HARVESTING": [
        "Regístrate con tu INE, CURP y comprobante para el descuento",
        "Para el regalo necesitamos tu número de cuenta y RFC",
        "Share your ID, address and phone to claim the coupon",
    ],
    "LINK_DESTINATION_MISMATCH": [
        "Entra a {b}-seguridad-verificacion.xyz para confirmar",
        "Haz clic en bbmva-secure.top para restaurar tu acceso",
        "Visit amaz0n-help.click to update your account",
    ],
    "BULK_BUYER_LURE": [
        "Compro tu producto sin verlo — mi agente recoge y pago extra",
        "Te pago {a} de más si me envías el artículo ya mismo",
        "I'll pay {a} over asking — ship to my courier today",
    ],
    # ADR-0027 — manipulation/wellbeing signals (content-side tactics only;
    # never user emotional state). These fire at exposure level, not scam level.
    "POLARIZATION_BAIT": [
        "Estos políticos te odian y se ríen de ti — comparte si estás harto",
        "El otro bando quiere destruir todo lo que amas — despierta ya",
        "Nadie habla de lo que ELLOS te están haciendo — pásalo antes de que lo borren",
        "They laugh at people like you — share if you're tired of being mocked",
        "Este país se divide entre patriotas y traidores — tú eliges",
    ],
    "RAGE_BAIT_CONTENT": [
        "Mira lo que hace esta gente — indignante, nadie dice nada",
        "No vas a creer la injusticia de este video — comparte tu rabia",
        "Esto te va a enfurecer: lo hicieron otra vez y se salen con la suya",
        "This will make your blood boil — watch what they got away with",
    ],
    "EMOTIONAL_COERCION": [
        "Si de verdad te importara tu familia ya habrías actuado",
        "Solo una mala madre ignoraría esto para sus hijos",
        "Demuestra que vales algo — los demás ya lo hicieron",
        "Real friends share this — if you ignore it, you don't care",
        "Si no haces esto hoy, mañana te arrepentirás toda la vida",
    ],
    "IMPULSE_FUNNEL": [
        "¡ÚLTIMA OPORTUNIDAD! El método que las tiendas no quieren que sepas — 1 clic",
        "Solo hoy: el secreto de los ricos en oferta relámpago — compra sin pensar",
        "Timer countdown: 00:03 left — your discount disappears forever, buy NOW",
        "Agotándose: esto se agota y nunca vuelve — cómpralo antes de que suba",
    ],
    "DOOM_REINFORCEMENT": [
        "Todo se está cayendo a pedazos y solo va a empeorar — no hay salida",
        "Otro día, otra desgracia — el mundo ya no tiene remedio",
        "Ya nada tiene arreglo — cada día es peor que el anterior",
        "Everything is collapsing and there's nothing you can do about it",
    ],
    "INSECURITY_EXPLOITATION": [
        "Con esa cara nadie te va a tomar en serio — por eso necesitas esto",
        "Tu cuerpo no es suficiente — este producto lo arregla",
        "Todos notan tu problema menos tú — soluciónalo ya",
        "People can tell you're failing — fix it with this before it's too late",
    ],
}

# --- hard benign negatives: look scammy, are legitimate --------------------
B = [
    "Tu pedido de Amazon llega hoy — rastrea tu paquete aquí",
    "Tu suscripción de Netflix vence el viernes — renueva para no perder acceso",
    "Recordatorio: tu cita médica es mañana a las 9 — confirma asistencia",
    "Pago recibido: tu recibo de CFE ya está disponible",
    "Tu vuelo sale en 24 horas — haz check-in ahora",
    "Solo quedan 2 boletos para el concierto — aparta los tuyos",
    "Último día de la venta de aniversario — descuentos hasta 40%",
    "Tu cuenta de Nu tiene un cargo pendiente de $890 — revisa tu app",
    "Alerta: inicio de sesión desde un nuevo dispositivo — ¿fuiste tú?",
    "Confirma tu correo para completar el registro en MercadoLibre",
    "Tu factura de Telcel está lista — paga antes del corte",
    "Reclama tu cashback del 5% antes de que expire",
    "Ganaste un cupón de envío gratis en tu próxima compra",
    "Tu declaración anual vence este mes — agenda tu cita al SAT",
    "Se acabó tu prueba gratis — elige un plan para continuar",
    "Felicidades, subiste de nivel en el programa de puntos",
    "Tu transferencia fue programada para mañana",
    "Actualiza tu contraseña — lleva 90 días sin cambios",
    "Your package is out for delivery — track it here",
    "Payment due in 48 hours — pay your {b} bill now",
    "You have 24 hours left to claim your reward points",
    "Verify your email to finish signing up",
    "Your subscription renews automatically — manage it in settings",
    "Act now: your cart items are almost gone",
    "Security alert: new sign-in on your {b} account",
    "Tu pago de {a} fue procesado correctamente",
    "Recibimos tu solicitud — respuesta en 24 a 48 horas",
    "Quedan pocos lugares para el webinar del jueves",
    "Tu reservación expira si no confirmas hoy",
    "Oferta exclusiva para ti: envío gratis este fin de semana",
    # ADR-0027 hard negatives — legitimate content that resembles
    # manipulation tactics but isn't (news, editorial, real urgency).
    "Elecciones 2026: el debate entre candidatos sube el tono",
    "Editorial: la polarización crece y los expertos piden diálogo",
    "Marcha convocada para el sábado — organizadores esperan miles",
    "Estudio: las redes amplifican el contenido que provoca emociones",
    "Opinion: why this policy deserves your anger — a columnist's view",
    "Sale ends Sunday — countdown in store windows",
    "Médicos alertan sobre el estrés por consumo de noticias negativas",
    "Documental: la crisis que nadie quiso ver — estreno este mes",
    "Tu entrenador te manda: hoy sí o sí toca sesión, no excuses",
    "Publicidad honesta: este producto no es para todos, y está bien",
]

def expand(templates: dict, per_signal: int, lang_mix=0.5) -> list[dict]:
    rows = []
    for sig, tmpls in templates.items():
        n = 0
        for combo in itertools.cycle(tmpls):
            if n >= per_signal:
                break
            rows.append({"text": fill(combo), "signals": [sig],
                         "lang": "es" if rng.random() < lang_mix else "en",
                         "src": "expand-v1"})
            n += 1
    return rows

def main() -> None:
    train_new = expand(T, per_signal=90)          # ~1890
    val_new = expand(T, per_signal=18)            # ~378
    benign_new = []
    for combo in itertools.cycle(B):
        if len(benign_new) >= 620:
            break
        benign_new.append({"text": fill(combo), "signals": [],
                           "lang": "es" if rng.random() < 0.5 else "en",
                           "src": "expand-benign-v1"})
    rng.shuffle(train_new); rng.shuffle(val_new); rng.shuffle(benign_new)
    for name, rows in (("train", train_new), ("val", val_new), ("benign", benign_new)):
        out = CORPUS / f"{name}.expanded.jsonl"
        with out.open("w", encoding="utf-8") as fh:
            for r in rows:
                fh.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(f"{name}.expanded.jsonl: {len(rows)} rows")
    print("Merge: cat seed + expanded > final, or point trainer at both")

if __name__ == "__main__":
    main()
