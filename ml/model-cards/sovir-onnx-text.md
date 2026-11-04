# Model card — `onnx-text` (`sovir-text-v1`, entrenado propio)

**Tipo:** clasificador ONNX multi-label (sigmoide, 21 señales). Encoder
`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (118M) +
cabeza lineal entrenada sobre el corpus sintético SOVIR. Votante
`onnx-text` del concilio (ADR-0025). Adapter `OnnxTextVoter` —
`feature="onnx"` + `SOVIR_ONNX_TEXT_DIR=ml/artifacts/text-v1`.

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

## Eval (2026-11-04, corpus sintético propio)

- micro precision 0.968 / micro recall 0.86
- benign FP rate 5.4% (objetivo del gate: ≤1% — el corpus benigno
  sintético es pequeño; revisar antes de decisiones de ship)
- F1 por señal: 19/21 señales en 1.0; excepciones honestas:
  `PAYMENT_REQUEST` F1=0.727 (thr 0.8), `URGENT_ACTION` F1=0.0
  (thr 0.9 — la calibración lo desactiva: "urgencia" aparece también en
  correos legítimos, correctamente reconocido como no aprendible con
  este corpus).

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
