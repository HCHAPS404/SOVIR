package app.sovir.android.model

data class Block(val heading: String, val body: String)

data class Sheet(
    val id: String,
    val label: String,
    val title: String,
    val lede: String,
    val note: String,
    val rows: List<Pair<String, String>>,
    val blocks: List<Block>,
    val actionLabel: String? = null,
    val actionId: String? = null,
)

object Sheets {
    val protections = Sheet(
        "protecciones",
        "Protecciones",
        "Protecciones",
        "La captura prevista es de esta sesión y se puede revocar antes de pedirla al sistema.",
        "El botón no abre el diálogo del sistema.",
        listOf("Esta sesión" to "No concedida", "Otras apps" to "No se leen", "Pantallas seguras" to "No se evaden"),
        listOf(
            Block("Alcance", "Solo fuentes que la persona elija, durante la sesión, con pausa y revocación visibles."),
            Block("Límite", "No hay un sensor publicado. Esta pantalla explica el alcance, no lo activa."),
        ),
        "Ir a permisos",
        "permisos",
    )
    val incidents = Sheet(
        "incidentes",
        "Incidentes",
        "Incidentes",
        "No hay observaciones. Eso no significa protección activa.",
        "Un fixture sintético no es una detección validada.",
        listOf("Observados" to "0", "Inferidos" to "0", "Desconocidos" to "0"),
        emptyList(),
        "Abrir investigación",
        "investigacion",
    )
    val incidentsReview = incidents.copy(
        lede = "Fixture sintético en revisión. No es una detección validada.",
        rows = listOf("Fuente" to "Página de prueba", "Verificación externa" to "No ejecutada"),
        blocks = listOf(
            Block("Observado", "Una página de prueba pide un código de un solo uso y un cambio de cuenta."),
            Block("Inferido, no verificado", "Podría ser una suplantación. No hay fuente independiente en este fixture."),
            Block("Desconocido", "La identidad del remitente no está corroborada."),
        ),
    )
    val research = Sheet(
        "investigacion",
        "Investigación",
        "Investigación",
        "No hay una investigación en curso. El costo remoto de esta demostración es cero.",
        "Hecho, hipótesis y verificación externa se mantienen separados.",
        listOf("Estado" to "Sin cola", "Costo remoto" to "0", "Fuentes citadas" to "Ninguna"),
        listOf(Block("Pasos previstos", "Evento, hipótesis y verificación. La verificación externa no se ejecuta aquí.")),
        "Volver a incidentes",
        "incidentes",
    )
    fun devices(here: String) = Sheet(
        "dispositivos",
        "Dispositivos",
        "Dispositivos",
        "Ningún sistema tiene un sensor certificado.",
        "La ausencia de un dispositivo no es protección.",
        listOf(here to "App presente, sin sensor", "El otro teléfono" to "Sin enlace", "Escritorio" to "Ventana, sin captura"),
        listOf(Block("Matriz", "Esta aplicación está en el teléfono. No observa la pantalla. El escritorio tampoco captura.")),
        "Ver permisos",
        "permisos",
    )
    val permissions = Sheet(
        "permisos",
        "Permisos",
        "Permisos",
        "Pausa y revocación se explican aquí. El diálogo lo muestra el sistema.",
        "Estos controles no conceden el permiso de captura.",
        listOf("Captura" to "Sin permiso", "Pausa" to "Solo dibujada", "Revocación" to "Nada que revocar"),
        listOf(Block("Sistema", "El diálogo de Android o el selector de iOS no está imitado en esta pantalla.")),
        "Volver al inicio",
        "inicio",
    )
    val resources = Sheet(
        "recursos",
        "Recursos",
        "Recursos",
        "No hay medición de batería ni de gasto.",
        "Inferencias de pago en esta sesión: 0.",
        listOf("Inferencias de pago" to "0", "Inferencias locales" to "No medidas", "Batería" to "Sin medición"),
        listOf(Block("Límite", "No hay un presupuesto remoto. El costo que se puede afirmar es cero.")),
        "Ver facturación",
        "facturacion",
    )
    val policies = Sheet(
        "politicas",
        "Políticas",
        "Políticas",
        "No hay una política empresarial firmada. Esta vista no vigila personas.",
        "Sin chats privados ni perfiles de ánimo.",
        listOf("Política" to "No firmada", "Personas identificadas" to "No", "Ánimo" to "No se perfila"),
        listOf(Block("Límite", "Una organización futura vería agregados con umbral, no el contenido de una persona.")),
        "Ver agregados",
        "agregados",
    )
    val aggregates = Sheet(
        "agregados",
        "Agregados",
        "Agregados",
        "No hay indicadores de una organización. Vacío no es vigilancia.",
        "Un agregado futuro tendría umbral de privacidad.",
        listOf("Indicadores" to "Ninguno", "Umbral" to "No definido", "Personas" to "No listadas"),
        listOf(Block("Qué no se muestra", "No hay nombres, mensajes ni un ranking de personas.")),
        "Ver integraciones",
        "integraciones",
    )
    val integrations = Sheet(
        "integraciones",
        "Integraciones",
        "Integraciones",
        "No hay conectores activos.",
        "Ningún sistema está certificado.",
        listOf("Conectores" to "0", "Proveedores" to "No configurados", "Webhooks" to "No"),
        listOf(Block("Estado", "No hay una clave de integración, ni un directorio, ni un conector de correo.")),
        "Ver auditoría",
        "auditoria",
    )
    val audit = Sheet(
        "auditoria",
        "Auditoría",
        "Auditoría",
        "No hay una bitácora exportable.",
        "Esta aplicación no conserva un registro de acciones.",
        listOf("Eventos" to "0", "Exportación" to "No", "Retención" to "No hay bitácora"),
        listOf(Block("Qué faltaría", "Actor, acción, objeto y fecha. Hoy no hay filas porque no hay acciones reales.")),
        "Ver facturación",
        "facturacion",
    )
    val billing = Sheet(
        "facturacion",
        "Facturación",
        "Facturación",
        "No hay precios ni factura. El gasto remoto de esta sesión es cero.",
        "No se muestra un plan ni un botón de pago.",
        listOf("Importe" to "No publicado", "Plan" to "No ofrecido", "Inferencias de pago" to "0"),
        listOf(Block("Sitio público", "La página de precios del sitio también dice que no hay cifras.")),
        "Volver al inicio",
        "inicio",
    )
    val account = Sheet(
        "cuenta",
        "Cuenta",
        "Cuenta",
        "No hay una cuenta real. Esta vista no guarda capturas ni conversaciones.",
        "La sesión de demostración no es una identidad.",
        listOf("Sesión" to "Demostración", "Correo" to "No pedido", "Capturas enviadas" to "Ninguna"),
        listOf(Block("Separación", "El sitio público no inicia esta sesión.")),
        "Abrir ajustes",
        "ajustes",
    )
    val settings = Sheet(
        "ajustes",
        "Ajustes",
        "Ajustes",
        "Preferencias de este teléfono. No se escriben en un servidor.",
        "No hay notificación push ni una clave que cambiar.",
        listOf("Idioma" to "es", "Retención" to "Solo local", "Telemetría" to "No hay"),
        emptyList(),
        "Volver a la cuenta",
        "cuenta",
    )

    val work = listOf(protections, incidents, research)
    val org = listOf(policies, aggregates, integrations, audit, billing)

    fun find(id: String, here: String): Sheet? = when (id) {
        "dispositivos" -> devices(here)
        else -> (work + org + listOf(permissions, resources, account, settings)).firstOrNull { it.id == id }
    }
}
