# SOVIR — Guiones de videos de pitch (6)

**Estado:** borrador de trabajo. Copy alineado con `BRAND_DECISION_WORKSHOP.md`
(sobrio, preciso, cercano, firme; nunca paranoico ni controlador). Taglines son
propuestas pendientes de sign-off humano. Todo claim marcado `[VERIFICAR]`
requiere confirmación antes de publicar.

## Mapa de la serie

| # | Idioma | Concepto | Formato | Duración objetivo |
|---|--------|----------|---------|-------------------|
| 1 | Español | Persona a cámara + demo — pitch | 16:9 (master) + corte 9:16 | ~100 s |
| 2 | English | Person on camera + demo — pitch | 16:9 (master) + corte 9:16 | ~100 s |
| 3 | Español | Montaje musical, sin VO (texto en pantalla) | 16:9 + 9:16 | ~55 s |
| 4 | English | Music montage, no VO (on-screen text) | 16:9 + 9:16 | ~55 s |
| 5 | Español | "La prueba": walkthrough del pipeline real | 16:9 | ~120 s |
| 6 | English | "The wiring": real pipeline walkthrough | 16:9 | ~120 s |

Lógica de la serie: **1–2** venden la visión con cara humana, **3–4** generan
recuerdo de marca (compartible, silenciable, apto para redes), **5–6** cierran
con credibilidad técnica para jurados e inversores. La última tanda se eligió
como "prueba real" porque el activo más diferenciador de SOVIR es que el
pipeline ya corre end-to-end en local — mostrarlo es mejor marketing que
cualquier afirmación.

## Claims: qué puede decirse y cómo

| Se puede afirmar (verificado) | Debe enunciarse como visión/roadmap |
|---|---|
| Pipeline local E2E: sensor → consentimiento → consejo → decisión → consola | "Protección en producción" / disponibilidad en tiendas |
| Extensión MV3 y app Android verificadas E2E | iOS y escritorio (dirección: roadmap) |
| Veredicto explicable con `votes[]`, evidencia y procedencia | Cifras de precisión del modelo visual (13% FP benigno — no citar performance) |
| Doble permiso en Android, sitios sensibles excluidos por defecto | "Detecta todo tipo de fraude" |
| Inferencia remota con allowlist + cap de presupuesto | "IA que nunca falla" / cualquier claim infalible |
| Revocar detiene la observación (fail-closed, probado) | Retención/cifrado no demostrados en video |

Regla de oro del copy: el guion nunca dice «protección infalible», «detectamos
todo», «leemos cualquier app» ni nada sobre emociones del usuario. El escudo
evalúa la pantalla, no a la persona.

Stat externo usado en el hook: la FTC de EE. UU. reportó ~US$10.000 M perdidos
en fraude en 2023 y ~US$12.500 M en 2024. `[VERIFICAR]` cifra y fuente antes de
publicar (ftc.gov — news releases).

---

## VIDEO 1 — Español — Persona a cámara + producto (~100 s)

**Puesta en escena:** plano medio, luz natural o suave, fondo de trabajo real
(escritorio con laptop). Intercalar plano persona / captura de pantalla real.
Ritmo: frases cortas, cortes en respiración. Sin música hasta el cierre; un
pulso grave muy bajo puede entrar en 0:20.

| Tiempo | Plano | Guion (voz) | Texto en pantalla |
|---|---|---|---|
| 0:00–0:08 | Primer plano del celular: llega un mensaje. Corte a tu cara mirándolo. | *(leyendo en off, tono plano)* «Hola mamá, perdí el celular, este es mi número nuevo. Necesito que me transfieras urgente.» *(pausa, a cámara)* ¿A cuánta gente conoces que le llegó ese mensaje? | — |
| 0:08–0:20 | A cámara, plano medio. | Soy [nombre]. Mensajes como ese le cuestan a la gente más de diez mil millones de dólares al año `[VERIFICAR cifra FTC]`. Y no es un virus: el antivirus no lo ve, el banco no lo ve. Es una conversación diseñada para que decidas a las malas. | «$10.000 M / año `[VERIFICAR]`» |
| 0:20–0:45 | Captura real: extensión SOVIR sobre una página phishing sintética; popup con el aviso; consola con `votes[]`. | Por eso construimos SOVIR: un escudo de autonomía digital. No te vigila a ti — observa, con tu permiso, lo que las páginas y las apps te piden. Cuando esta página falsa imita a tu banco y te pide la contraseña, SOVIR no dice "confía en mí". Un consejo de votantes independientes emite hipótesis con evidencia — «el enlace no coincide», «pide credenciales», «identidad no verificada» — y una política determinista toma la decisión. | «Hechos ≠ hipótesis ≠ decisiones» |
| 0:45–1:05 | Captura: toggle de consentimiento, lista de sitios sensibles, revocación. | Todo corre primero en tu dispositivo. Tu texto, tus píxeles, tus datos no salen. Banca y mensajería quedan excluidas por defecto. Cada sensor pide un permiso visible que puedes revocar cuando quieras — y cuando revocas, se detiene de verdad. Lo probamos de punta a punta. | «Primero local. Siempre.» |
| 1:05–1:20 | Vuelta a cámara. | Hoy: extensión y Android verificados end-to-end, consola con incidentes y evidencia real. Lo que falta, lo decimos: el modelo visual aún no está listo, iOS y escritorio están en el roadmap. No vendemos promesas — mostramos pruebas. | — |
| 1:20–1:30 | Cierre: marca + tagline sobre negro. | Porque protegerte no debería ser otra forma de vigilancia. SOVIR. Ver lo que influye. Elegir lo que importa. | «SOVIR — Ver lo que influye. Elegir lo que importa.» |

## VIDEO 2 — English — Person on camera + product (~100 s)

Same staging. Natural English, not a translation.

| Time | Shot | Script (VO) | On-screen text |
|---|---|---|---|
| 0:00–0:08 | Close-up of a phone: a message arrives. Cut to your face reading it. | *(flat tone, reading)* "Hi Mom, I lost my phone, this is my new number. I need you to send money — urgent." *(beat, to camera)* How many people do you know who got that message? | — |
| 0:08–0:20 | To camera, medium shot. | I'm [name]. Messages like that cost people over ten billion dollars a year `[VERIFY FTC figure]`. And it isn't a virus — your antivirus doesn't see it, your bank doesn't see it. It's a conversation engineered to make you decide badly. | "$10B+ / year `[VERIFY]`" |
| 0:20–0:45 | Real capture: SOVIR extension over a synthetic phishing page; popup notice; console with `votes[]`. | That's why we built SOVIR — a digital-autonomy shield. It doesn't watch you. It watches — with your permission — what pages and apps ask of you. When this fake page impersonates your bank and asks for your password, SOVIR doesn't say "trust me." A council of independent voters emits hypotheses with evidence — "the link doesn't match," "it's requesting credentials," "identity unverified" — and a deterministic policy makes the call. | "Facts ≠ hypotheses ≠ decisions" |
| 0:45–1:05 | Capture: consent toggle, sensitive-site list, revocation. | Everything runs on your device first. Your text, your pixels, your data don't leave. Banking and messaging are excluded by default. Every sensor needs a visible grant you can revoke at any time — and when you revoke, it actually stops. We tested it end-to-end. | "Local first. Always." |
| 1:05–1:20 | Back to camera. | Today: extension and Android verified end-to-end, a console with real incidents and real evidence. What's missing, we say out loud: the visual model isn't ready; iOS and desktop are on the roadmap. We don't sell promises — we show receipts. | — |
| 1:20–1:30 | Close: wordmark + tagline on black. | Because protecting you shouldn't be another way of watching you. SOVIR. See the signals. Keep the choice. | "SOVIR — See the signals. Keep the choice." |

---

## VIDEO 3 — Español — Montaje musical (~55 s)

**Sin voz en off** — el texto en pantalla y la música cargan el mensaje.
Ideal para redes (funciona en mute) y como bumper antes/después del pitch.

**Música:** pulso minimalista tenso (~90–100 BPM), un solo motivo que crece;
en 0:40 la tensión se resuelve en una nota cálida. Sugerencias libres de
regalías: YouTube Audio Library (filtrar "cinematic/minimal"), Kevin MacLeod
(incompetech, CC-BY), Epidemic/Artlist si tienes suscripción. Nada con
copyright sin licencia.

| Beat | Tiempo | Imagen/video | Texto en pantalla | Transición |
|---|---|---|---|---|
| 1 | 0:00–0:04 | Negro. El mensaje de estafa se escribe solo, caracter a caracter (grabado del fixture sintético). | — | tecleo → corte seco |
| 2 | 0:04–0:08 | Zoom-out: la persona detrás del celular, pensando. | «No es un virus. Es una conversación.» | match cut |
| 3 | 0:08–0:14 | Captura real: página phishing → popup de la extensión con el aviso. | «SOVIR observa la página. No a ti.» | swipe direccional |
| 4 | 0:14–0:20 | Consola: lista `votes[]` apareciendo una a una (heurístico · texto · visual). | «Un consejo. No un oráculo.» | corte en beat |
| 5 | 0:20–0:26 | Detalle de la tarjeta de incidente: evidencia, procedencia, incertidumbre. | «Cada aviso dice de dónde sale.» | corte en beat |
| 6 | 0:26–0:33 | Android: doble permiso (accesibilidad del SO + permiso SOVIR con caducidad). | «Dos llaves. No una.» | whip pan suave |
| 7 | 0:33–0:40 | Mano tocando «Revocar». El observador se detiene. Silencio visual (1 s de negro). | «Cuando revocas, se detiene.» | fundido a negro |
| 8 | 0:40–0:48 | La música resuelve. Planos cotidianos: café, escritorio, calle (foto-spots del sitio). | «Protección que se nota solo cuando hace falta.» | fundido cruzado |
| 9 | 0:48–0:55 | Marca SOVIR + tagline sobre fondo de marca. | «SOVIR — Ver lo que influye. Elegir lo que importa.» | fundido a negro |

## VIDEO 4 — English — Music montage (~55 s)

Identical beat sheet and music direction. On-screen text in English:

| Beat | On-screen text |
|---|---|
| 2 | "It isn't a virus. It's a conversation." |
| 3 | "SOVIR watches the page. Not you." |
| 4 | "A council. Not an oracle." |
| 5 | "Every notice shows its work." |
| 6 | "Two keys. Not one." |
| 7 | "Revoke, and it stops." |
| 8 | "Protection you only notice when it matters." |
| 9 | "SOVIR — See the signals. Keep the choice." |

---

## VIDEO 5 — Español — «La prueba» (~120 s)

**Concepto:** walkthrough técnico con VO, pantalla real en vivo. Público:
jurados, inversores técnicos, cualquiera que diga «suena bien, muéstramelo».
Tono: directo, sin hype. Una toma continua de pantalla si es posible; cortes
solo para legibilidad.

| Tiempo | Pantalla | Guion (voz) |
|---|---|---|
| 0:00–0:10 | Terminal + navegador lado a lado. | Nadie cree una demo hasta que ve el cableado. Este es el cableado de SOVIR, corriendo en local, sin retoques. |
| 0:10–0:30 | Navegador: página phishing sintética (`fixture`) que imita un login bancario. | Abro una página que imita a un banco. La extensión observa el DOM — porque yo le di permiso — y emite señales tipadas: `LINK_DESTINATION_MISMATCH`, `CREDENTIAL_REQUEST`, `IDENTITY_UNVERIFIED`. No texto crudo: hechos observables. |
| 0:30–0:50 | Consola/terminal: `POST /v1/events` → puerta de consentimiento → `votes[]` de cada votante. | El evento cruza la puerta de privacidad. Sin consentimiento para esta fuente y este dispositivo, se rechaza — lo van a ver en un minuto. Con consentimiento, el consejo vota: heurístico, modelo de texto ONNX, modelo visual ONNX. Cada voto es una hipótesis con evidencia, no una orden. |
| 0:50–1:10 | Consola web: incidente con veredicto `high`, evidencia, procedencia. | La política determinista decide: `high`. Y aquí está lo importante — el veredicto trae su evidencia, su procedencia y su incertidumbre. Hechos, hipótesis y decisión, separados. Eso no lo hace un screenshot pegado en un chatbot. |
| 1:10–1:30 | Android: misma señal → intervención → notificación en vivo. Ajustes: revocar permiso. | En Android es el mismo contrato: el observador de accesibilidad lee metadatos — nunca campos de contraseña ni capturas — y la notificación llega en vivo. Ahora revoco el permiso. |
| 1:30–1:50 | Terminal: siguiente evento rechazado. Logs sin texto de pantalla. | Siguiente evento: rechazado. La recolección y el envío se detienen. Fail-closed, no "fail-trust-us". Y fíjense en los logs: señales tipadas, sin el texto de la pantalla. |
| 1:50–2:00 | Marca + tagline. | Esto no es un mockup: es Postgres, una API en Rust y una puerta de consentimiento que de verdad falla cerrada. SOVIR. Ver lo que influye. Elegir lo que importa. |

## VIDEO 6 — English — «The wiring» (~120 s)

Same beats, natural English VO.

| Time | Screen | Script (VO) |
|---|---|---|
| 0:00–0:10 | Terminal + browser side by side. | Nobody believes a demo until you show them the wiring. This is SOVIR's wiring, running locally, no edits. |
| 0:10–0:30 | Browser: synthetic phishing fixture mimicking a bank login. | I open a page impersonating a bank. The extension observes the DOM — because I granted it — and emits typed signals: `LINK_DESTINATION_MISMATCH`, `CREDENTIAL_REQUEST`, `IDENTITY_UNVERIFIED`. Not raw text: observable facts. |
| 0:30–0:50 | Console/terminal: `POST /v1/events` → consent gate → per-voter `votes[]`. | The event crosses the privacy gate. Without a grant for this source and device, it's rejected — you'll see that in a minute. With consent, the council votes: heuristic, text ONNX, visual ONNX. Every vote is a hypothesis with evidence, not an order. |
| 0:50–1:10 | Web console: incident with `high` verdict, evidence, provenance. | The deterministic policy decides: `high`. And here's what matters — the verdict carries its evidence, its provenance and its uncertainty. Facts, hypotheses and decisions, kept separate. That's not a screenshot pasted into a chatbot. |
| 1:10–1:30 | Android: same signal → intervention → live notification. Settings: revoke grant. | On Android it's the same contract: the accessibility observer reads metadata — never password fields, never screenshots — and the notification arrives live. Now I revoke the grant. |
| 1:30–1:50 | Terminal: next event rejected. Logs without screen text. | Next event: rejected. Collection and transmission stop. Fail-closed, not "fail-trust-us". And look at the logs: typed signals, no screen text. |
| 1:50–2:00 | Wordmark + tagline. | This isn't a mockup — it's Postgres, a Rust API, and a consent gate that actually fails closed. SOVIR. See the signals. Keep the choice. |

---

## Notas de producción

- **Fijación de hechos:** todo fixture/página phishing debe ser sintético (regla
  del repo: sin PII ni datos reales en capturas). Usar los fixtures de prueba
  existentes; no grabar conversaciones ni cuentas reales.
- **Subtítulos:** grabar master 16:9; exportar también 9:16 para shorts/reels.
  Quemar subtítulos en el idioma del video (el texto en pantalla de 3–4 ya actúa
  como subtítulo). No mezclar idiomas dentro de un video.
- **Capturas reales:** usar la extensión, la consola y Android corriendo contra
  el stack local — son las capturas "Verified E2E" del README. Etiquetar en
  el video lo que sea maqueta si se usa (regla del sitio: screenshots reales
  etiquetadas por estado).
- **Música:** solo pistas con licencia verificable (Audio Library, CC-BY con
  atribución en descripción, o suscripción vigente). Sin audio trending de
  redes si el video sube a YouTube/competencia.
- **Cifras externas:** marcar con `[VERIFICAR]` y confirmar fuente primaria
  (FTC) el día de la publicación; si no se confirma, cambiar la línea a
  «billions of dollars a year» sin cifra.
- **Descargo sugerido en descripción del video:** "SOVIR is a working local
  scaffold — features shown are verified end-to-end unless labeled. Not a
  shipped product." Mantiene la honestidad del README sin quitarle fuerza al
  pitch.
