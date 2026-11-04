# SOVIR — Corpus de observación real (datapoints verificados)

Datos recogidos del stack vivo contra superficies reales — no sintéticos.
Cada entrada documenta lo que el extractor emitió realmente. Este corpus es
la materia prima para recalibrar/reentrenar mañana.

## Registro

| Fecha | Superficie | Esperado | Emitido | Veredicto | Lectura |
|---|---|---|---|---|---|
| 2026-07-25 | `microsoft.com` (real, benigna) | silent/observe | `CREDENTIAL_REQUEST`, `URGENT_ACTION`, `IDENTITY_UNVERIFIED` | `credential_phishing` → **warn/high** | **FALSO POSITIVO REAL**: un enlace de sign-in se lee como CREDENTIAL_REQUEST, un banner promo como URGENT_ACTION. El extractor es over-eager en páginas con login+promoción — el problema no es el council (las señales existen de verdad), es la extracción que no distingue contexto. |
| 2026-07-25 | `scam-test.html` (fixture) | warn | señales de phishing | warn | Sintético controlado — el path funciona. |
| 2026-07-25 | evento ext + eventos teléfono (vivo) | correlación | urgencia→pago cross-source | `HookThenPayment` finding | Correlación temporal funciona en datos reales. |

## Qué enseña el primer datapoint

1. `CREDENTIAL_REQUEST` debe distinguir *pedir credencial en contexto
   engañoso* de *una página con login normal* — hoy no lo hace.
2. `URGENT_ACTION` sobre banners/promo legítimos es el mayor generador de FP
   junto a login. Candidato a exigir corroboración (otra señal de
   engaño: dominio, mismatch, identity) — como ya hace `link_spoofing`.
3. El votante visual ONNX no disparó nada (coherente con NOT READY).

## Verificación del votante remoto (Baseten, 2026-07-25)

Instancia aparte en `:8788` (`SOVIR_HTTP_EGRESS=real`, allowlist
`inference.baseten.co`, `SOVIR_COUNCIL_SETTLE_BP=10001` para forzar el voto
remoto). Señales sintéticas — nunca contenido de usuario.

| Caso | Resultado |
|---|---|
| `CREDENTIAL_REQUEST+URGENT_ACTION+IDENTITY_UNVERIFIED` | remote `meta-models/muse-spark-open-1026`: `credential_request_unverified, identity_unverified, urgency_pressure` @6200bp (el remoto es **más conservador** que el heurístico — no afirmó `credential_phishing`). Council: `agree; voters:2`. 348 tok in / 1192 out. ~4.5s. |
| `TRACKING_OBSERVED` | heuristic 5500bp / remote 6500bp → `privacy_tracking_exposure`. Replay idéntico servido como `cache:` — provider **no re-facturado**. |
| timeout forzado (8s default) | remote abstuvo con `abstain:voter_timeout` auditable; council zanjó local. Fail-closed verificado. |

**Bug encontrado y arreglado por esta verificación**: `max_tokens: 1024`
dejaba a los modelos de razonamiento (muse-spark quemó 1021 tokens de
reasoning) con `content: null` → el caller veía `internal_error`. Subido a
4096 con comentario del motivo.

**Hallazgo pendiente**: `usage.cost_micro_usd` llega `null` — no hay
precio por token configurado para Baseten; metering honesto pero sin
costo real registrado. Configurar `SOVIR_INFERENCE_PRICE_*` o equivalente
antes de dejar el path remoto encendido.

Gasto total de la verificación: ~3 llamadas reales, ~5k tokens —
centavos, muy por debajo del techo autorizado.

## Pendiente de recolección

- **Android** (teléfono desconectado esta noche): apps reales — banca,
  redes, tiendas — mismas métricas. Requiere reconectar el dispositivo.
- **Web benigno amplio**: bancos reales (BBVA, Santander login),
  checkout real (Amazon, MercadoLibre), redes (X, Facebook) — la lista de
  exclusiones sensibles ya los protege; medir qué emitirían si se
  incluyeran.
- **Web phishing real**: corpus Phishpedia URLs vivas (con cuidado — solo
  lectura de señales, nunca credenciales ni envío de contenido).
