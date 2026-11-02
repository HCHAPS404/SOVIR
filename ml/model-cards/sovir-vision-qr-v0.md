# Model card — `sovir-vision-qr-v0`

**Tipo:** detector determinista de patrones (NO es un modelo ML — no hay
artifact, no aprende, no generaliza). Implementación gemela:
`crates/sovir-edge-extract/src/vision.rs` (Rust) y
`apps/extension/vision.js` (JS puro), mantenidas sincronizadas.

**Superficies servidas:** `services/observer` (Windows Graphics Capture,
`feature="wgc"`) y extensión (`captureVisibleTab`, opt-in por usuario).
Ambas tras consentimiento explícito y con su propio grant.

## Qué hace

Detecta la firma del *finder pattern* QR: rachas oscuro-claro-oscuro-
claro-oscuro con razón de módulo 1:1:3:1:1 en ambos ejes. Barra de
precisión en dos pasos:

1. ≥2 centros candidatos por eje (un código real lleva tres finders).
2. **Confirmación de esquinas**: un cruce centro-de-fila × centro-de-
   columna debe caer sobre un píxel del núcleo oscuro 3×3. Hits
   desacoplados (chrome de UI, franjas, bordes de tabla) fallan aquí —
   es lo que rechaza el falso positivo de IDE/editor observado en la
   primera corrida real.

Salida: `QR_PRESENT` + confianza + digest sha256 del frame analizado.
Los píxeles nunca salen del proceso; el evento es `IMAGE_REGION`.

## Límites de procesamiento

- Downsample a ≤1024px de lado mayor (extensión); frames acotados en
  `PixelFrame` con tamaño validado (Rust).
- ≤64 regiones/frame, ≤512 líneas de escaneo por eje, confirmación
  acotada a 3 esquinas — costo constante, sin I/O, sin retención.
- Umbral de binarización adaptativo (punto medio del rango de luma
  muestreado); región sin contraste usable → omitida, no adivinada.
- Entrada malformada → `None` (fail-closed).

## Métricas

Sin corpus de precisión real — **NO se afirma precisión contra capturas
reales**. Lo verificado:

| Qué | Resultado | Dónde |
|---|---|---|
| Escena QR sintética (3 finders) | emite `QR_PRESENT` | tests Rust/JS |
| Finder único | silencio (barra de corroboración) | tests |
| Franjas 1:1:1:1:1, gradiente foto | silencio | tests |
| Hits desacoplados por eje | silencio (corner-check) | tests |
| Frame 2048px | bounded a ≤1024, aún detecta | test JS |
| Captura WGC real (1920×1040) | pipeline OK, digest-only | corrida local |

## Limitaciones declaradas

- **Learned labels `image_lure`, `brand_impersonation`, deepfakes:
  NOT_IMPLEMENTED.** Sin artifact de modelo; este módulo no adivina.
- `QR_PRESENT` es evidencia débil por diseño: la política exige
  corroboración (`CREDENTIAL_REQUEST`/`PAYMENT_REQUEST`/
  `OFF_PLATFORM_MOVE`) antes de cualquier `warn`.
- Falsos positivos aún posibles en UI con rejillas regulares densas;
  falsos negativos en QR parcialmente ocluidos o de muy bajo contraste.
- La precisión en pantalla real es desconocida hasta que exista un
  corpus etiquetado — declarado, no oculto.

## Reemplazo previsto

Modelo local cuantizado (ADR-0020) tras la misma frontera
`classify(frame, regions) → Extraction` sin tocar dominio ni contratos.
Selección de artifact, licencia y eval — ticket separado.
