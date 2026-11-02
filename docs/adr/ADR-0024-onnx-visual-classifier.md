# ADR-0024 — Clasificador visual ONNX local (image_lure, brand_impersonation)

Estado: propuesto (pendiente signoff del maintainer — elección de modelo y licencia)
Fecha: 2026-11-02

## Contexto

`edge-extract::vision::classify` hoy solo detecta estructura QR determinista.
Los labels aprendidos `image_lure`/`brand_impersonation` están declarados
NOT_IMPLEMENTED: ningún artifact, licencia ni eval existe. El invariante
prohíbe que píxeles salgan del dispositivo — la detección visual aprendida
DEBE ser local. El eval gate ya reporta métricas reales (harness.py eval:
56/56 policy agreement, 62/66 heuristic exact-set) — el modelo nuevo se
medirá contra el mismo estándar, no contra intuición.

## Decisión

Integrar un clasificador ONNX cuantizado de código abierto en
`crates/sovir-edge-extract`, detrás del mismo contrato `classify()`:
píxeles adentro, señales tipadas + digest afuera, nunca texto ni imagen.

Fases:

1. **Selección de artifact** — candidato único, documentado en model-card:
   - Modelo pequeño cuantizado (≤50MB) con licencia explícita compatible
     (Apache-2.0/MIT) y eval publicada contra corpus de phishing visual.
   - Candidatos a evaluar: MobileNetV3/ViT-tiny fine-tuneados en
     phishing-screenshots (PhishIntention, visual-phish datasets públicos),
     o un clasificador QR/landing ya entrenado.
   - La elección concreta la firma el maintainer con la model-card adjunta.
2. **Runtime** — `ort` (ONNX Runtime) como dependencia opcional
   `feature = "onnx-vision"`. Sin el artifact el crate compila idéntico a
   hoy (feature off por defecto, CI no descarga el modelo).
3. **Fusión con política** — el veredicto del modelo es señal tipada con
   confidence_bp, jamás decisión. La política arbitra conflicto
   local-vs-remoto: una señal visual local de alta confianza puede warn
   sin esperar remoto; ambigüedad escala a Meta en Standard.
4. **Eval obligatorio** — corpus visual sintético nuevo
   (`eval-corpus-vision.v1.json`): phishing-screenshot fixtures + benign UI.
   El modelo entra solo si precision ≥ baseline estructural en CI.

## Consecuencias

- Positivo: detección visual real sin egress; Meta se reserva a señales
  ambiguas (ahorro de tokens, no gasto extra).
- Costo: +1 dependencia opcional, +artifact binario fuera de Git
  (descarga por script con hash fijado — no se commitea el modelo).
- Riesgo: modelo v0 con falsos positivos visuales — mitigado por la puerta
  de corroboración (misma regla que QR hoy) y eval obligatorio antes de
  habilitar la feature.

## Verificación

- `cargo test -p sovir-edge-extract` sigue verde con feature off.
- Con feature on + artifact: nuevo eval reporta precision/recall por
  label; ningún píxel sale del proceso (assert de tipo de retorno).
- `harness.py eval` incluye el eval visual cuando la feature esté activa.
