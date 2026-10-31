# ADR-0010 — Política de egress HTTP saliente

- Estado: propuesto (pendiente aprobación maintainer)
- Contexto: B20 dejó `HttpEgress` con un adaptador de grabación solamente;
  ninguna llamada de red real existía. El threat model (B17-R3/R5) exige
  que cualquier egress real tenga política explícita: allowlist, sin
  redirects, timeouts, sin datos de usuario en payloads.

## Decisión

1. El `HttpEgress` por defecto sigue siendo `RecordingHttpEgress`
   (grabación en memoria, sin red). El egress real SOLO se construye
   cuando `SOVIR_HTTP_EGRESS=real` está explícitamente presente.
2. `ReqwestHttpEgress` reaplica `validate_url_for_egress` en cada envío
   (defensa en profundidad: el allowlist también se verificó al registrar
   el endpoint). Redirects deshabilitados (un 3xx podría saltarse el
   allowlist), timeout fijo de 5s, sin cookies ni auth.
3. El payload del webhook es metadata de intervención tipada
   (`intervention_id`, `event_id`, `kind`, `principal_id`, `device_id`,
   `created_at_ms`) — nunca contenido de eventos, digests de capturas ni
   PII. Firmado HMAC-SHA256 como ya hacía `WebhookChannel`.
4. `SOVIR_ENV=ci` o ausencia de allowlist (`SOVIR_WEBHOOK_ALLOWLIST`
   vacía) fuerzan el modo grabación incluso si `SOVIR_HTTP_EGRESS=real`:
   el flag solo tiene efecto con allowlist explícita y entorno local/test.
5. El `secret` del endpoint sigue siendo dev-grade; producción requiere
   KMS/rotación antes de que egress real se habilite fuera de loopback.

## Consecuencias

- Ninguna conexión saliente ocurre por defecto ni en CI.
- El único emisor real posible son los webhooks registrados, y solo hacia
  hosts del allowlist explícito.
- B17-R3 (egress no autorizado) y R5 (SSRF) quedan mitigados a nivel de
  política + adaptador; la verificación de SSRF por DNS rebinding queda
  fuera de alcance en dev (requiere resolver el host, no matchear strings).
