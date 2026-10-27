> **Auditoría de arranque (27 oct 2026):** este repositorio contiene un scaffold integral, NO una app multiplataforma lista. Antes de tratar como válido el backend, ejecutar `make backend-check` con Rust instalado. Hallazgos y proceso: [`docs/audits/AUDITORIA_PRECOMMIT_2026-10-27.md`](docs/audits/AUDITORIA_PRECOMMIT_2026-10-27.md).

# SOVIR — Digital Autonomy Intelligence

> **Nombre de trabajo, pendiente de comprobación de marca.**  
> **Estado:** especificación maestra de producto y arquitectura; no representa funcionalidades ya implementadas.  
> **Versión del documento:** 0.1.0 · **Fecha base:** 27 de octubre de 2026  
> **Modalidades objetivo:** Personal · Plus · Enterprise / B2B2C  
> **Ámbito:** Android · iOS · Windows · macOS · Linux · navegadores  
> **Principio rector:** *See clearly. Decide freely.*

[Visión](#1-visión-y-tesis-del-producto) · [Arquitectura](#6-arquitectura-general) · [Stack](#9-stack-tecnológico) · [Repositorio](#11-monorepo-y-empaquetado) · [Git](#13-estrategia-de-ramas-y-prs) · [Agentes](#16-orquestación-de-cursor-claude-devin-y-chatgpt) · [Sponsors](#21-sponsors-y-créditos-del-hackathon) · [Plan](#23-hitos-y-orden-de-implementación) · [Fuentes](#27-fuentes-y-referencias)

---

## 0. Contrato del documento: hechos, decisiones y pendientes

SOVIR nace como un **sistema integral de protección de la autonomía digital**. No es un antivirus convencional, un chatbot al que se envían casos uno a uno, ni una herramienta para vigilar o influir clandestinamente en personas. Su propósito es reconocer, explicar y ayudar a contrarrestar mecanismos potencialmente perjudiciales de ingeniería social, fraude, coacción, explotación comercial, rastreo y diseño manipulativo, mediante **sensores autorizados, evidencia contextual e intervenciones gobernadas por el usuario**.

Las afirmaciones de este README pertenecen a uno de cuatro estados:

- **DECISIÓN:** elección propuesta para implementar como estándar del repositorio; modificable mediante ADR.
- **OBJETIVO:** resultado o capacidad deseada; **no** equivale a rendimiento demostrado.
- **HIPÓTESIS:** proposición comercial, de calidad o técnica que necesita medición.
- **RESTRICCIÓN VERIFICADA:** limitación de API o condiciones reportadas por documentación de proveedores, sujetas a versiones y políticas futuras.

**Regla de veracidad:** ningún colaborador humano o agente debe declarar una función como «implementada», «compatible», «detectada» o «probada» sin código, evidencia y pruebas reproducibles. En particular, «multiplataforma» significa arquitectura preparada para diversas plataformas, no permisos universales de lectura de todas las apps.

### 0.1 ADRs fundamentales

| ADR | Decisión | Estado |
|---|---|---|
| ADR-0001 | Monorepo + modular monolith + puertos/adaptadores | Propuesto |
| ADR-0002 | Rust local-first y adapters nativos | Propuesto |
| ADR-0003 | Captura consentida y procesamiento selectivo | Invariante |
| ADR-0004 | Inferencia en cascada y presupuesto por evento | Propuesto |
| ADR-0005 | Nunca perfilar vulnerabilidades psicológicas para terceros | Invariante |
| ADR-0006 | SOVIR como nombre de trabajo | Pendiente de validación legal |
| ADR-0007 | Compatibilidad y métricas declaradas solo con pruebas | Invariante |
| ADR-0008 | Control de gasto y políticas ejecutadas fuera del LLM | Invariante |

---

## 1. Visión y tesis del producto

### 1.1 Problema

Las personas toman decisiones digitales en entornos diseñados por terceros. Algunas interacciones son legítimas, otras perjudiciales o fraudulentas. La presión puede surgir de anuncios, conversaciones, SMS, correos, webs, permisos de aplicaciones, interfaces de compra, algoritmos de recomendación, llamadas o campañas coordinadas. Las soluciones existentes suelen ser **fragmentadas** por canal o categoría; muchas obligan a aportar un mensaje o una captura manualmente. El usuario carece de una **visión contextual, portable y verificable** de lo que se le solicita y de los riesgos asociados.

La ingeniería social en SOVIR se entiende como un conjunto de **mecanismos observables de influencia y explotación de la confianza**, no como sinónimo de que toda persuasión sea ilegal ni de que cualquier emoción expresada sea evidencia de manipulación. No se presume intención maliciosa sin corroboración.

### 1.2 Misión

> Proteger el derecho de cada persona a comprender y gobernar las influencias que encuentra en su vida digital mediante inteligencia local-first, investigación verificable, predicción prudente y controles explícitos.

### 1.3 Propuesta de valor

1. **Sin fricción:** sensores autorizados en apps y dispositivos; la mayoría de interacciones no requiere copiar y pegar.
2. **Entre superficies:** grafo temporal de evidencia enlaza eventos compatibles sin inventar identidades o correlaciones.
3. **Explicable:** cada intervención presenta motivo, evidencia, procedencia e incertidumbre.
4. **Accionable:** advertir, verificar, revelar condiciones, aplicar reglas y bloquear **solo** en contextos técnica y legalmente permitidos.
5. **Sostenible:** observación incremental; el razonamiento avanzado no es necesario para cada evento.
6. **Autonomía:** la protección es del usuario, no del anunciante, empleador o intermediario.

### 1.4 Posicionamiento

**Categoría propuesta:** *Digital Autonomy Intelligence / Human Autonomy Defense Layer.*  
**Lema de trabajo:** *See clearly. Decide freely.*  
**Diferencial a probar:** correlacionar mecanismos de influencia y señales de daño **a lo largo del tiempo y de distintas fuentes**, conservando controles, explicaciones y eficiencia económica.

### 1.5 Qué NO es SOVIR

- No es vigilancia oculta ni una herramienta para controlar masas, influir políticamente, clasificar «debilidades» psicológicas o vender perfiles de comportamiento.
- No intercepta contenido de otras apps sin consentimiento ni evade `FLAG_SECURE`, cifrado, aislamiento de procesos, sandbox, controles del sistema operativo o DRM.
- No declara que una persona tiene depresión/ansiedad por su contenido visual ni diagnostica trastornos.
- No atribuye intencionalidad a algoritmos de terceros sin evidencia externa.
- No es garantía absoluta contra fraude ni reemplaza asesoría jurídica, clínica o financiera.
- No permite que las instrucciones encontradas en la pantalla gobiernen la política interna del agente.

---

## 2. Usuarios, problemas y negocio

### 2.1 Personas usuarias

| Segmento | Trabajo por hacer (*JTBD*) | Valor observable |
|---|---|---|
| Persona/familia | «Quiero entender una solicitud sospechosa antes de perder dinero o datos». | Advertencia comprensible, verificación independiente, control de exposición. |
| Comprador digital | «Quiero identificar presión comercial, cargos escondidos y seguimiento». | Condiciones visibles, pausar compra, revisar rastreadores. |
| Usuario de redes | «Quiero regular estímulos y hábitos que yo mismo considero perjudiciales». | Preferencias voluntarias, reducción de notificaciones, reportes no clínicos. |
| Pyme | «Quiero reducir fraudes, suplantaciones y cambios de pago indebidos». | Alertas de alto riesgo y flujos aprobados. |
| Banco / fintech / telco | «Quiero proteger clientes antes de que una amenaza fuera de mi app produzca pérdidas». | SDK/API, protección integrada y métricas agregadas. |
| Investigador autorizado | «Quiero comprender patrones de campaña con evidencias, no datos privados indiscriminados». | Indicadores minimizados y trazabilidad. |

### 2.2 Casos representativos

**A. Falso crédito rápido / gota a gota digital:** anuncio de aparente crédito instantáneo → página o app → cláusulas, permisos, contactos solicitados → decisión. El sistema compara afirmaciones públicas, dominio, términos y permisos observables; **no acusa sin corroborar**.

**B. Suplantación progresiva:** mensaje inicial inocuo → traslado de plataforma → cambio repentino de identidad o demanda de OTP/dinero → verificación externa.

**C. Comercio manipulativo:** temporizador de urgencia, descuento supuestamente exclusivo, cargos tardíos, confirmación confusa → evaluación de patrón de diseño y explicación de condiciones.

**D. Privacidad:** banner de cookies, terceras partes, permisos excesivos → detección mediante browser sensor / sistema, no solamente OCR.

**E. Bienestar y atención:** scroll infinito, reproducción automática, notificaciones compulsivas, exposición a categorías elegidas por el usuario → pausas y límites voluntarios; sin inferir estados clínicos.

**F. B2B/B2B2C:** app financiera consulta al SDK de SOVIR al confirmar una acción sensible; recibe evidencia estructurada, recomendaciones e incertidumbre. La acción final se rige por sus propias políticas, derechos del usuario y controles auditados.

### 2.3 Tesis de monetización (**HIPÓTESIS; no pricing validado**)

- **Personal:** protección local básica gratuita, controles de autonomía, alertas esenciales.
- **Plus:** investigaciones avanzadas, memoria cifrada multidevice opcional, mayores cupos y análisis especializado.
- **Enterprise/API:** por dispositivo protegido y/o volumen de eventos relevantes, con mínimos contractuales y límites duros de gasto.
- **B2B2C:** licenciamiento para bancos, aseguradoras, operadores y proveedores de seguridad, con compromisos de privacidad.
- **Prohibido:** vender conversaciones, historiales de pantalla o perfiles psicológicos, o financiar el servicio con publicidad conductual basada en datos protegidos.

**Unidad económica:** ingresos netos por cliente − inferencia remota − nube − soporte − distribución − observabilidad − cumplimiento. **No confundir pérdida mundial por fraude con TAM/SAM/SOM.** Elaborar modelo de mercado con supuestos, entrevistas y pilotos.

### 2.4 Hipótesis a validar

1. Los usuarios aceptan permisos granulares cuando los beneficios y límites son claros.
2. La memoria temporal reduce errores frente a detectar mensajes aislados.
3. El coste remoto por usuario se mantiene bajo al filtrar eventos localmente.
4. Las personas consideran útiles las advertencias sin sentirse constantemente interrumpidas.
5. Clientes B2B pagan por una reducción medida de incidentes o exposición, no por un panel vistoso.

---

## 3. Dominios funcionales / bounded contexts

| Contexto | Capacidad | Salida canónica |
|---|---|---|
| `Sensing` | Screen Seeker, DOM, UI, notificaciones e integraciones | `ObservedEvent` |
| `Privacy` | Consentimiento, permisos, redacción, retención | `ConsentGrant`, `DataPolicy` |
| `Semantics` | OCR, entidades, URLs, técnicas observables | `SemanticFact` |
| `Trust` | Entidades declaradas, relaciones, procedencia | `EvidenceLink` |
| `Threat` | Hipótesis, clasificación y tendencias | `RiskAssessment` |
| `Inference` | Routing, modelos, prompts, caché | `InferenceDecision`, `UsageRecord` |
| `Research` | Verificación de fuentes, reputación y corroboración | `ResearchFinding` |
| `Autonomy` | Preferencias, intervenciones, controles compatibles | `PolicyDecision`, `Intervention` |
| `Wellbeing` | Objetivos voluntarios, control de estímulos | `WellbeingPreference`, `LocalInsight` |
| `CollectiveIntel` | Indicadores agregados y campañas | `ThreatIndicator` |
| `Identity` | Cuentas, dispositivos, membresías | `Subject`, `Device` |
| `Billing` | Cupos, presupuestos, derechos de plan | `BudgetLedger`, `Entitlement` |
| `Audit` | Evidencia de decisiones y procedencia | `AuditEvent` |

**Regla:** cada contexto tiene propiedad de su modelo y contratos; no se comparten tablas internas ni se importan repositorios de datos entre contextos. Las integraciones se realizan mediante puertos o eventos tipados.

---

## 4. Principios no negociables

1. **Consent first:** permiso del sistema + permiso explícito del usuario + alcance interno coherente; revocables.
2. **Local first:** minimizar salida de píxeles, conversaciones y datos personales.
3. **Least privilege:** únicamente las fuentes y capacidades necesarias.
4. **Data minimization:** la memoria semántica no necesita ser un archivo ilimitado de capturas.
5. **Explainability:** hechos ≠ hipótesis ≠ recomendaciones.
6. **Non-coercion:** la persona puede desactivar las intervenciones no obligatorias, ver qué se registra y borrar su información.
7. **Evidence integrity:** hechos ligados a procedencia, versiones, timestamps y estados de verificación.
8. **Safety > tokens:** agotar presupuesto remoto nunca suprime alertas locales fundamentales.
9. **Provider portability:** cada modelo es una implementación de interfaz, no una dependencia del dominio.
10. **Measured claims:** no proclamar detección 100%, ahorro 95% o compatibilidad total sin pruebas.
11. **Secure by default:** no subir capturas ni logs sensibles, cifrado donde se persista.
12. **Fail closed on permissions:** al revocar consentimiento se detiene observación y transmisión asociada.

---

## 5. Productos y superficies

### 5.1 SOVIR Mobile

- **Android nativo:** Compose, consentimiento `MediaProjection` por sesión, servicio visible donde corresponda; APIs de notificación/accesibilidad solo con declaración, justificación y políticas pertinentes. Respetar apps seguras y la política de Google Play.
- **iOS nativo:** SwiftUI + ScreenCaptureKit donde esté disponible (sample oficial iOS 27+), picker de contenido y modos de fondo compatibles; validar versiones y review de App Store. Captura no implica leer bases de datos internas de WhatsApp, SMS o correo.
- Controles de fuentes, pausa rápida, privacidad por aplicación, historial de evidencia y consumo.

### 5.2 SOVIR Desktop

- **Windows:** Windows.Graphics.Capture + UI Automation + APIs de regiones modificadas donde corresponda; consentimiento/indicadores según interfaz.
- **macOS:** ScreenCaptureKit + Accessibility/Vision dentro de permisos y requisitos de sandbox/notarización.
- **Linux:** XDG Desktop Portal ScreenCast + PipeWire, adaptadores opcionales de X11/AT-SPI. Compatibilidad por compositor, no uniforme.
- **Shell:** Tauri para interfaz y daemon nativo Rust de sensores/políticas.

### 5.3 SOVIR Browser Extension

- Chrome/Edge/Firefox según compatibilidad WebExtensions; Manifest V3 donde aplique.
- `content scripts` limitados a dominios autorizados; DOM, formularios y banners de consentimiento.
- `declarativeNetRequest` y API de cookies cuando esté autorizado; no prometer acceso universal a rastreadores dentro de apps móviles.
- Ofrecer permisos opcionales por sitio, pausas, explicación y acciones de deshacer.

### 5.4 SOVIR Control Center

- Web: configuración, dispositivos, fuentes, políticas, investigación de alertas, uso y cuotas; consola B2B separada mediante RBAC/ABAC.
- No visualizar conversaciones privadas de empleados por defecto.

### 5.5 Integraciones futuras

- Email OAuth autorizado, mensajería empresarial, fintechs, operadores, fraude transaccional, reputación de dominios, catálogos de apps.
- **Nunca** presupone acceso directo a tráfico TLS descifrado o a mensajes privados de plataformas sin APIs disponibles.

---

## 6. Arquitectura general

### 6.1 Estilo

**DECISIÓN:** *Clean Architecture + Hexagonal (Ports & Adapters) + DDD ligero + modular monolith local-first + event-driven interno*. No microservicios por defecto. Separar despliegues solo cuando escalado, aislamiento de datos o SLOs lo justifiquen.

La hexagonal protege reglas de negocio de frameworks, proveedores de IA y APIs de captura; DDD delimita dominios; eventos tipados coordinan observación y reacción; CQRS **selectivo** en búsqueda y vistas analíticas; eventual consistency aceptable para inteligencia colectiva, **no** para consentimiento o acciones de protección.

```
┌───────────────────────────────────────────────────────────────┐
│ APPS: Android | iOS | Desktop | Browser | Web Console         │
├───────────────────────────────────────────────────────────────┤
│ Native adapters: MediaProjection / ScreenCaptureKit / UIA /  │
│ PipeWire / WebExtensions / Email+SDK                           │
├───────────────────────────────────────────────────────────────┤
│ Local Privacy Gate → Event Normalizer → Semantic Delta Engine│
├───────────────────────────────────────────────────────────────┤
│                   SOVIR CORE (RUST)                           │
│  Domain Entities | Use Cases | Ports | Policy Engine          │
│  Temporal Evidence Graph | Risk Engine | Inference Router    │
│  Scheduler | Local Cache | Budget Governor | Audit            │
├───────────────────────────────────────────────────────────────┤
│ Adapter implementations: SQLite / OCR / ONNX / Meta API /    │
│ Baseten / Modal / Fireworks / Research / Encrypted Sync       │
├───────────────────────────────────────────────────────────────┤
│ Optional Cloud: API Gateway | Investigation Jobs | Threat     │
│ Intel | Account and Billing | Observability | Admin Console   │
└───────────────────────────────────────────────────────────────┘
```

### 6.2 Regla de dependencias

`platform-adapter → application/use-cases → domain`; puertos definidos **hacia dentro**, implementaciones **hacia fuera**. El dominio nunca importa `reqwest`, frameworks UI, proveedores LLM, frameworks SQL, UI Automation, Android SDK ni APIs de Apple. `application` define coordinación; `domain` contiene invariantes y políticas.

**Ejemplo de puertos:** `ScreenEventSource`, `StructuredUiSource`, `EvidenceStore`, `RiskEstimator`, `InferenceGateway`, `ResearchGateway`, `UserConsentRepository`, `PolicyEvaluator`, `TelemetrySink`, `Clock`.

**Eventos de dominio:** `ObservationAccepted`, `EvidenceLinked`, `RiskReassessed`, `ConsentRevoked`, `PolicyInterventionRequested`, `BudgetExhausted`.

### 6.3 Paths y propietarios

- `crates/sovir-domain`: entities/value objects/invariants, sin efectos externos.
- `crates/sovir-application`: casos de uso y transacciones.
- `crates/sovir-ports`: contratos de puertos externos y eventos normalizados.
- `crates/sovir-adapters`: persistencia, OCR, proveedores, conectores.
- `crates/sovir-core`: composición de módulos y API FFI.
- `crates/sovir-inference`: scheduler, routing y presupuestos.
- `crates/sovir-privacy`: consentimiento, minimización, retención, cifrado.
- `crates/sovir-observability`: métricas desidentificadas, auditoría técnica.

### 6.4 Comunicación

- En dispositivo: bus tipado y colas acotadas en Rust; política de *backpressure* y prioridad.
- UI↔core: comandos/query tipados mediante UniFFI (iOS/Android, sujeto a validación), Tauri invoke/IPC (desktop); nunca exponer FFI de bajo nivel a UI directamente.
- Extensión↔desktop: native messaging opcional con handshake y origen verificado; fallback backend HTTPS con consentimientos.
- Cliente↔nube: HTTPS/TLS, autenticación, idempotency key y versiones de contrato; no subir streams continuos por defecto.
- Servicios externos: `InferenceGateway` con timeouts, retry solo idempotente, circuit breaker y límites por proveedor.

### 6.5 Flujos prioritarios

**Observación:** `source event → consent-check → normalization → redaction → dedup → local heuristics → memory/linker → risk update → policy → optional intervention`.

**Investigación avanzada:** `uncertain risk → request budget → minimize context → select model/provider → structured JSON output → validate schema → corroborate → evidence references → re-evaluate locally`.

**Revocación:** `revoke → stop collection → cancel queued remote jobs where possible → revoke tokens/source bindings → delete/expire associated records per policy → audit`.

**Feedback:** `dismiss/confirm false positive → local feedback → quality queue opt-in → reevaluation in test data` (no entrenar inmediatamente con una queja individual).

---

## 7. Screen Seeker y sensores

### 7.1 Modos de actividad

| Modo | Disparador | Trabajo permitido |
|---|---|---|
| `SUSPENDED` | Sin permiso, app excluida, sesión parada | Nada de captura; mostrar estado honesto. |
| `IDLE` | Dispositivo inactivo / sin novedades | Solo señales ligeras permitidas; cero captura periódica innecesaria. |
| `PASSIVE` | Eventos UI/DOM/notificación | Texto estructurado + hash/delta + reglas ligeras. |
| `FOCUSED` | Novedad/solicitud sensible | Captura selectiva autorizada, OCR de región, clasificador local. |
| `INVESTIGATE` | Riesgo significativo e incertidumbre | Inferencia remota minimizada y verificación de fuentes con presupuesto. |
| `INTERVENE` | Política permite y evidencia suficiente | Aviso/bloqueo compatible, explicaciones y control usuario. |

*No usar una captura constante a FPS fijo salvo requisito explícito de evaluación y consentimiento específico.*

### 7.2 Sensor API (contrato)

```rust
pub struct ObservedEvent {
    pub event_id: String,          // UUID/ULID
    pub source_id: String,         // identificador minimizado de fuente
    pub device_id: String,         // pseudónimo local
    pub observed_at_ms: i64,
    pub modality: Modality,        // Text, UiTree, ImageRegion, Url, Notification
    pub content_digest: String,   // hash normalizado; no texto bruto por defecto
    pub consent_grant_id: String,
    pub provenance: Provenance,
    pub sensitive_data_class: DataClass,
    pub payload_ref: Option<String>, // referencia a almacenamiento local cifrado
}
```

Este ejemplo es **contrato conceptual**; el tipo y la validación exacta se especificarán en `packages/contracts` y pruebas de compatibilidad antes de integrarlo.

### 7.3 Sensores necesarios

- `ScreenSensor`: frames/pantallas autorizados, regiones cambiadas, límites de tamaño.
- `UiSemanticSensor`: estructura de accesibilidad y eventos cuando esté legal y técnicamente disponible.
- `BrowserSensor`: DOM, URLs, cookies, mecanismos de consentimiento y reglas de bloqueo compatibles.
- `CommunicationSensor`: entradas proporcionadas por integraciones OAuth/APIs o recursos compartidos deliberadamente.
- `PermissionSensor`: permisos y manifiestos disponibles, sin privilegiar acceso no soportado.
- `NetworkMetadataSensor`: solo señales permitidas; jamás MITM silencioso ni evasión del cifrado.
- `ResearchConnector`: fuentes públicas, registros, listas de advertencias, reputación y herramientas.

### 7.4 Objetivos de eficiencia (**TARGETS, no benchmarks logrados**)

- Cero frames enviados a la nube en observación pasiva ordinaria.
- CPU media de agente escritorio en reposo <1%; pasivo <3% en hardware de referencia.
- RAM base objetivo <150 MB **excluyendo** modelos localmente cargados y caches GPU.
- Medición móvil de batería en mWh/h, energía por evento y degradación con/sin agente; no usar un único porcentaje universal de batería.
- Tiempos de regla local P95 objetivo <250 ms; investigación avanzada con SLO explícito por modalidad.
- Medir bytes capturados, recortes OCR, GPU-time, NPU-time, inferencias/h, frames perdidos y riesgo no detectado.

### 7.5 Scheduler adaptativo

- Evento antes que polling; debounce de cambios de UI.
- Filtro de apps y pantallas excluidas **antes** de serializar/persistir cuando la API permita filtrar desde origen.
- Perceptual hashing para regiones, hashes de texto normalizado con tratamiento especial a URLs/cuentas/precios.
- Modelo ligero solo si las reglas no bastan; batching controlado por latencia y energía.
- Backpressure: descartes de duplicados antes que eventos de alta severidad; registrar descartes **sin** contenido privado.
- Thermal/battery-aware: reducir tareas analíticas no esenciales sin desactivar defensa determinística crítica.
- TTL contextual y *negative caching* de resultados benignos, invalidado por cambio de sujeto/URL/precio/versión.

### 7.6 Restricciones específicas (que deben estar en pruebas)

| Plataforma | Captura/estructura | Condiciones críticas |
|---|---|---|
| Android | MediaProjection; opcional AccessibilityService | Captura consentida **por sesión**, foreground service según versión, ventanas seguras no capturables; restricciones Play. |
| iOS 27+ | ScreenCaptureKit y selector oficial | Usuario selecciona, background sujeto a capability/review; no acceso a bases de apps terceras. |
| Windows | Windows.Graphics.Capture; UI Automation | Apps protegidas, UAC, sesiones remotas y permisos variados; interfaz propia debe indicar estado. |
| macOS | ScreenCaptureKit; Vision/Accessibility | TCC, permisos, notarización, exclusión de ventanas sensibles. |
| Linux | XDG Portal + PipeWire; AT-SPI/X11 si procede | Wayland compositor-dependent; portal controla selección; sin capturas clandestinas. |
| Browser | Manifest V3/WebExtensions | Host permissions por origen, reglas de red limitadas; no equivalen a observar todo el OS. |

---
## 8. Inteligencia, riesgo, ML y evaluación científica

### 8.1 Taxonomía de riesgos

1. `FRAUD`: suplantación, falsos créditos, inversiones fraudulentas, robo de cuentas, pagos indebidos.
2. `COERCION`: amenazas, intimidación, extorsión, presión desproporcionada identificable.
3. `COMMERCIAL_MANIPULATION`: dark patterns, urgencia artificial, cargos ocultos, cancelación opaca.
4. `PRIVACY_EXPLOITATION`: rastreo, permisos desproporcionados, recopilación de datos confusa.
5. `ATTENTION_DESIGN`: mecanismos adictivos o repetitivos **observables**, sujetos a preferencias del usuario.
6. `IDENTITY_CLAIM`: identidad afirmada vs evidencias disponibles y fuentes verificadas.
7. `UNKNOWN`: evidencia insuficiente; resultado legítimo que debe poder producir el motor.

No equiparar «persuasión», «actividad comercial», «publicidad» o «uso frecuente» con fraude o enfermedad. Guardar severidad, confianza y evidencia por separado. No atribuir riesgo personal por edad, género, etnia, preferencias políticas, religión o rasgos psicológicos inferidos.

### 8.2 Pipeline de análisis

```
source/consent → typed event → minimization → extraction
   → factual claims / entities → local detectors → temporal linking
   → risk hypotheses (with uncertainty) → corroboration as needed
   → policy decision → user-facing explanation → optional feedback
```

**Contrato de inferencia:** los modelos proponen `facts`, `hypotheses`, `evidence_ids`, `uncertainty`, `suggested_actions`; un validador de esquema y el **Policy Engine determinista** deciden qué se puede ejecutar. Ningún LLM envía dinero, publica un reporte, accede a nuevas fuentes o bloquea apps solo por una instrucción escrita en contenido observado.

### 8.3 Temporal Evidence Graph

Entidades (`Entity`), identidades afirmadas (`ClaimedIdentity`), recursos (`URL`, `Phone`, `App`, `AccountRef`), evidencias (`Evidence`), observaciones (`Event`) y vínculos (`Link`). Cada arista registra **tipo, procedencia, período, confiabilidad y razón**. Distinguir correlación de identidad confirmada.

**Persistencia inicial:** SQLite local cifrado + índices relacionales y tabla de aristas. No introducir Neo4j por moda; considerar motor de grafos dedicado solo si las consultas o la escala lo requieren y se benchmarkea mejora.

**Capacidad de predicción:** estimar transiciones observables hacia acciones sensibles y evaluar calibración por tipo de escenario. Hasta tener un conjunto etiquetado y calibración demostrada, usar bandas de incertidumbre/etapas explicables, **no porcentajes pseudo-científicos**.

### 8.4 CRISP-DM, no «CRISPR ML»

La metodología que probablemente buscas es **CRISP-DM** (*Cross-Industry Standard Process for Data Mining*), no CRISPR (técnica de edición genética). Combinar:

- **CRISP-DM** para experimentación: comprensión del negocio → comprensión de datos → preparación → modelado → evaluación → despliegue; ciclos repetibles.
- **MLOps / continuous evaluation** para datasets versionados, registro de modelos, evaluaciones de regresión y *drift*.
- **Model Cards / Data Cards** para limitaciones, origen, cobertura y riesgos.
- **TDD/BDD/XP** para software de producción (ver §14).
- **Threat modeling** y *privacy engineering* antes de instrumentar nuevos sensores.

No entrenar un modelo predictivo propio sin dataset pertinente, etiquetas consistentes y evaluación fuera de muestra. El primer nivel puede funcionar con reglas y modelos externos; el aprendizaje especializado se justifica con resultados.

### 8.5 Conjuntos de datos y etiquetado

- Datos sintéticos de casos legítimos, ambiguos y perjudiciales, rotulados claramente como simulados.
- Fuentes públicas y estudios de engaño/dark patterns con licencias y procedencia registradas.
- Pruebas con *opt-in* explícito para contenido real; consentimiento de todas las partes cuando proceda.
- Muestreo estratificado por tipo de fuente, idioma, dialecto, contexto cultural, tipo de daño y clase legítima.
- Split **temporal y por campaña/fuente**, para evitar leakage de plantillas casi idénticas.
- Supervisión humana doble para casos controvertidos; etiqueta `cannot_determine` válida.
- No almacenar en repositorio capturas reales privadas ni credenciales.

### 8.6 Métricas y puertas de calidad

| Dimensión | Métricas | Control |
|---|---|---|
| Detección | precision, recall, FPR, FNR por clase y plataforma | Reportar intervalos y tamaños de muestra. |
| Secuencia | recall **antes** de acción sensible, lead time, linking precision | Comparar contra baseline sin memoria. |
| Modelo | calibration error / Brier, abstention quality, evidencia correcta | No porcentajes «seguros» sin calibración. |
| Usuario | alertas molestas/día, aceptación y corrección, abandono, tiempo a decisión | No optimizar clics a costa de intimidación. |
| Privacidad | bytes/redacción, retención, tokens PII enviados, revocación efectiva | Pruebas automatizadas y auditoría. |
| Rendimiento | CPU/GPU/NPU/RAM/energía, P50/P95/P99, bytes procesados | Laboratorio por plataforma/dispositivo. |
| Economía | tokens/caso, coste/caso, consultas evitadas, $/usuario/mes | Metering por proveedor y escenario. |

**Gates:** toda funcionalidad de riesgo debe incluir al menos un caso adversarial, uno benigno y uno ambiguo; toda nueva ruta remota debe tener presupuesto y prueba de redacción; toda intervención automática debe tener *undo* o política explícita de irreversibilidad, según el caso.

### 8.7 Protección contra prompt injection y abuso

- Texto de páginas, anuncios, chats, imágenes, PDFs y respuestas de terceros = **datos no confiables**.
- Delimitar orígenes en prompts, nunca elevar instrucciones embebidas a mensajes `system`.
- Herramientas remotas en allowlist y escopos mínimos; sin secretos en contexto.
- Salida LLM validada por JSON Schema + assertions de política + evidencias enlazadas.
- Pruebas de *indirect prompt injection*, exfiltración, falsificación de autoridad, instrucciones codificadas y *tool-output laundering*.
- Limitar investigación recursiva, número de herramientas y gasto por tarea.
- Separar *red-team* defensivo en entornos de prueba de cualquier operación sobre personas reales.

---

## 9. Stack tecnológico

### 9.1 Matriz cerrada de tecnologías (DECISIÓN propuesta)

| Superficie / capa | Lenguajes | Frameworks / bibliotecas | Motivo / nota |
|---|---|---|---|
| Núcleo común | Rust stable | Cargo workspace, Tokio, serde, thiserror, tracing | Control de recursos, seguridad, portabilidad. |
| Mobile Android | Kotlin | Jetpack Compose, Coroutines, Android SDK | Integración nativa con captura y permisos. |
| Mobile iOS | Swift | SwiftUI, ScreenCaptureKit, Vision, OS frameworks | API nativa y políticas Apple. |
| Windows/macOS/Linux UI | TypeScript + Rust | Tauri 2 + React + Vite | Shell liviano con lógica nativa; validar Tauri versión al crear proyecto. |
| Browser extension | TypeScript | Manifest V3/WebExtensions, Vite, WXT opcional | Separación DOM/network permisos. |
| Web console | TypeScript | Next.js App Router + React + Tailwind + componentes accesibles | Dashboard, consola y producto B2B. |
| API / BFF | Rust | Axum, Tokio, tower, OpenAPI | Contratos y tipado en mismo ecosistema Rust. |
| Investigator worker | Python | FastAPI solo si expone API, Pydantic, httpx, SDKs de modelos | Ecosistema ML y jobs experimentales. |
| Jobs/eventos nube | Rust + Python | Postgres + cola (NATS JetStream o alternativa a validar) | Escalado progresivo; evitar Kafka prematuro. |
| DB local | SQLite | SQLCipher o cifrado a nivel de aplicación con diseño auditado | Eventos mínimos y memoria local. |
| DB cloud | PostgreSQL | SQLx / migraciones SQL versionadas | Multiusuario y auditoría, RLS donde proceda. |
| Objetos opcionales | S3-compatible | Cifrado/TTL/presigned URLs cortas | Solo objetos consentidos. |
| ML local | Rust/Python + nativo | ONNX Runtime, Core ML, Android runtimes adecuados | Clasificación/embeddings/OCR optimizados. |
| OCR | Swift/Kotlin/Python | Vision, ML Kit, Tesseract según platform/benchmark | Evitar coste nube de OCR cuando sea posible. |
| Meta advanced | Rust/Python | Meta Model API, `muse-spark-1.3` Standard | Razonamiento y multimodalidad con datos minimizados. |
| QA Rust | Rust | cargo test, clippy, fmt, nextest opcional | Verificaciones unitarias y de integración. |
| QA TS | TypeScript | Vitest, Playwright | UI y extensión. |
| QA mobile | Kotlin/Swift | JUnit, Espresso/UIAutomator; XCTest | Permisos, sesion de captura y UI. |
| QA ML | Python | pytest, pydantic, datasets propios versionados | Evals reproducibles por escenario. |
| Telemetría | Multilenguaje | OpenTelemetry, Prometheus, Grafana/Sentry según consentimiento | Costos y fallos sin contenido privado. |
| Infra | IaC | Terraform + Docker Compose local + CI GitHub Actions | Reproducibilidad y despliegue. |

**Dependencias no comprometidas:** Bun vs Node, WXT vs bare WebExtensions, NATS vs Redis Streams, SQLCipher vs cifrado campo a campo, proveedores cloud de almacenamiento/monitorización se resolverán mediante ADR con prueba de integración. Las versiones exactas se fijan mediante lockfiles una vez instaladas; **no se inventan números de versión**.

### 9.2 Backend recomendado

- **Cloud API/BFF en Axum:** autenticación, cuotas, investigación, esquemas, sincronización.
- **Worker Python separado:** análisis ML fuera del request path, sin negocio central duplicado.
- **Rust Core en dispositivo:** políticas, memoria, evento e inferencia ligera.
- **Postgres:** cuentas, planes, metadatos, sin pantallas brutas por defecto.
- **Investigación externa:** jobs idempotentes y cancelables; capacidad offline degradada.

### 9.3 Frontend recomendado

- **Android:** Compose nativo, pantalla consentimiento, fuentes, alertas, evidencia, configuración de consumo.
- **iOS:** SwiftUI nativo equivalente, adaptando permisos y mensajes a realidad de iOS.
- **Desktop:** Tauri/React, bandeja del sistema, screen seeker, consentimiento y timeline.
- **Extension:** popup, options, onboarding y content script; UI compartida *design tokens*, no runtime común a toda costa.
- **Web:** Next.js, separación de panel Personal/Enterprise, RBAC, accesibilidad WCAG AA como objetivo.

### 9.4 Contratos e interoperabilidad

- REST + OpenAPI 3.x para SDKs e integraciones síncronas; SSE/WebSocket solo para eventos en vivo necesarios.
- JSON Schema para eventos/LLM; versionado semántico por contrato.
- Protobuf solo cuando el coste binario/stream de eventos lo exija tras profiling.
- Libs de clientes generadas, no duplicar manualmente DTOs en Kotlin/Swift/TS.
- Cada *breaking change* requiere compatibilidad o versión nueva.

---

## 10. Modelo de datos, API y políticas

### 10.1 Entidades base

```
Subject            Device              ConsentGrant
Source             ObservedEvent        SemanticFact
Evidence           EvidenceLink        RiskHypothesis
RiskAssessment     ResearchFinding     Policy
PolicyDecision     Intervention        Feedback
InferenceRequest   InferenceUsage      ResourceBudget
ThreatIndicator    AuditRecord         ModelVersion
```

Los IDs deben ser opacos; el `source_id` seudónimo no es identidad verificada. Retención configurable por tipo de fuente. Campos sensibles con clasificación interna obligatoria.

### 10.2 Ejemplo canónico de decisión

```json
{
  "assessment_id": "test-assessment-001",
  "category": "FRAUD",
  "severity": "HIGH",
  "confidence_band": "MEDIUM",
  "observations": ["evt-0001", "evt-0002"],
  "facts": [
    {"kind": "SENSITIVE_REQUEST", "evidence_id": "evidence-0002"}
  ],
  "hypotheses": [
    {"code": "POSSIBLE_IMPERSONATION", "verified": false}
  ],
  "uncertainties": ["IDENTITY_UNVERIFIED"],
  "recommended_actions": ["VERIFY_WITH_INDEPENDENT_CHANNEL"],
  "auto_block_allowed": false,
  "policy_version": "0.1"
}
```

### 10.3 Endpoints de referencia (**no implementados**)

```text
POST   /v1/devices/register
GET    /v1/consents
POST   /v1/consents
DELETE /v1/consents/{grant_id}
POST   /v1/observations/batch      # esquema minimizado; consentido
POST   /v1/investigations
GET    /v1/investigations/{id}
GET    /v1/assessments/{id}
POST   /v1/assessments/{id}/feedback
GET    /v1/policies
PUT    /v1/policies/{id}
GET    /v1/usage/budgets
GET    /v1/usage/ledger
DELETE /v1/user-data            # con confirmación y trazabilidad
```

Cada ruta requiere: scopes, control de tasa, autorización por sujeto, validación, idempotencia según efecto, logs redaccionados, pruebas de abuso y contrato OpenAPI. No exponer acceso al material sin redactar desde URLs de respuesta por defecto.

### 10.4 Policy decision table

| Estado | Acción por defecto | Condición de escalado |
|---|---|---|
| Sin autorización | Sin captura/procesamiento | Grant explícito de sistema + app. |
| Señal irrelevante o duplicada | Ignorar + métricas técnicas anónimas | Cambio material. |
| Sospecha baja / incierta | Registrar evidencia mínima | Mayor riesgo o petición del usuario. |
| Riesgo alto apoyado en hechos | Advertir + explicar | Verificación disponible o política autoriza intervención. |
| Petición sensible en sistema integrado | Sugerir confirmación independiente | Bloqueo **solo** si integration owner habilita política. |
| Error/servicio remoto caído | Mantener reglas locales y explicar cobertura | Reintento condicionado a presupuesto. |

---

## 11. Monorepo y empaquetado

**DECISIÓN:** un monorepo GitHub llamado provisionalmente `sovir`, con *workspace* Rust, *workspace* pnpm para TypeScript y proyectos nativos autónomos en Android/iOS. El scaffolding incluido en este paquete crea **directorios y contratos de gobernanza**, no implementa aplicaciones terminadas.

```text
sovir/
├── README.md                      # visión y arquitectura maestra
├── AGENTS.md                      # reglas canónicas cross-agent
├── CLAUDE.md                      # entrada Claude -> AGENTS y ADRs
├── Makefile                       # comandos del harness
├── Cargo.toml                     # workspace Rust (se genera al implementar crates)
├── pnpm-workspace.yaml            # workspace apps/packages TS
├── package.json                   # comandos de repo, sin apps fantasma
├── .tool-versions                 # versiones cuando se comprueben
├── .env.example                   # exclusivamente nombres, sin secretos
├── .gitignore
├── .github/
│   ├── workflows/ci.yml
│   ├── CODEOWNERS
│   └── pull_request_template.md
├── .cursor/rules/
│   ├── 00-global.mdc
│   ├── 10-rust-hexagonal.mdc
│   ├── 20-native-platforms.mdc
│   ├── 30-ai-and-evals.mdc
│   └── 40-privacy-and-cost.mdc
├── .claude/
│   ├── agents/{architect,security-reviewer,ml-evaluator}.md
│   └── skills/{architecture-review,privacy-audit,cost-audit,threat-eval}/SKILL.md
├── .devin/
│   └── README.md                  # contrato operativo Devin
├── docs/
│   ├── adr/
│   ├── architecture/
│   ├── product/
│   ├── security/
│   ├── ml/
│   ├── operations/
│   ├── compliance/
│   └── benchmarks/
├── apps/
│   ├── android/                   # Gradle/Kotlin/Compose
│   ├── ios/                       # Xcode/Swift/SwiftUI
│   ├── desktop/                   # Tauri + UI React
│   ├── extension/                 # WebExtensions
│   └── console/                   # Next.js
├── crates/
│   ├── sovir-domain/
│   ├── sovir-application/
│   ├── sovir-ports/
│   ├── sovir-adapters/
│   ├── sovir-core/
│   ├── sovir-inference/
│   ├── sovir-privacy/
│   └── sovir-observability/
├── services/
│   ├── api/                       # Axum
│   ├── investigator/              # jobs Python
│   └── threat-intel/
├── packages/
│   ├── contracts/                 # JSON Schema + OpenAPI
│   ├── client-sdk/                # SDK generado
│   └── design-system/
├── ml/
│   ├── datasets/                  # sintéticos/publicables solamente
│   ├── evals/
│   ├── pipelines/
│   └── model-cards/
├── infra/
│   ├── docker/
│   ├── terraform/
│   ├── modal/
│   ├── baseten/
│   └── fireworks/
├── tests/
│   ├── fixtures/
│   ├── contracts/
│   ├── e2e/
│   ├── performance/
│   └── security/
└── scripts/
    ├── harness.py
    └── check_architecture.py
```

### 11.1 Esquema de empaquetado

| Paquete | Artefacto | Canal / consideraciones |
|---|---|---|
| Core Rust | librería estática/dinámica por target | Cargo workspace, FFI versionada, firmas. |
| Android | `.aab` (store) / `.apk` (testing) | Gradle, firma, Play policies, permisos y divulgación. |
| iOS | `.ipa` de distribución | Xcode, signing, App Store review/TestFlight, entitlements. |
| Desktop | `.msi`/`.exe`, `.dmg`/`.pkg`, `.AppImage`/`.deb`/`.rpm` | Tauri bundler + firma/notarización según OS. |
| Extensión | `.zip`/CRX y paquetes para stores | Manifest permisos mínimos y privacy disclosure. |
| Web/API | contenedores OCI firmados | Imagen multi-stage, rootless, escaneo SBOM y SLSA cuando proceda. |
| SDK | crates, Swift package, Kotlin package, npm | SemVer, docs, licencias e integración de contratos. |

**Política de releases:** `0.x` implica contrato inestable; un release versiona commit, esquema, modelos, presupuesto y notas de seguridad. CI nunca publica a stores con un PR no aprobado.

### 11.2 Versionado y dependencias

- Lockfiles obligatorios por ecosistema: Cargo.lock para binarios, pnpm-lock, Gradle locks si se habilitan, Python lock, Xcode/resolución SPM.
- Política Dependabot/Renovate con tests y revisión de seguridad.
- SBOM de releases, verificación de licencias de dependencias y modelos.
- Configuración bajo variables de entorno/secret manager, secretos **nunca** en repositorio ni `AGENTS.md`.

---
## 12. Entornos, distribución y despliegue

### 12.1 Entornos

- `local`: mocks y datos sintéticos, sin llamadas remotas por defecto.
- `dev`: APIs reales mediante claves de desarrollo y presupuestos pequeños.
- `staging`: datos sintéticos/canonizados, paridad de infraestructura, tests E2E.
- `prod`: claves y almacenamiento separados, mecanismos de rollback, alertas de gasto.

Cualquier modelo externo debe tener `provider`, `model_id`, `privacy_mode`, `retention_policy`, `capabilities`, `limits`, `cost_rates` y estado de disponibilidad en un registro config versionado. Claves solo en infraestructura segura.

### 12.2 Runtime offline-first

La app debe poder: gestionar permisos, detener sensores, analizar reglas locales, examinar eventos ya disponibles y consultar registros sin conexión. Funcionalidades online (corroboración externa, análisis profundo, inteligencia compartida) indican degradación visible. No usar red como requisito para desactivar capturas.

### 12.3 Distribución y canales

- Android: firma, Play Console / canales de prueba, disclosure de accesibilidad, seguridad de capturas.
- iOS: App Store/TestFlight y capabilities vigentes con revisión de políticas.
- Windows: firma de código, instalador, SmartScreen/reputación, updater firmado.
- macOS: Developer ID, notarización, permisos Screen Recording/TCC, updater firmado.
- Linux: paquetes verificables, Flatpak/portal donde corresponda, declaración de compatibilidad por compositor.
- Browser: Chrome Web Store/AMO/Edge Add-ons, términos de privacidad y solicitudes de permisos incrementales.
- Backend: despliegue de contenedores con health-check, *readiness*, *rolling update*, migraciones seguras y backups cifrados.

### 12.4 Observabilidad y SLO

- Metrics: latency P50/P95/P99, error rate, event-drop, queuing, local-processing-ratio, inferencia/usuario, costo/cliente.
- Traces: span IDs y event types; **no** texto de pantalla en spans.
- Logs: *structured, redacted*, TTL mínimo y acceso administrativo auditado.
- Objetivo de disponibilidad cloud de partida: por definir después de medir dependencia real; protección esencial local no depende del SLA cloud.
- SLO de consentimiento: aplicación de revocación al pipeline local de inmediato en el siguiente ciclo de evento, probado mediante integración; medidas complementarias para jobs remotos ya enviados.

---

## 13. Estrategia de ramas y PRs

**DECISIÓN:** **trunk-based development** con `main` protegida, ramas de vida corta y Git worktrees por agente. No crear docenas de ramas permanentes. Las ramas de módulos son **ejemplos de ramas efímeras**, que se eliminan tras merge.

### 13.1 Ramas persistentes

| Rama | Persistencia | Regla |
|---|---|---|
| `main` | Única línea estable | Protegida, sin push directo, siempre verde. |
| `release/x.y.z` | Solo mientras se estabiliza release | Backports explícitos, tags semver. |
| `hotfix/INC-###-slug` | Temporal | Rama desde tag/`main`, pruebas urgentes. |

**No mantener `develop`, `staging`, `cursor`, `claude`, `devin` como ramas divergentes.** Los entornos se implementan por deployments del mismo commit o tags, no por ramas con lógica diferente.

### 13.2 Convención de ramas efímeras

`<tipo>/<ticket>-<slug>` donde tipo es:

- `feat/`: capacidad funcional nueva.
- `fix/`: corrección de defecto.
- `sec/`: seguridad/privacidad.
- `perf/`: optimización CPU/RAM/GPU/token.
- `ml/`: dataset, evaluación o modelo.
- `platform/`: adaptadores OS.
- `infra/`: CI, deploy, pipelines.
- `docs/`: documentación/ADR.
- `test/`: pruebas, mocks y harness.
- `spike/`: experimento desechable que no se mergea sin formalizar.
- `refactor/`: refactor sin cambiar comportamiento observable.

Ejemplos de backlog de ramas (solo crearlas cuando haya issue y propietario):

```text
feat/SOV-001-core-ports
feat/SOV-002-consent-engine
platform/SOV-003-android-capture
platform/SOV-004-ios-screen-capture
platform/SOV-005-windows-ui-automation
platform/SOV-006-macos-screen-capture
platform/SOV-007-linux-portal-pipewire
feat/SOV-008-browser-sensor
feat/SOV-009-semantic-delta
feat/SOV-010-temporal-evidence
ml/SOV-011-risk-eval-dataset
feat/SOV-012-inference-router
perf/SOV-013-token-governor
sec/SOV-014-data-redaction
feat/SOV-015-autonomy-interventions
feat/SOV-016-consumer-dark-patterns
feat/SOV-017-privacy-tracker-controls
feat/SOV-018-wellbeing-preferences
feat/SOV-019-research-engine
feat/SOV-020-control-center
infra/SOV-021-ci-harness
infra/SOV-022-meta-model-api-adapter
infra/SOV-023-modal-batch-worker
infra/SOV-024-baseten-model-adapter
infra/SOV-025-fireworks-benchmark
feat/SOV-026-enterprise-sdk
sec/SOV-027-prompt-injection-hardening
perf/SOV-028-power-profiling
```

### 13.3 Contrato de PR

Un PR pertenece a **un ticket + un bounded context principal**. Si modifica más de un contexto, justificar acoplamiento y pedir aprobación de propietario.

Checklist obligatorio:

- [ ] Issue, objetivo y criterios de aceptación enlazados.
- [ ] `git diff` revisado por el autor/operador humano.
- [ ] Tests unitarios y de contrato actualizados.
- [ ] Sin payloads de pantalla, credenciales o PII en fixtures/logs.
- [ ] Política de consentimiento respetada.
- [ ] Impacto en recursos y tokens anotado, o «no aplica» justificado.
- [ ] ADR si cambia decisión arquitectónica.
- [ ] Sin dependencias nuevas ni permisos OS sin revisión.
- [ ] Resultado reproducible y captura/registro de prueba **sintético** si mejora UX.
- [ ] Revisión independiente de seguridad para sensores, permisos, sincronización y proveedores.

**Merge:** squash por defecto; `main` protegida, mínimo una aprobación humana para cambios críticos; CI verde. Puede pedirse revisión de otro agente como apoyo, pero **ningún agente se auto-aprueba cambios de alto riesgo**.

### 13.4 Matriz de propiedad de carpetas

| Ruta | Owner primario de ejecución | Revisores obligatorios |
|---|---|---|
| `docs/product`, especificación / ADR | ChatGPT (plan) + humano (aprobación) | Claude para impacto técnico |
| `crates/sovir-domain`, `application`, `ports` | Claude Code | ChatGPT/propietario para contratos |
| `apps/android`, `apps/ios`, `apps/desktop`, `apps/extension` | Cursor + humano | Claude para privacidad/FFI |
| `apps/console`, `packages/design-system` | Cursor | Humano para UX |
| `services/api`, `infra`, `.github`, `scripts` | Devin por ticket acotado | Claude para APIs/safety |
| `ml/datasets`, `ml/evals`, `crates/sovir-inference` | Claude + ChatGPT eval design | Humano para resultados; Devin infra test |
| `.cursor`, `.claude`, `AGENTS.md`, `CLAUDE.md` | Humano + ChatGPT para especificar | Claude revisión de contradicción |
| Políticas, permisos, criptografía | Humano decide; implementación ticket owner | Revisión independiente obligatoria |

No significa que ChatGPT tenga acceso automático al repo ni que Claude/Devin/Cursor tengan facultad de fusionar sin permisos. Todos trabajan mediante tareas explícitas y PRs.

---

## 14. Método de desarrollo: XP + Kanban + ADR + CRISP-DM

### 14.1 Elección

**No usar Scrum ceremonioso para un solo desarrollador.** Usar **Kanban de flujo continuo** con XP como disciplina de ingeniería y **CRISP-DM** para experimentos con datos/modelos.

- **Kanban:** `Backlog → Ready → In Progress → In Review → Verified → Done`; WIP 1 por módulo crítico, máximo 2 cambios concurrentes no solapados.
- **Extreme Programming (XP):** TDD en dominio, refactor frecuente, diseño simple pero extensible, integración continua, pair programming humano+agente, *collective code ownership* gobernado por matriz de revisión.
- **BDD:** escenarios Given-When-Then en comportamientos observables (sobre todo permisos, bloqueo, excepciones y falso positivo).
- **CRISP-DM:** ciclo separado para identificar necesidad, obtener dataset, etiquetar, modelar, evaluar y desplegar.
- **ADR:** decisiones estructurales escritas antes de merges que cambien contratos, persistencia, sensores o proveedores.
- **Threat modeling:** STRIDE + LINDDUN/privacidad para funciones que observan datos personales.
- **SRE / FinOps:** presupuestos, métricas, alertas y pruebas de resiliencia.

### 14.2 Definition of Ready (DoR)

Ticket tiene: problema, outcome, directorios permitidos, contratos afectados, dataset/fixture, restricciones de permisos/PII, riesgos, aceptación automatizable y presupuesto esperado.

### 14.3 Definition of Done (DoD)

Funciona + tiene pruebas + tiene evidencia de resultados + pasa lint/format/security + documentación+contrato actualizado + ejecución consentida y desactivable + sin regresión de recursos significativa + revisión humana.

### 14.4 Ritual operativo ligero

1. Inicio de sesión: leer issue, ADRs aplicables, estado Git y tareas paralelas.
2. Antes de código: escribir tests/contrato y propuesta corta.
3. Durante: cambios pequeños, check local y commits atómicos.
4. Antes de PR: ejecutar harness completo relevante y auditoría de privacidad/costo.
5. Post-merge: registrar resultado medido, deuda y aprendizaje; no «resúmenes de éxito» inventados.

---

## 15. Harness: verificación obligatoria del producto y los agentes

**Harness** = combinación de scripts reproducibles, suites, fixtures y gates que impide aceptar cambios únicamente porque «el agente dice que funcionan».

### 15.1 Niveles

| Nivel | Prueba | Ejemplo |
|---|---|---|
| L0 | formato, lint, compilación | Rust fmt/clippy, TypeScript check, Swift/Kotlin build. |
| L1 | unitarias deterministas | `PolicyEngine`, `BudgetGovernor`, consentimiento, graph links. |
| L2 | contratos | JSON Schema/OpenAPI, clientes, backward compatibility. |
| L3 | integración | SQLite cifrado, API Meta mock, cola, cancelación, permisos. |
| L4 | comportamiento E2E | caso benigno, sospecha, fraude simulado, consentimiento revocado. |
| L5 | ML eval / model benchmarking | recall/precision/calibración/abstención/costo con golden dataset. |
| L6 | privacy/security | prompt injection, permisos, SSRF, rate limits, eliminación, secretos. |
| L7 | recursos | CPU, GPU, RAM, batería, tokens, costo/1000 eventos. |
| L8 | cross-platform | dispositivos reales/CI de OS, pruebas de app-store compatibility. |

### 15.2 Casos golden (mínimo)

```
CASE-001 legit-password-reset → no acusar de fraude solo por OTP
CASE-002 spoofed-support-otp → advertencia por evidencias concretas
CASE-003 credit-ad-hidden-fees → explicar costo si datos verificables
CASE-004 benign-sale-countdown → no declarar estafa automática
CASE-005 coercive-contacts-loan → detectar solicitud sensible y advertir
CASE-006 consent-revoked → 0 eventos recolectados después del cambio
CASE-007 repeated-frame → 0 consultas remotas adicionales
CASE-008 malicious-prompt-on-screen → herramientas/políticas intactas
CASE-009 provider-down → política local sigue funcionando
CASE-010 budget-exhausted → bloquear nuevas inferencias pagas no esenciales
CASE-011 private-window-secure → no bypass de protección de captura
CASE-012 unlinked-identities → no fusionar eventos por similitud superficial
CASE-013 user-wellbeing-prefs-off → ningún seguimiento para ese módulo
CASE-014 personal-conversation → no mostrar en consola empresarial
CASE-015 false-positive-feedback → no entrenar automáticamente
```

### 15.3 Comandos estandarizados

```bash
make bootstrap            # muestra dependencias/estado de scaffold
make check                # gates disponibles en el estado del repo
make test                 # pruebas de código creadas y harness Python
make verify-architecture  # límites y rutas arquitectónicas
make eval                 # fixtures sintéticos, sin costos de API
make benchmark            # reservado; no ejecuta cargas caras sin flag
make doctor               # reporte de herramientas instaladas
```

En el scaffold entregado, `scripts/harness.py` y `scripts/check_architecture.py` son **punto de partida real, no sustitutos de las suites nativas**. Si no existe aún un proyecto Android/iOS, el harness lo marca como `NOT_IMPLEMENTED`, nunca como aprobado.

### 15.4 Matriz GitHub Actions

- Linux: docs/harness/security lightweight + Rust/TS (si existe proyecto).
- Windows/macOS: compilación nativa y perfiles de rendimiento cuando existan runners y toolchains.
- Android: instrumented tests en emulador/dispositivo conectado bajo pipeline habilitado.
- iOS: XCTest en runner macOS, entitlements y capture tests en dispositivo real cuando sea imprescindible.
- Jobs GPU remotos manuales `workflow_dispatch`, con cuota; no lanzar inference cara en cada PR.
- Reportes unitarios, logs sin datos privados, artifacts con retención corta.

### 15.5 Indicadores de calidad de agentes

`PR pass rate`, `regressions/merge`, `rework`, `diff size`, `time to verified`, `unjustified permissions`, `benchmark delta`, `tokens spent on task`. La calidad no se mide por número de líneas añadidas.

---

## 16. Orquestación de Cursor, Claude, Devin y ChatGPT

**Objetivo:** cuatro asistentes complementarios, no cuatro arquitectos editando el mismo núcleo. La autoridad final sobre alcance, merges y permisos es **humana**.

### 16.1 Roles fijos

| Participante | Responsabilidad principal | Puede modificar directamente | No debe hacer sin autorización |
|---|---|---|---|
| **ChatGPT** | Product architect, estrategia, briefs, research, ADR propuestos, eval specs, revisión de riesgos | Artefactos de especificación entregados al repo mediante PR y humano | Cambiar contratos unilateralmente, asumir acceso a repo, prometer features. |
| **Claude Code** | Domain architect / Rust core / contratos / revisión de seguridad y ML | `crates/`, `packages/contracts`, eval specs asignadas | Rediseñar UI o permisos OS sin ticket/ADR. |
| **Cursor** | Implementación interactiva UI, nativo, integración de sensores y debugging local | `apps/`, UI/adapters asignados | Redefinir modelos core, esquemas o políticas sin RFC. |
| **Devin** | Infra, CI/CD, scripts, integraciones desacopladas, automatización de pruebas, PRs acotados | `infra/`, `services` asignados, `.github`, `scripts` | Reestructurar monorepo, resolver decisiones de seguridad en solitario, mergear cambios críticos. |
| **Humano maintainer** | Decisiones finales, credenciales, acceso físico/dispositivos, cumplimiento, merges y releases | Todo bajo revisión | Delegar autonomía irreversible a agentes. |

### 16.2 Protocolo para tickets multiagente

**Un ticket = un owner de implementación y 1+ revisores.**

1. ChatGPT/humano escribe `RFC / ISSUE` con objetivo, datos y aceptación.
2. Claude define/valida contrato si impacta el core. Publica OpenAPI/schema/trait e incluye fixture.
3. Se congela contrato `v0.x` en `packages/contracts`; Cursor implementa app/adapter en rama propia; Devin prepara infraestructura en ruta separada.
4. Cada uno trabaja en **worktree** independiente y no en el mismo archivo a la vez.
5. Tests de contrato anticipan integraciones sin depender de que la otra rama esté mergeada.
6. CI, revisión cruzada, merge secuencial a `main`: **contrato → servicio/core → app → infra opcional**.
7. ChatGPT audita resultado contra el brief; humano acepta o abre una incidencia de rectificación.

### 16.3 Matriz de cambios que exigen ADR

- Cambiar entidades core, contratos de puertos, payload de evidencia o semántica de consentimiento.
- Añadir un proveedor de nube con retención/uso de datos diferente.
- Introducir permiso de accesibilidad, micrófono, screen recording o lectura de SMS.
- Cambiar modelo de cifrado, sincronización o política de retención.
- Desplegar nuevos modelos o decisiones automáticas que afecten experiencias del usuario.
- Alterar pricing por consumo o cupos de seguridad.

### 16.4 Plantilla de instrucción para un agente

```text
TICKET: SOV-XXX
ROL/OWNER: Cursor | Claude | Devin
OBJETIVO MEDIBLE: ...
RUTAS EDITABLES: ...
RUTAS PROHIBIDAS: ...
CONTRATOS/API: packages/contracts/<...>
ADRs APLICABLES: ...
DEFINITION OF DONE: ...
PRUEBAS REQUERIDAS: ...
RESTRICCIONES PRIVACIDAD/PERMISOS: ...
PRESUPUESTO API/GPU: ... (default 0 para test)
ENTREGABLE: PR; lista de tests ejecutados y pendientes
ESCALACIÓN: si hay conflicto de arquitectura, detener y proponer ADR
```

### 16.5 Manejo de conflictos

**Orden de autoridad:** legislación/políticas de plataforma → seguridad y consentimiento → ADR aprobado → contrato publicado → issue/ticket → preferencias del agente. Si dos agentes sugieren cambios incompatibles, no se fusionan diseños por intuición: RFC corto con opciones, trade-offs y decisión humana. Los comentarios de code review no modifican automáticamente la arquitectura.

---

## 17. Reglas persistentes, contexto e instrucciones de repositorio

### 17.1 Fuente de verdad

1. `README.md` = visión y arquitectura general.
2. `docs/adr/*.md` = decisiones aprobadas y justificación.
3. `packages/contracts` = contratos compilables y esquemas.
4. `AGENTS.md` = reglas operativas de todos los agentes.
5. `.cursor/rules/*.mdc` = instrucciones **scoped** para Cursor.
6. `CLAUDE.md`, `.claude/agents`, `.claude/skills` = adaptación de Claude Code.
7. `.devin/README.md` = protocolo de tickets Devin.
8. `Makefile` / scripts = comandos de verdad comprobable.

Evitar copiar secciones enteras en todos los archivos. `AGENTS.md` referencia README y ADR; cada rule contiene solo requisitos específicos. La documentación debe ser corta en contexto y profunda en los archivos de referencia.

### 17.2 Reglas en Cursor

- Formato `.cursor/rules/*.mdc` con `description`, `globs`, `alwaysApply` según documentación actual; no depender de `.cursorrules` legacy.
- `00-global`: arquitectura, consentimiento, cambios y pruebas.
- `10-rust-hexagonal`: imports permitidos, traits, dependencias, errores.
- `20-native-platforms`: integraciones, permisos y compatibilidad.
- `30-ai-and-evals`: inferencia controlada, salidas tipadas, datasets.
- `40-privacy-and-cost`: redacción, presupuestos, no telemetría sensible.
- Skills de este rol: `.cursor/skills/platform-permission-review` y `local-performance-profile`. Agentes: `.cursor/agents/native-client-implementer`, `product-ui-implementer` y `platform-permission-reviewer`. No incluyen dominio, contratos ni CI.

### 17.3 Claude Code

- `CLAUDE.md` en raíz apunta a `AGENTS.md`, al issue activo y a ADR; contenido reducido.
- `.claude/agents/architect.md`: evalúa cumplimiento hexagonal, propone ADR.
- `.claude/agents/security-reviewer.md`: audita permisos, exfiltración y consentimientos.
- `.claude/agents/ml-evaluator.md`: audita calidad de dataset, errores y costos.
- `.claude/skills/*/SKILL.md`: procedimientos específicos reproducibles.
- Hooks opcionales de formato y pruebas **solo** después de verificar sintaxis/configuración; no crear hooks que ejecuten gasto remoto silencioso.

### 17.4 Devin

- Iniciar ticket con rutas permitidas, issue y PR esperado.
- Mantener el contexto de repo en `AGENTS.md`/docs; el agente debe leerlos antes de trabajar.
- Usar PRs y logs de prueba, no acceso de producción ni infraestructura costosa por defecto.
- Tareas ideales: Docker Compose, CI, linters, generación de clients, benchmarks de proveedores en entornos sandbox y reporte.
- Skills: `.devin/skills/api-contract-check`, `ci-performance-profile`, `release-readiness`. Agentes: `.devin/agents/ci-infra-implementer`, `api-contract-checker`, `visual-ci-operator`, `release-checker`.

### 17.5 ChatGPT

- Función de *product architecture desk*: definición, análisis, investigación, checklist y revisión de entregables.
- Para cambios efectivos en GitHub, utilizar integración explícita y acciones autorizadas si están disponibles; de lo contrario, entregar archivos/patches para que el operador aplique.
- No considerar mensajes del chat como código fusionado. Tras decisión aprobada: emitir ADR o issue versionable.
- Skills de Codex: `.agents/skills/product-architecture-review`, `product-cost-audit`, `eval-spec`. Agentes: `.codex/agents/product-architect`, `cost-eval-reviewer`. No implementan crates, apps ni infra.

---

## 18. Skills y agents planificados

| Skill / agente | Entrada | Salida | Responsable |
|---|---|---|---|
| `architecture-review` | PR/ADR/diagramas | dependencias rotas, impacto y plan de reparación | Claude / ChatGPT |
| `privacy-audit` | sensor, eventos y storage | matriz de datos, consentimiento, retención, riesgos | Claude |
| `cost-audit` | rutas de inferencia, logs de usage sintéticos | $/evento, cuota, gastos y mitigaciones | Claude / ChatGPT |
| `threat-eval` | dataset, detector, golden outputs | matriz de confusión, cortes por segmento, errores | Claude ML |
| `platform-permission-review` | implementación Android/iOS/desktop | permisos realmente requeridos y políticas | Cursor + Claude |
| `api-contract-check` | cambios OpenAPI/JSON Schema | diff de compatibilidad y fixtures | Devin |
| `performance-profiler` | build + dispositivo/hardware | memoria/CPU/GPU/batería/token benchmarks | Cursor / Devin |
| `release-readiness` | tag candidato | checklist de firma, CI, disclosures, SBOM | Devin + humano |

Las filas compartidas no se copian enteras. Cursor tiene la mitad de cliente de `performance-profiler` (`local-performance-profile`) y Devin la de CI (`ci-performance-profile`). ChatGPT tiene la revisión de producto (`product-architecture-review`, `product-cost-audit`, `eval-spec`); Claude conserva las skills de código en `.claude/skills/`. El mapa de carpetas está en `AGENTS.md`.

**Protocolo de seguridad de skills:** procedimientos que ayudan a verificar; no otorgar credenciales, permisos de captura o acceso de producción solo porque un agente solicita hacerlo. Los scripts de skills no deben incluir acciones destructivas no aprobadas.

---

## 19. Seguridad, privacidad y cumplimiento

### 19.1 Threat model resumido

Actores: atacante que controla contenido observado, app maliciosa, proveedor comprometido, administrador empresarial curioso, atacante de cuenta, extensión comprometida y usuario no autorizado del equipo. Activos: capturas, mensajes, permisos, evidencias, claves API, tokens, perfiles, reglas e intervenciones.

Riesgos principales: prompt injection indirecto, exfiltración de pantalla, espionaje de terceros, abuso corporativo, rastreo persistente, falso señalamiento, modificación silenciosa de política, supply chain, repeticiones de consentimiento y modelos sesgados.

### 19.2 Controles concretos

- Solicitud granular de permisos; indicadores visibles; revocación y **kill switch**.
- Excluir pantallas seguras y datos de autenticación; sensores sin privilegios elevados por defecto.
- Minimización antes de red, logs y memoria; retención con TTL y borrado verificable cuando proceda.
- Cifrado de datos locales/transportados, gestión de claves mediante Keystore/Keychain/OS facilities.
- AuthN/OAuth2/OIDC según integración, PKCE en clientes, scopes, expiración, refresh seguro.
- Principio de cero confianza para payloads de modelos, plugins, extensiones y fuentes web.
- Firmas de releases, SBOM, escaneo de dependencias, segregación de staging/prod.
- Conjunto de pruebas para permisos revocados, app foreground distinta, pantallas protegidas, sesion detenida y red caída.
- Empresas obtienen únicamente indicadores agregados por defecto; no chats privados ni perfiles de salud o ánimo.

### 19.3 Protección de datos y legislación

- Elaborar DPIA/evaluación de impacto antes de recolectar datos sensibles.
- Para Colombia, revisar Ley 1581 de 2012 y las obligaciones actuales aplicables de la SIC; para Europa, GDPR; para niños y adolescentes, regímenes especiales según país.
- Las bases legales, roles responsable/encargado, transferencias internacionales, finalidades y períodos deben definirse con asesoría jurídica real.
- No asumir que consentimiento de usuario permite registrar conversaciones confidenciales de terceros en cualquier jurisdicción.
- Separación estricta entre consentimiento para **captura**, consentimiento para **nube**, consentimiento para **retención** y consentimiento para **compartir indicadores**.
- Privacy policy y términos deben describir diferencias entre Android/iOS/desktop y fallos de cobertura.

### 19.4 Red team y responsible disclosure

- Pruebas solo en escenarios simulados, dispositivos propios y sistemas autorizados.
- Publicar `SECURITY.md` con canal de reporte, política de divulgación y no publicación de PII.
- No construir automatización para engañar personas reales, dirigir poblaciones, elaborar campañas coercitivas o maximizar conversión usando vulnerabilidades individuales.
- Herramientas de protección **reversibles**, salvo operaciones expresamente irreversibles y autorizadas.

---
## 20. Resource Intelligence: CPU, GPU, RAM, batería y tokens

### 20.1 Estrategia

**Objetivo:** maximizar protección útil con un coste total finito. No maximizar invocaciones LLM ni minimizar gasto a costa de dejar de proteger.

El orquestador evalúa `(risk_severity, uncertainty, novelty, availability, privacy_scope, energy_state, spend_budget, latency_slo)`. La salida es `SKIP_DUPLICATE | LOCAL_RULE | LOCAL_MODEL | REMOTE_REASON | RESEARCH_JOB | USER_REQUESTED_DEEP_ANALYSIS`.

**Ruta habitual:** eventos → reglas locales y caché → memoria temporal → sin API de pago. **Ruta excepcional:** incertidumbre + relevancia → contexto minimizado → modelo remoto bajo cuota → validación por motor local.

### 20.2 Niveles de inferencia

| Nivel | Implementación | Costo remoto | Riesgo/limitación |
|---|---|---|---|
| 0 | Event dedup/delta/hash/DOM | 0 tokens | Cambios semánticos ocultos si hash mal diseñado. |
| 1 | Reglas + OCR local + clasificador ligero | 0 tokens | Precisión/cobertura limitadas; energy cost local. |
| 2 | Graph/context linking local | 0 tokens | Relaciones espurias; necesidad de provenance. |
| 3 | Muse Spark Standard / provider adapter | Tokens con medición real | Datos sensibles y costos de contexto multimodal. |
| 4 | Investigaciones multiherramienta | Tokens + tool calls + búsqueda + GPU | Requiere límite de pasos, gasto y timeouts. |

**HIPÓTESIS DE DISEÑO:** resolver >=95% de observaciones **ordinarias** sin inferencia paga. No afirmar que el sistema tiene 95% de tasa de detección, ni confundir proporción de eventos con proporción de casos relevantes. Registrar la distribución real por tipo de evento.

### 20.3 Gobernador de presupuesto

Requisitos funcionales:

- `BudgetLedger` por tenant, usuario, dispositivo, proveedor, modelo y período.
- Presupuestos `hard` (rechazar), `soft` (avisar, degradar a local), por solicitud, día, mes y *research job*.
- Tokens contados desde respuestas `usage` de proveedor, no estimados únicamente con caracteres.
- Reservar gasto antes de llamada con margen; reconciliar factura y reembolsar reserva no consumida.
- Cuotas ejecutadas **server-side**, claves nunca en binarios cliente ni extensiones.
- Caché de resultados basada en huellas contextualizadas, corta TTL y sin colisiones de tenantes.
- PII/secret scanner antes de proveedor; si redacción no es segura, rechazar salida remota.
- Cortacircuitos y cancelación de retries si se supera presupuesto.
- Telemetría de `input_tokens`, `cached_input_tokens`, `output_tokens`, `image_usage`, `model_latency`, `cost_usd`, `cache_hit`, `inference_level`.

### 20.4 Cálculo económico para Muse Spark 1.3

Tarifas **Standard** publicadas al consultar el 27/10/2026 (ver enlaces al final; revalidar antes de comprar): **USD 1.25 / millón tokens entrada**, **USD 0.15 / millón entrada cacheada**, **USD 4.25 / millón salida**. La modalidad Contributor usa precios menores a cambio de política distinta de utilización de datos; **no utilizar Contributor con datos privados de usuarios** sin evaluación legal, contractual y consentimiento específico.

```text
cost_usd = (uncached_input_tokens / 1e6) * 1.25
         + (cached_input_tokens   / 1e6) * 0.15
         + (output_tokens         / 1e6) * 4.25
         + model_image_audio_video_costs_if_separately_billed
         + external_tool_costs
```

**Ejemplo ilustrativo, NO pronóstico:** 100 llamadas/usuario/mes, 2,000 input tokens + 200 output tokens por llamada, sin caché:

- Ingreso de tokens: 200,000/usuario/mes → USD 0.25.
- Salida de tokens: 20,000/usuario/mes → USD 0.085.
- **Total inferencia de texto: USD 0.335 / usuario / mes**.
- 10,000 usuarios con ese perfil → **USD 3,350 / mes**, **sin** captura multimodal adicional, OCR nube, herramientas, hosting, soporte, impuestos o variaciones de facturación.

No omitir tokens visuales; el esquema de precios, la tokenización de imágenes y los datos reales de `usage` gobiernan el cálculo. No asumir que todos los modelos de Baseten/Fireworks cuestan igual.

### 20.5 Modelo de eficiencia técnica

Objetivos iniciales, sujetos a benchmark por hardware:

- CPU idle <1% promedio en desktop de referencia.
- RAM agente base <150 MB sin modelos residentes; registrar RAM pico con carga inferencial.
- Uso continuo GPU/NPU: **evitarlo** en modo pasivo; asignar lotes de baja latencia solo cuando convenga.
- Batería: evaluar mWh/h con/ sin agente para escenarios idle/pasivo/activo; nunca prometer «cero impacto».
- Latencia de alerta local a partir de señal estructurada: P95 objetivo <250ms en hardware de prueba definido.
- Medir *false negative under load*: el ahorro no puede descartar los eventos de severidad alta.

### 20.6 Guardrails de costo y performance

- Budget tests: 1,000 eventos duplicados ⇒ 0 llamadas de pago; timeout remoto ⇒ retry máximo definido; gasto agotado ⇒ no inferencia costosa, reglas locales continúan.
- Perfil de GPU/RAM sobre hardware **mínimo**, **medio** y **alto**; compatibilidad por versión OS registrada.
- Revisión semanal de costos de API y energía/1000 eventos representativos.
- Alertas de gasto al 50/80/100% del cupo, con congelamiento de jobs no esenciales.

---

## 21. Sponsors y créditos del hackathon

### 21.1 Meta Global AI Developer Hackathon 2026 (evidencia oficial)

- Inicio: **26 de octubre de 2026**.
- Workshops: 27 octubre–4 noviembre.
- Entrega: **4 de noviembre de 2026, 9:00 p. m. ET** (validar hora local contra horario vigente). Finales: 9 noviembre.
- Indie: individual y estudiantes, juzgado por creatividad, ambición técnica y funcionamiento. Startup: ejecución técnica y robustez.
- Temas: *Build for Your World* y *Push the Frontier*.
- Tecnologías promocionadas: Muse Spark, Muse Image, SAM 3.1, modelos Meta open weights, Muse Code; verificar acceso de cada modelo en la cuenta del evento.

**Precisión sobre fondos:** el usuario informa disponer de **USD 150 en tokens de Meta**; este documento lo registra como **crédito por confirmar en panel/email personal**. No he encontrado una declaración pública que garantice automáticamente USD 150 para cada participante. Los créditos de Baseten, Modal y Fireworks se ofrecen a **participantes seleccionados**, no a toda cuenta.

### 21.2 Baseten

**Qué hace:** plataforma gestionada de inferencia eficiente para modelos abiertos, custom y fine-tuned; APIs optimizadas y deployments dedicados.

**Oferta del evento:** **USD 100** y 2M TPM para participantes seleccionados, sujeto a activación/términos.

**Uso en SOVIR:** benchmark de un clasificador visual/semántico abierto especializado, embeddings/reranking o pequeño VLM; evaluar latencia, costo, exactitud y privacidad frente a local/Meta. **No** usar Baseten como base de datos, sistema de permisos ni predictor de riesgo sin pruebas.

**Criterio de adopción:** inferencia especializada significativamente mejor que alternativa local/otro proveedor **y** costo total sostenible. Deploy con adapter `InferenceGateway`, no lógica de negocio propia.

### 21.3 Modal

**Qué hace:** infraestructura de ejecución Python y GPUs/serverless bajo demanda; endpoints, sandbox, jobs de cómputo/entrenamiento.

**Oferta del evento:** **USD 100** para participantes seleccionados.

**Uso en SOVIR:** batch OCR/video/frames de prueba, generación sintética autorizada, evaluación de modelos, jobs de entrenamiento y análisis de dataset. **Ideal para compute episódico**, no para capturar permanentemente pantallas de usuarios.

**Criterio de adopción:** facilita experimentos con uso de GPU delimitado; si una función requiere GPU disponible 24/7, calcular ociosidad/cold start y alternativas antes de aprobar.

### 21.4 Fireworks AI

**Qué hace:** inferencia serverless/deployments de modelos, opciones de entrenamiento, embeddings y modelos multimodales según catálogo.

**Oferta del evento:** **USD 25** para participantes seleccionados.

**Uso en SOVIR:** un tercer benchmark independiente de modelo open-weights y rendimiento de la misma tarea; fallback bajo política de datos verificada.

**Criterio de adopción:** escoger en función de `quality/$`, privacidad, latencia y tasa de error; no desplegar redundancia por mero hecho de tener crédito.

### 21.5 Meta Model API

**Uso principal:** `muse-spark-1.3` **Standard**, para razonamiento multimodal y agentes de investigación minimizada; cache, herramientas con allowlist y JSON estructurado.

- Versionar prompts y esquemas.
- Registrar precisión/errores/costo real de `usage`.
- No utilizar `Contributor` con conversación/capturas privadas sin la política aplicable adecuada.
- Documentación indica que audio de Muse Spark 1.3 presenta limitaciones; considerar transcripción adecuada para fuentes permitidas y pruebas explícitas.
- SAM 3.1 puede servir para segmentación si un caso visual realmente la requiere; **no** enviar miles de frames a segmentar por rutina ni usarlo solo por cumplir branding.

### 21.6 Plan de gasto inicial (hipótesis, no factura)

| Fondo | Reserva propuesta | Experimento previsto | Gate |
|---|---:|---|---|
| Meta USD 150 condicional | USD 70 | razonamiento y contrato tipado | precisión + seguridad |
| Meta USD 150 condicional | USD 35 | eval multimodal comparativo | mejora sobre baseline |
| Meta USD 150 condicional | USD 25 | demo / investigación documentada | latencia/costo |
| Meta USD 150 condicional | USD 20 | colchón de reintentos/validación | no superar total |
| Baseten USD 100 condicional | USD 60 | benchmark open weights | métricas frente Meta/local |
| Baseten USD 100 condicional | USD 40 | pruebas de carga acotadas | costo/latencia |
| Modal USD 100 condicional | USD 75 | dataset/jobs GPU | costo reproducible |
| Modal USD 100 condicional | USD 25 | contingencia benchmark | cola/timeout |
| Fireworks USD 25 condicional | USD 25 | benchmark proveedor adicional | privacidad + comparables |

**Nunca** activar los cuatro créditos en un mismo flujo de producción sin demostrar la necesidad. Establecer hard caps y supervisar los saldos desde panel de cada sponsor. Los beneficios no necesariamente son transferibles, acumulables o aptos para cualquier modelo; validar términos.

---

## 22. Scaffold, comandos y guía de primeros commits

### 22.1 No confundir scaffold con producto

Este paquete contiene el documento, reglas, templates y pruebas administrativas. **Los directorios de apps/core están preparados, pero la implementación debe generarse con toolchains y versiones verificadas en la máquina de trabajo.** Evitar lockfiles y SDKs inventados.

### 22.2 Primera secuencia de bootstrap

```bash
# Extraer zip y crear repositorio propio
unzip sovir-starter.zip -d .
cd sovir_starter  # según carpeta resultante

git init
git add .
git commit -m "docs: architecture charter and agent governance"

# El harness tiene dependencias Python estándar
python3 scripts/harness.py doctor
python3 scripts/harness.py check
python3 scripts/harness.py eval

# Backend Rust / API local: workspace Cargo ya inicializado.
# Instalar Rust estable y ejecutar `make backend-check`.
# Luego: inicializar pnpm, Android, iOS, Tauri, extensión y consola por tickets/PRs.
```

### 22.3 Comandos de raíz y su semántica

- `make doctor`: reporta presencia de toolchains reales.
- `make check`: revisa contratos documentales y política básica; complementará cargo/pnpm en la implementación.
- `make verify-architecture`: restricciones de estructura y archivos de control.
- `make eval`: evals sintéticas con resultado determinista.
- `make test`: `check + eval`, no finge Android/iOS funcionando.
- `make benchmark`: se niega a realizar llamadas pagas sin configuración explícita.

### 22.4 Primeras ADRs a formalizar

`ADR-0001` límites hexagonales; `ADR-0002` FFI Rust–Swift/Kotlin; `ADR-0003` consentimiento multiplataforma; `ADR-0004` priorización de eventos; `ADR-0005` proveedor y facturación de inferencia; `ADR-0006` almacenamiento local cifrado; `ADR-0007` licenciamiento y propiedad intelectual.

### 22.5 Convención de commits

Conventional Commits (`feat`, `fix`, `perf`, `security`, `refactor`, `docs`, `test`, `chore`), issue/ticket en cuerpo, commits firmados cuando esté habilitado. Nada de commits que mezclen cambio masivo de formato con cambio de lógica; evitar force-push a ramas compartidas.

---

## 23. Hitos y orden de implementación

**Filosofía:** no se recorta la visión por calendario; cada hito entrega una capacidad completa y medible. El hackathon es la primera demostración integrada, no el límite de producto. El orden refleja dependencias lógicas y seguridad.

### H0. Product foundation

- Naming provisional, marca/licencias, backlog, principios y ADRs.
- Monorepo, GitHub branch protection, harness, toolchains verificadas.
- Diseño de contrato de eventos + consentimiento + políticas.
- **Aceptación:** repositorio reproducible; tests base y modelado de riesgo aprobados.

### H1. Core & Privacy Gateway

- Rust domain/application/ports, modelo evento, grant, evaluación determinista.
- Persistencia local cifrada y revocación.
- **Aceptación:** app sin grant produce 0 ObservedEvents; auditabilidad básica.

### H2. Screen Seeker (mobile + desktop)

- Android, iOS, Windows, macOS, Linux adapters por capacidades reales.
- API de observación event-driven, selector de fuentes y exclusiones.
- **Aceptación:** por plataforma, grabación autorizada + parada inmediata + medición de consumo; compatibilidad documentada.

### H3. Semantic Delta + local engine

- DOM/UI tree, OCR selectivo, hash contextual, detector local de solicitudes sensibles.
- **Aceptación:** duplicados no generan inferencias; cambios materiales sí; benchmarks CPU/RAM/energía.

### H4. Temporal Evidence & Reasoning

- Linking de eventos con evidencia y fuentes; memoria incremental; hipótesis separadas de hechos.
- Meta Muse Spark Standard con provider adapter y JSON validation.
- **Aceptación:** correlación entre fuentes verificable y no-correlación justificada en casos ambiguos.

### H5. Autonomy Center & Intervention

- Políticas, niveles observador/equilibrado/reforzado, explicaciones, anulación, estado del sistema.
- **Aceptación:** modo/permiso cambia en caliente; aviso contextual comprobable; no bloqueo fuera de alcance.

### H6. Specialized domains

- FraudShield / MarketShield / MindGuard / PrivacyShield / RelationshipGuard / Influence Intelligence, como **packs de capacidades** sobre un core común.
- **Aceptación:** cada pack aporta al menos suite de casos legítimos/ambiguos/perjudiciales y mejora basada en datos.

### H7. Adaptive Prediction & Cost Engine

- Estados de secuencia, incertidumbre calibrada, evaluaciones temporales, optimización del scheduler.
- **Aceptación:** mejora verificable sobre baseline de evento aislado; tasa de falsas alarmas dentro de objetivo documentado; costo controlado.

### H8. Collective Intelligence, Sync & SDK

- Sincronización cifrada opt-in, indicadores agregados de campañas, Enterprise API y SDK.
- **Aceptación:** pruebas multi-tenant, disociación de datos y borrado/verificación.

### H9. Hardening & commercialization

- Pentest, privacidad/cumplimiento, tiendas, documentación, pagos, soporte, pilotos B2B/B2C.
- **Aceptación:** releases firmados, DPA/políticas si proceden, SLOs y resultado medido de pilotos.

### 23.1 Vertical slice para demo del hackathon (sin rebajar la arquitectura)

Demostrar el **primer recorrido completo**, no mockear toda la plataforma:

`captura consentida en al menos dos superficies soportadas → eventos estructurados → grafo contextual → análisis con Muse Spark → intervención explicable → panel de evidencia/costo.`

Construir escenarios sintéticos de anuncio financiero, conversación progresiva, patrón comercial y rastreo. Una demo debe distinguir componente real de simulación; lo no implementado debe etiquetarse.

Criterios de presentación: creatividad, ambición técnica y funcionamiento real en Indie; mostrar arquitectura y resultados cuantificados sin prometer que cinco sistemas operativos ya pasaron pruebas si no ocurrió.

---

## 24. Matriz de aceptación de plataforma y producto

| Capacidad | Android | iOS | Windows | macOS | Linux | Browser |
|---|---|---|---|---|---|---|
| Sesión de captura consentida | API disponible | API disponible en versiones compatibles | API disponible | API disponible | Portal/compositor dependiente | Captura de tab con consentimiento específico según API |
| Lectura UI semántica | Parcial/condicionada | No generalizable a otras apps | UI Automation | Accessibility | AT-SPI variable | DOM de orígenes autorizados |
| Detección de cambios | eventos/snapshots | frame metadata/processing | dirty regions | frame cadence/filter | compositor/frames | mutation observers + eventos |
| Filtrado por aplicación | política local + selector de captura | picker + capacidades OS | ventana/proceso permitidos | filtros ScreenCaptureKit | picker de portal | permisos por origen |
| Análisis correo/chat | solo fuentes permitidas | solo fuentes permitidas | UI/conectores según permisos | UI/conectores | UI/conectores | contenido visible en sitios con host grant |
| Bloquear tracker web | con extensión/VPN legítimo según plataforma | APIs específicas, no universal | extensión browser | extensión browser | extensión browser | `declarativeNetRequest` y afines |
| FFI núcleo Rust | objetivo: UniFFI/JNI | objetivo: UniFFI/Swift | Rust native | Rust native | Rust native | native messaging/backend; WASM según caso |
| Certificación funcional | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente |

**Importante:** «API disponible» no equivale a «implementado», «aceptado por tienda» o «captura en segundo plano ilimitada».

### 24.1 Matriz de dispositivos de referencia (a completar)

Registrar OS/build, CPU, RAM, GPU/NPU, batería, permisos concedidos, modo de captura, resolución, duración de sesión, eventos procesados, temperatura, energía consumida, FP/FN. *No rellenar tablas con números inventados.*

### 24.2 Prueba de intervención

- Evento benigno: sin aviso o aviso calibrado.
- Evento con riesgo fuerte: señal antes de la acción sensible.
- Evidencia insuficiente: declarar incertidumbre, no acusación.
- Revocación: capturas detenidas; tareas externas canceladas cuando sea posible.
- Fuente excluida: ninguna observación/persistencia de su contenido.

---

## 25. Estrategia de investigación de mercado y validación empresarial

### 25.1 Diferenciales reales a probar

1. Interacciones multi-superficie frente a detectores por canal.
2. Motivos auditables y vínculos de evidencia, no etiquetas opacas.
3. Intervención con mínima interrupción y controles personales.
4. Modelo resource-aware medido, no solo marketing de «IA eficiente».
5. Privacidad por arquitectura local-first y no venta de perfiles.

**Competidores a examinar** antes de afirmar superioridad: Google Scam Detection/Android, Norton Scam Protection, protecciones de navegadores, Brave/uBlock en rastreo, apps de bienestar digital, plataformas empresariales antifraude/antiextorsión, herramientas BEC y detectores de dark patterns. Elaborar tabla de capacidades probadas con fuentes recientes.

### 25.2 Investigación con clientes

- 10–20 entrevistas exploratorias por segmento prioritario; registrar evidencia, no solo opiniones positivas.
- Test de permiso y confianza: porcentajes que aceptan captura, por fuente, tras ver explicación veraz.
- Benchmark de fricción: tiempo para resolver escenario sin/ con SOVIR, errores, sensibilidad de alertas.
- Pilotos de dispositivo propios y empresas consentidoras con DPA y métricas preacordadas.
- B2B: mapear comprador económico, champion técnico, seguridad/legal, distribución y ciclo de compra.

### 25.3 Precios experimentales (**no ofertas actuales**)

No fijar precios finales en el README sin investigación. Ensayar 2–3 planes de disposición a pagar, cost-plus y value-based; comparar CAC/LTV/churn y coste de soporte. Las cuotas de API/usuario deben publicarse de forma clara y no degradar protecciones locales esenciales al agotar tokens.

### 25.4 KPIs comerciales

- Usuarios protegidos activos (con consentimiento válido).
- Activaciones exitosas por OS; conversión permiso vs explicación.
- Riesgos corroborados y acciones protectoras antes del daño (con metodología de causalidad prudente).
- Alertas relevantes por 1,000 sesiones y falsas alarmas.
- Margen de contribución por cuenta y coste cloud/1,000 eventos.
- Pilotos pagados, retención, soporte/1,000 usuarios, bloqueos aceptados/revertidos.

---

## 26. Riesgos abiertos y decisiones pendientes

| Tema | Riesgo | Próxima decisión/experimento |
|---|---|---|
| Marca SOVIR | Conflicto fonético/registro/domain/app stores | Búsqueda formal marcaria y alternativas. |
| Captura móvil de fondo | Política OS/store y duración | Spikes en Android+iOS reales, con consentimiento. |
| OCR y frame diff | Coste batería o capturas innecesarias | Bench 3 perfiles hardware/modos. |
| Detección de bienestar | Sobreinterpretar emociones y causar daño | Limitar a mecánicas observables y preferencias explícitas. |
| Evidencia multiapp | Falsas relaciones entre personas | Tests precision de linking + política de abstención. |
| LLMs proveedores | Filtración, latencia, cambio precio/retención | Política Standard + adapters + kill switches. |
| Derecho de terceros | Captura conversaciones, menores, empleo | Evaluación legal, default-off y exclusión de escenarios. |
| Permisos de accesibilidad | Rechazo de tienda | Revisión de políticas y rutas de distribución permitidas. |
| Sponsor credits | Beneficio selectivo o expiración | Confirmación en dashboard/email por proveedor. |
| Competencia | Soluciones nativas de Android mejoran | Benchmark honesto y posición comercial defensible. |
| Ingeniería social a escala | Riesgo de vigilancia o manipulación | Salvaguardias de consentimiento, anonimización y auditorías. |
| Escala del monorepo | Toolchains y CI costosos | Builds path-filtered y owners por directorio. |

### 26.1 Criterios de NO-GO para funcionalidades

Una funcionalidad queda **bloqueada** si requiere captar contenido sin autorización, evadir protecciones OS, vender perfiles psicológicos, atribuir falsamente delitos, ejecutar decisiones irreversibles por una salida LLM no validada o no permite un mínimo de revocación / auditoría proporcional a su riesgo.

### 26.2 Criterios de Go/No-Go del proyecto

**Go** si el núcleo puede operar con permisos válidos en al menos dos superficies y mostrar reducción de exposición/errores en datos evaluados, con gasto y energía medibles. **Replantear** sensores o UX si permisos hacen inviable la distribución. **Replantear** claim predictivo si no mejora baseline con evidencia suficiente. No interpretar fallos de una plataforma como razón para abandonar toda la visión; sí reconocer límites comercialmente.

---

## 27. Fuentes y referencias

**Consulta inicial:** 27 de octubre de 2026. Los links documentan capacidades y ofertas vigentes durante la investigación, pero **deben revalidarse** en fecha de implementación, contratación y lanzamiento. Los precios son sujetos a cambio.

### Hackathon y sponsors

1. Meta, [Global AI Developer Hackathon](https://dev.meta.ai/events/global-hackathon) — tracks, temas, criterios y fechas.
2. Cerebral Valley, [Meta Global AI Developer Hackathon](https://events.cerebralvalley.ai/e/meta-ai-developer-hackathon) — Baseten USD 100, Modal USD 100 y Fireworks USD 25 **a participantes seleccionados**.
3. Meta, [Muse Spark 1.3 / Meta Model API](https://dev.meta.ai/models/muse-spark) — modelos y costos Standard/Contributor.
4. Meta, [Model API docs](https://dev.meta.ai/docs/overview) — SDK compatible y endpoints; revalidar auth, disponibilidad y rate limits.
5. Meta, [Model API models](https://dev.meta.ai/docs/models) — modalidades, contextos y limitación audio Muse Spark 1.3.
6. [Baseten](https://www.baseten.co/) — inferencia y modelos personalizados.
7. [Modal](https://modal.com/) — compute serverless, GPU y jobs.
8. [Fireworks AI Docs](https://docs.fireworks.ai/getting-started/introduction) — inferencia, entrenamiento y administración.

### Platform APIs y políticas

9. Android, [MediaProjection](https://developer.android.com/media/grow/media-projection) — consentimiento por sesión y límites.
10. Android, [Google Play AccessibilityService policy](https://support.google.com/googleplay/android-developer/answer/10964491) — disclosures y restricciones; validar antes de store.
11. Apple, [ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit) — captura soportada y picker.
12. Apple, [Capturing screen content on iOS](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-on-ios) — ejemplo iOS 27+.
13. Microsoft, [Windows.Graphics.Capture](https://learn.microsoft.com/en-us/windows/uwp/audio-video-camera/screen-capture) — captura en Windows.
14. Microsoft, [UI Automation](https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/ui-automation-overview) — UI estructurada.
15. Freedesktop, [ScreenCast portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.ScreenCast.html) — Linux/Wayland.
16. Chrome Developers, [Extension permissions](https://developer.chrome.com/docs/extensions/mv3/declare_permissions) — hosts y permisos opcionales.
17. Chrome Developers, [declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) — reglas de solicitudes.

### Procesos, seguridad y colaboración con agentes

18. IBM, [CRISP-DM](https://www.ibm.com/docs/en/spss-modeler/18.6.0?topic=dm-crisp-help-overview) — ciclo de datos y modelado.
19. OWASP, [Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/) — prompt injection, información sensible, supply chain.
20. NIST, [AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) — gobernanza de riesgos de IA.
21. Cursor, [Rules](https://cursor.com/docs/rules) — `.cursor/rules/*.mdc` y `AGENTS.md`.
22. Claude Code, [Project memory and CLAUDE.md](https://code.claude.com/docs/en/memory).
23. Claude Code, [Subagents](https://code.claude.com/docs/en/sub-agents) y [Skills](https://code.claude.com/docs/en/skills).
24. Devin, [Documentation](https://docs.devin.ai/) — GitHub/PRs/instrucciones.

### Principios de investigación

Las referencias de mercado (fraude, dark patterns, salud digital, créditos coactivos) se expandirán en `docs/product/evidence-register.md`, incluyendo año, jurisdicción, población y limitaciones. **No utilizar cifras de distintos organismos como si fueran sumables ni extrapolar pérdidas nacionales a ventas globales.**

---

## Apéndice A. Glosario

- **Screen Seeker:** sistema de sensores autorizados que observa cambios relevantes del entorno digital; no espía indiscriminadamente.
- **Semantic Delta:** diferencia informativa entre observaciones, que reduce trabajo redundante.
- **Evidence Graph:** grafo de hechos, hipótesis y enlaces con procedencia.
- **Autonomy Policy:** preferencia y regla legítima que limita acción/intervención.
- **Inference Gateway:** puerto abstracto de modelos locales/remotos.
- **Resource Intelligence:** control de presupuesto de cómputo, latencia, batería y API.
- **Token Governor:** límites de inferencia y conciliación de uso facturado.
- **CRISP-DM:** metodología de ciclo de vida de ciencia de datos (no CRISPR).
- **TDD / XP:** desarrollo guiado por pruebas / Extreme Programming.
- **Hexagonal:** lógica de negocio independiente de infraestructura mediante puertos/adaptadores.
- **Harness:** pruebas, fixtures, contratos, benchmarks y gates reproducibles.
- **Golden dataset:** casos de referencia con ground truth y controles de leakage.
- **Consent Grant:** autorización concreta, revocable, con fuente/propósito/vigencia.
- **SOVIR:** nombre provisional del producto y del monorepo, sujeto a clearance jurídico.

## Apéndice B. Primeras tareas ejecutables por herramienta

| Ticket | Responsable | Entregable verificable |
|---|---|---|
| SOV-001 | Claude | crates domain/ports con `ObservedEvent`, `ConsentGrant`, tests unitarios. |
| SOV-002 | Cursor | mock UX de permisos Android + una captura autorizada real con logs redaccionados. |
| SOV-003 | Devin | CI path-aware, build Rust/TS, `make check`, PR template. |
| SOV-004 | ChatGPT + humano | ADR-0001..0004 revisados y 15 fixtures adversariales/benignos. |
| SOV-005 | Claude | InferenceGateway con provider fake determinista y presupuesto. |
| SOV-006 | Cursor | prototipo Tauri con fuente DOM/browser y panel de eventos. |
| SOV-007 | Devin | adapter Meta en job de prueba con hard cap y métricas `usage`, sin contenido privado. |
| SOV-008 | Claude + ChatGPT | evaluación temporal baseline vs grafo, métrica costo y abstención. |

**Condición de trabajo:** los demás agentes no alteran archivos de otro ticket sin abrir issue de interfaz o pedir un cambio de contrato. `main` integra resultados verificados, no opiniones.

---

**SOVIR — infraestructura protectora diseñada para que cada persona conserve el control de su vida digital.**

---

## 28. Frontend Experience Architecture — Marca, Figma y expresiones nativas (nuevo)

**DECISIÓN PROPUESTA; identidad pendiente de aprobación humana.** SOVIR tiene una marca y un núcleo técnico, pero **no** una UI clonada en todos los sistemas. La capa de presentación es un adaptador hexagonal: ningún componente React/SwiftUI/Compose decide la lógica de riesgo ni permisos reales del OS. Diseño y frontend tienen el mismo rigor que backend: diseño versionado, contratos, QA, accesibilidad, rendimiento y ownership.

**Superficies:** `apps/website` marketing público (`www`, landing, marca, plataformas, privacidad, precios sin inventar, descarga, enterprise, login); `apps/console` app web con autenticación (`app`); `apps/extension` popup/side panel/options; `apps/ios` SwiftUI; `apps/android` Compose; `apps/desktop` Tauri/React con expresiones y adaptadores Windows, macOS y Linux GNOME/KDE. Shell de escritorio compartido, patrones nativos diferenciados y feature flags por capacidades, jamás fingir permisos del sistema.

**Sistema visual:** `Brand → Semantic Tokens → Platform Expressions → Feature Patterns → Screens`. Tres rutas exploratorias (Mineral, Cartográfica, Editorial) esperan votación humana de marca, paleta, logo, tipografía y voz. Tokens programáticos se congelan mediante ADR; colores de alertas no dependen de marca. Archivo Figma de biblioteca y otro de experiencias (o páginas equivalentes), con capas editables, variables, auto-layout, componentes, estados y prototipos. Conectar con Code Connect sólo si acceso/licencia lo habilita; como fallback, manifest de node IDs reales y mapeo manual.

**Trabajo multiagente:** humano aprueba marca y releases; ChatGPT desarrolla arquitectura y specs; Claude audita contratos/tokens; Cursor implementa UI por plataforma; Devin mantiene CI visual/accesibilidad; Figma es herramienta de composición/handoff. Ramas cortas por feature, no ramas permanentes `frontend` ni por OS. Cualquier pantalla requiere referencia y estado Figma, copy, pruebas de estados, a11y y evidencia visual.

**Gates de diseño:** WCAG 2.2 AA para web; test nativo VoiceOver/TalkBack/Narrator/AT-SPI; keyboard/reduced motion/contraste; screenshots en diferentes tamaños; rutas error/offline/no-permission; no pantallas llenas de tarjetas ornamentales, dashboards con datos falsos, gradientes SaaS genéricos, dark patterns ni falsas promesas de cobertura. Marketing y producto operativo tienen distinta densidad y función. Usuarios pueden comprender y revocar permisos.

**Documentos operativos:**
- `docs/design/FRONTEND_MASTER_PLAN.md` — IA, stacks, layouts, UX y guidelines específicas por SO.
- `docs/design/BRAND_DECISION_WORKSHOP.md` — decisiones conjuntas de marca, paleta, logo y tipografías.
- `docs/design/FIGMA_WORKFLOW.md` — biblioteca, pantallas, estructuras y handoff.
- `docs/design/FRONTEND_GOVERNANCE.md` — roles, ramas, QA, privacy/security de interfaz.
- `docs/design/REVIEW_SCORECARD.md` — puertas de calidad y severidad.
- `docs/adr/ADR-0003-*` y `ADR-0004-*` — decisiones propuestas a aprobar.
- `.cursor/rules/50-*`, `51-*`, `.claude/agents/design-*`, `.claude/skills/figma-handoff`, `ui-quality-audit`, `brand-consensus`.
- `design/figma/screen-manifest.json` y `packages/design-system/*` — fuentes de verdad pendientes de Figma y cierre de marca.
- `scripts/design_harness.py` — validación de consistencia mínima de scaffold y tokens; no sustituye tests E2E.

**Nota de Figma:** se comprobó que la cuenta conectada tiene múltiples teams y asiento `View`. No se ha creado un archivo ni se han generado node IDs de Figma: se requiere elegir equipo y verificar permisos de edición antes de construir allí. El kit técnico/design y planes están listos offline para llevarlos a Figma.



## Backend implementation scaffold (v0.1)

The repo now includes a **real Rust Cargo workspace** under `crates/` and a local
Axum development API at `services/api/`. For boundaries, tested behaviors,
security caveats, providers, milestones, and environment bootstrap, see:

- [`docs/backend/BACKEND_MASTER_PLAN.md`](docs/backend/BACKEND_MASTER_PLAN.md)
- [`docs/operations/BACKEND_BOOTSTRAP.md`](docs/operations/BACKEND_BOOTSTRAP.md)
- [`docs/adr/ADR-0005-backend-loopback-first.md`](docs/adr/ADR-0005-backend-loopback-first.md)
- [`packages/contracts/openapi/backend-dev.v0.yaml`](packages/contracts/openapi/backend-dev.v0.yaml)

Run `make backend-check` after installing Rust, and `make backend-run` with a
random 24+ character `SOVIR_API_DEV_TOKEN`. No external model calls are enabled.
**Not production ready:** in-memory event/consent storage, development bearer
key, no real tenants, no Postgres adapter, no actual OS watchers or remote model
providers. These are deliberate and explicit, not disguised as complete features.
