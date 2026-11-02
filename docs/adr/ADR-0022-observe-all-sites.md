# ADR-0022 — Modo "observar todos los sitios" opt-in con blocklist

- Status: Accepted — maintainer signoff 2026-11-02 (autorización verbal del maintainer en sesión de trabajo)
- Date: 2026-11-02
- Owners: extensión (Cursor/UX) + consentimiento (revisión maintainer)
- Related: invariante 1 (consentimiento específico y revocable), ADR-0014

## Context

El modelo actual exige consentimiento por origen: el popup pide
`chrome.permissions` para cada sitio antes de inyectar el extractor.
Funciona y es la forma más pura de consent-first, pero el maintainer
quiere un modo donde, **si la persona acepta explícitamente**, el sistema
observe todo salvo excepciones configurables — la forma de permiso de
la mayoría de extensiones de seguridad.

El riesgo si se hace mal: un grant amplio por defecto convierte el
consentimiento en opt-out, la misma forma del tracker contra el que
SOVIR se defiende. Chrome Web Store además trata `<all_urls>` como
permiso de alto escrutinio.

## Decision

**Toggle opt-in en opciones, nunca por defecto:**

1. `optional_host_permissions` ya declara `http://*/*` + `https://*/*` —
   nada cambia en el manifest.
2. El toggle "Observar todos los sitios que abra" en opciones ejecuta
   `chrome.permissions.request({origins:["<all_urls>"]})` **en el gesto
   del usuario**: el prompt de Chrome ES el momento de consentimiento —
   explícito, nativo, revocable.
3. `registerContentScripts` auto-inyecta extractor+content en todo origen
   concedido; la **blocklist** del usuario alimenta `excludeMatches` —
   las excepciones nunca se observan ni siquiera localmente.
4. Apagar el toggle revoca el permiso (`chrome.permissions.remove`) —
   la revocación es un clic, igual que por sitio.
5. El grant de consentimiento del lado del API (`ext-observer-grant`)
   se aplana: un grant cubre todas las emisiones. El aislamiento por
   principal y la revocación por origen individual siguen intactos.

## Invariantes preservados

- Consentimiento sigue siendo **explícito** (prompt nativo de Chrome)
  y **revocable** (toggle off o permiso en chrome://settings).
- Benigno sigue en silencio: observar ≠ emitir; el extractor solo
  envía cuando hay señales.
- Nada de contenido/píxeles egresa — señales tipadas únicamente.
- El default sigue siendo consentimiento por sitio; este modo existe
  solo si la persona lo enciende.

## Trade-offs aceptados

- Privacidad proporcional: con grant amplio el extractor corre en cada
  página — trabajo local extra (CPU de extracción) y mayor superficie
  donde un bug del extractor tocaría. Mitigado por blocklist + pausa
  global + revocación nativa.
- Chrome Web Store pedirá justificación del permiso amplio si se
  publica — documentar este ADR en el listing.
- Un grant aplanado diluye la granularidad del audit ("qué origen
  autorizaste") — el audit seguirá registrando la fuente por evento.

## Alternativas descartadas

- **Grant amplio al instalar**: rechazado — convierte consentimiento en
  opt-out, rompe el invariante.
- **Whitelist fina manual** (añadir orígenes a mano sin prompt por sitio):
  más segura pero peor UX; puede añadirse después sin conflicto.
- **Observar todo sin excepciones**: rechazado — la blocklist es
  exigencia del maintainer y del invariante de control del usuario.
