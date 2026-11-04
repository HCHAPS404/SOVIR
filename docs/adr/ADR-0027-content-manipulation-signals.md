# ADR-0027 — Señales de manipulación de contenido (content-side, nunca user-side)

## Estado

Aprobado por el maintainer (instrucción "adelante con todo", 2026-11-04) e
implementado: 6 señales en `RiskSignal`, extractores ES+EN en Android y
extensión, prioridad última en `risk_signal_priority` y sus espejos,
`MAX_EVENT_SIGNALS` aplicado en Android, ONNX text-v3 con 27 cabezas
detectando en vivo, nombres humanos ES en Android/consola/popup.

## Contexto

El objetivo del producto es un escudo de autonomía digital: proteger a la
persona de influencias maliciosas o tóxicas dirigidas contra ella — no solo
estafas de dinero. Hoy la taxonomía cubre fraude económico y algunas tácticas
de persuasión (`SCARCITY_PRESSURE`, `CONSENT_DARK_PATTERN`,
`HIDDEN_FEE_PATTERN`, `DATA_HARVESTING`). Faltan tres familias que el
maintainer pidió cubrir:

1. Contenido polarizante diseñado para provocar (rage-bait político/social).
2. Sistemas de compra impulsiva no justificada más allá de escasez simple.
3. Contenido coercitivo que presiona hacia estados negativos o cambios de
   conducta forzados (culpa, miedo, vergüenza, fatalismo).

## Límite de diseño (vinculante)

**Se detectan tácticas EN EL CONTENIDO; nunca el estado del usuario.**

- VÁLIDO: "esta publicación usa framing de rabia/enemigo", "esta tienda
  apila cuenta regresiva + escasez + culpa", "tu feed esta hora fue 60%
  contenido polarizante" (agregado de exposición, lado del contenido).
- PROHIBIDO (invariante 7): inferir o registrar emociones del usuario,
  vulnerabilidad psicológica, susceptibilidad, o perfilar a la persona.
  No existe señal `USER_IS_DEPRESSED` ni `USER_SUSCEPTIBLE`. La unidad de
  análisis es el texto/imagen observado, no la persona que lo mira.
- La protección del bienestar se logra midiendo exposición a tácticas y
  actuando sobre el stream (aviso, pausa sugerida, higiene de feed), no
  diagnosticando al usuario.

## Señales nuevas propuestas (tipadas, mismos invariantes que las 26)

| Señal | Qué detecta | Ejemplo scammy | Contraejemplo benigno difícil |
|---|---|---|---|
| `POLARIZATION_BAIT` | Framing enemigo/nosotros-ellos, indignación fabricada, llamado a compartir la bronca | "Estos políticos te odian y se ríen de ti — comparte si estás harto" | Noticia legítima sobre política, opinión editorial identificada, debate civil |
| `RAGE_BAIT_CONTENT` | Contenido diseñado para maximizar enojo/engagement (clip trucado, cifra falsa escandalosa) | "Mira lo que hace esta gente — indignante, nadie habla de esto" | Reportaje de injusticia documentada con fuentes, activismo con datos |
| `EMOTIONAL_COERCION` | Presión emocional para actuar: culpa, miedo, vergüenza, amenaza social | "Si de verdad te importara tu familia comprarías esto", "Solo una mala madre ignoraría esto" | Campaña de salud pública con evidencia, recordatorio afectuoso sin presión |
| `IMPULSE_FUNNEL` | Secuencia de compra impulsiva manufacturada: urgencia+escasez+autoridad falsa+fricción cero | "¡ÚLTIMA! El método que las tiendas no quieren que sepas — 1 clic y es tuyo" | Oferta real con cuenta regresiva de tienda verificada |
| `DOOM_REINFORCEMENT` | Contenido fatalista seriado diseñado para mantener scroll en contenido negativo | Streams de "todo se cae a pedazos y empeora" sin acción posible | Noticia negativa legítima, contenido de duelo/apoyo |
| `INSECURITY_EXPLOITATION` | Explotar inseguridad corporal/social/económica para vender/enganchar | "Con esa cara nadie te va a tomar en serio — por eso necesitas esto" | Publicidad de producto sin denigrar, fitness con claims verificables |

## Consecuencias de implementación (si se aprueba)

1. `packages/contracts` — añadir las 6 señales al enum (bump menor; son
   aditivas, no rompen compatibilidad).
2. Corpus — cada señal necesita ~120-200 filas sintéticas train/val +
   benignos difíciles dedicados (noticias legítimas polarizadas,
   ofertas reales con cuenta regresiva). Sin esto, FP altísimo seguro.
3. `Humanize` (Android) + consola — nombres humanos nuevos.
4. Política — severidad calibrada: estas señales son de *bienestar/
   exposición*, no de bloqueo. Nivel de intervención menor que
   CREDENTIAL_REQUEST; típicamente aviso suave + agregación temporal.
5. Eval — gate obligatorio con casos adversariales benignos antes de
   activar (una noticia legítima no puede marcarse POLARIZATION_BAIT a
   tasa alta; ese FP daña confianza más que un FP de scam).
6. Detección de `DOOM_REINFORCEMENT` es de *agregado temporal* — vive en
   la capa de tendencias del stream, no en el clasificador por-texto.
   Requiere ventana de exposición, no solo inferencia individual.

## Alternativas consideradas

- Perfil de susceptibilidad del usuario: rechazado (invariante 7).
- Filtrado de feed a nivel app: fuera de alcance — AccessibilityService
  observa, no reescribe contenido de terceros; la intervención es aviso/
  agregado, no censura.
- Usar solo `SCARCITY_PRESSURE`+`EMOTIONAL_COERCION` genéricas: rechazado
  — rage-bait político no es escasez ni coerción directa; taxonomía
  insuficiente produce FP masivo al colapsar categorías.
