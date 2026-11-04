# Model card — `onnx-text` (`sovir-text-v3`, entrenado propio)

**Tipo:** clasificador ONNX multi-label (sigmoide, 27 señales — incluye
las 6 de bienestar ADR-0027). Encoder
`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (118M) +
cabeza lineal entrenada sobre el corpus sintético SOVIR. Votante
`onnx-text` del concilio (ADR-0025). Adapter `OnnxTextVoter` —
`feature="onnx"` + `SOVIR_ONNX_TEXT_DIR=ml/artifacts/text-v3`.

**Entrenamiento:** `infra/modal/text_train_app.py` en Modal T4
(offline batch, ADR-0017). Corpus `ml/datasets/text-corpus/`
(548 train / 98 val / 203 benign — todo sintético, cero contenido de
usuario, invariante 2). Umbrales por señal calibrados sobre el split
benigno (`thresholds.json`).

## Qué hace

Puntúa `request.text_hint` (texto crudo observado, LOCAL, efímero) y
emite las señales cuya probabilidad supera su umbral calibrado →
hipótesis tipadas en el concilio. Sin `text_hint` se abstiene.

**Capacidad que el extractor no tiene:** clasifica por semántica, no por
vocabulario — detecta variantes de frase y clases de señal ausentes de
las regex (verificado: "paquete retenido en aduana" →
DELIVERY_CUSTOMS_FEE+PAYMENT_REQUEST; "videos grabados, paga bitcoin" →
EXTORTION_LANGUAGE; "ganador del sorteo, reclama tu premio" →
PRIZE_LOTTERY_CLAIM — los tres con heurístico en `no_pattern`).

## Eval

### v3 (2026-11-04, corpus deduplicado + ADR-0027: 1405 train / 568 val / 225 benign, 27 señales)

- micro precision **0.998** / micro recall **0.932** / benign FP **9.3%**
  en eval — el set benigno quedó en 225 textos únicos tras dedup e
  incluye negativos duros al límite (noticias políticas, ofertas reales,
  apoyo emocional); el texto benigno real verificado en vivo no dispara
- Las 6 señales ADR-0027 aprenden: POLARIZATION_BAIT F1 0.88,
  RAGE_BAIT_CONTENT 0.778, EMOTIONAL_COERCION 0.917, IMPULSE_FUNNEL
  0.842, DOOM_REINFORCEMENT 1.0, INSECURITY_EXPLOITATION 1.0
- `URGENT_ACTION` F1 0.921 sostiene la recuperación de v2;
  `PAYMENT_REQUEST` thr 0.92 sigue conservador (F1 0.722)
- Verificado en vivo (solo `text_hint`, modo Private): rage-bait →
  RAGE_BAIT_CONTENT, "con esa cara…" → INSECURITY_EXPLOITATION,
  "últimas unidades un clic" → IMPULSE_FUNNEL, "si te importara tu
  familia" → EMOTIONAL_COERCION, sextorsión → EXTORTION_LANGUAGE;
  noticia del senado y factura "vence hoy" benignas →
  `no_pattern_detected`
- Nota honesta: la dedup expuso que el corpus v2 tenía ~55% de textos
  duplicados — sus métricas comparan sobre un set inflado

### v4 — rechazado (no se promovió, 2026-11-04)

- 1481 train / 568 val / 379 benign (+76 positivos pago-scam, +154
  benignos únicos). Resultado: micro-P 1.0 / micro-R 0.887 (peor),
  benign FP 9.5% (igual), PAYMENT_REQUEST F1 0.54 (peor), URGENT 0.719
  (peor). Más volumen no arregla la confusión estructural: pago
  legítimo vs pago-scam comparten superficie léxica casi idéntica
  ("paga la renta por transferencia" vs "transfiere $500 a esta
  CLABE"). La calibración prefiere silencio — conservadurismo aceptable
  para señales compañeras, pero `PAYMENT_REQUEST` necesita features
  distintas (contexto del pago, no el verbo pagar) o corpus de pares
  mínimos. v3 sigue siendo el artifact en producción.

### v2 (2026-11-04, corpus expandido: 2438 train / 476 val / 823 benign)

- micro precision **1.0** / micro recall **0.928** / benign FP **1.94%**
- `URGENT_ACTION` F1 0.909 (los benignos difíciles de urgencia legítima
  lo rescataron del F1=0.0 de v1)
- `PAYMENT_REQUEST` thr 0.94 — conservador tras benignos de pago
  legítimo; sigue disparando en texto de estafa agudo (aduana verificado)
  pero calla en facturas reales; cobertura recae en señales compañeras
- Verificado en vivo: sextorsión → EXTORTION_LANGUAGE 8052bp; "hola mamá
  cambié de número" → AUTHORITY_IMPERSONATION; factura Telcel benigna →
  no_pattern_detected

### v1 (2026-11-04, corpus semilla: 548 train / 98 val / 203 benign)

- micro precision 0.968 / micro recall 0.86 / benign FP 5.4%
- `PAYMENT_REQUEST` F1=0.727, `URGENT_ACTION` F1=0.0 (desactivado por
  calibración).

## Privacidad (invariante crítico)

El texto **jamás egresa**: el voter corre in-process vía `ort`; el sobre
remoto nunca lleva `text_hint` (`remote_envelope_never_carries_text_hint`).
En `Private` el remoto ni se invoca; en `Standard` el remoto ve solo
señales tipadas.

## Recursos

- 470MB fp32 en disco + RAM del proceso (~500MB al cargar).
- Runtime `ort` + `tokenizers` tras `feature = "onnx"`.

## Limitaciones

- Corpus pequeño y sintético — generalización real pendiente de corpus
  vivo; las señales agudas (extorsión, seed phrase, premio, scareware)
  son fiables, las amplias (urgencia, pago) conservadoras.
- Un voto estadístico: el concilio registra `Disputed`, la política
  arbitra; nunca decide sola.
- Modelo versionado por archivo — un cambio de artifact exige re-eval.

## Histórico

Reemplaza al baseline `horizon-phishing-scam-detector-base`
(mmBERT 3-clases zero-shot, sin entrenar en dominio SOVIR), que queda en
`ml/artifacts/onnx-text/` como referencia, fuera del path del concilio.
