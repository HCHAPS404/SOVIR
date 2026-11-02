# ADR-0021 — Fuentes de threat intel curadas (propuesta)

- Status: Accepted — maintainer signoff 2026-11-02
- Date: 2026-10-29
- Owners: backend (Devin) + arquitectura (ChatGPT)
- Related issue: intel seam; extends ADR-0012

## Context

ADR-0012 fijó el seam `IntelIndicator` + `IntelFeed`: indicadores tipados
(dominio, URL pattern, hash) que corroboran señales en el policy pack.
Hoy solo existe el fixture del repo — ninguna fuente real configurada.

El valor: "este dominio `.tk` ya está en una lista de phishing conocida"
convierte una hipótesis heurística en corroboración fuerte. El riesgo:
feeds maliciosos o contaminados inyectarían falsos positivos o censura;
un feed remoto consultado por evento sería egress de contenido (la URL
navegada del usuario saldría del dispositivo — prohibido).

## Options

1. **Feeds remotos por consulta (lookup API)** — rechazada: cada consulta
   fuga la URL/dominio que el usuario visita hacia el proveedor del feed.
2. **No usar feeds** — el seam queda como demo. Pierde la corroboración
   más barata y potente disponible.
3. **Feeds curados, import periódico, matching local** (elegida) — el
   feed se descarga/actualiza como dataset firmado (pull programado o
   empaquetado en release); el matching contra URLs observadas ocurre
   100% local, como hoy contra el fixture.

## Decision

1. **Pull, nunca lookup.** Los indicadores viajan feed → dispositivo en
   lote; ningún dominio observado sale del dispositivo para consultarse.
   Egress único: la descarga del dataset, que no contiene datos de usuario.
2. **Fuentes con allowlist + integridad.** Cada feed declara: URL,
   formato, clave de firma/hash esperado, cadencia máxima. Un dataset
   que falla verificación de integridad se descarta entero (fail-closed).
3. **Curación = code review.** El fixture inicial y cada fuente nueva
   entran por PR: origen público documentado, licencia, formato de
   indicador validado contra el contrato `IntelIndicator`.
4. **Retención y caducidad.** Los indicadores llevan `expires_at_ms`
   (el contrato ya lo soporta): un dominio denunciado hace 2 años y ya
   limpio no debe seguir marcando. Importador purga expirados.
5. **Sin peso autoritario.** Un match de feed es una señal corroborante
   más dentro del `PolicyPack` — eleva Review→Warn según reglas, jamás
   bloquea ni borra por sí solo (invariante 4: reglas autorizan, datos no).
6. **Dataset = infra, no secreto.** Los feeds viven bajo `infra/` o un
   bucket con credenciales en secrets manager — nunca keys en el repo.

## Privacy matrix (invariante 8)

| Elemento | Tratamiento |
|---|---|
| URLs/dominios observados | Jamás salen del dispositivo — matching local |
| Dataset del feed | Público/curado, sin datos de usuario; hash verificado |
| Credenciales de feed | Secrets manager; prohibidas en Git |
| Retención | `expires_at_ms` por indicador + purga en import |
| Egress | Solo descarga del dataset (sin payload de usuario) |
| Fixtures | Ya existen — sintéticos, sin dominios reales de víctimas |

## Cost gate

Feeds públicos (PhishTank-style, listas comunitarias): coste cero. Un
feed comercial exigiría presupuesto + aprobación como cualquier gasto.

## Consequences

- El seam `IntelFeed` pasa de fixture a dataset real verificable.
- Trabajo pendiente por ticket: importador, verificación de firma/hash,
  scheduler de actualización, primera fuente curada.
- **No implementado hasta firma del maintainer.**

## Non-goals

- No per-event remote lookup of observed URLs/domains (egress ban).
- No autonomous blocking/deletion on feed match — corroboration only.
- No unvetted third-party feeds; each source is a reviewed PR.

## Acceptance criteria

- Importer validates dataset integrity (signature/hash) before merging;
  a failed verification discards the whole dataset.
- Every indicator carries `expires_at_ms`; importer purges expired rows.
- A feed outage leaves the last verified dataset in place — matching
  degrades to heuristics, never to zero protection.

## Test obligations

- Tampered dataset fixture fails verification and imports nothing.
- Expired indicators never corroborate.
- A feed match alone produces at most Review, per the dev pack.

## Reversion

- Removing the feed source + purging its indicators rolls back; the
  heuristic layer is unchanged.
