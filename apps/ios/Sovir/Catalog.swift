import SwiftUI

enum MobileRoute: Hashable {
    case sheet(String)
    case connections
}

struct IndexRow: Identifiable {
    let id: String
    let label: String
    var value: String {
        switch id {
        case "protecciones", "permisos": return "Sin permiso"
        case "incidentes", "investigacion", "notificaciones": return "Vacío"
        case "dispositivos", "conexiones": return "Sin enlace"
        case "recursos", "facturacion": return "Cero"
        case "widgets": return "No anclado"
        default: return "Sin datos"
        }
    }
}

private let workRows = [
    IndexRow(id: "protecciones", label: "Protecciones"),
    IndexRow(id: "incidentes", label: "Incidentes"),
    IndexRow(id: "investigacion", label: "Investigación"),
    IndexRow(id: "dispositivos", label: "Dispositivos"),
    IndexRow(id: "conexiones", label: "Conexiones"),
    IndexRow(id: "permisos", label: "Permisos"),
    IndexRow(id: "recursos", label: "Recursos"),
    IndexRow(id: "notificaciones", label: "Notificaciones"),
    IndexRow(id: "widgets", label: "Widget"),
]

private let orgRows = [
    IndexRow(id: "politicas", label: "Políticas"),
    IndexRow(id: "agregados", label: "Agregados"),
    IndexRow(id: "integraciones", label: "Integraciones"),
    IndexRow(id: "auditoria", label: "Auditoría"),
    IndexRow(id: "facturacion", label: "Facturación"),
]

struct WorkIndex: View {
    var body: some View {
        Page {
            Kicker(text: "Trabajo").padding(.top, 8)
            PageTitle(text: "Operación").padding(.top, 8)
            BodyText(text: "Cada fila abre su pantalla. Ninguna observa el teléfono.", emphasis: true).padding(.top, 12)
            ForEach(workRows) { row in
                NavigationLink(value: row.id == "conexiones" ? MobileRoute.connections : MobileRoute.sheet(row.id)) {
                    FactRow(title: row.label, value: row.value)
                }
                .buttonStyle(.plain)
            }
            .padding(.top, 8)
        }
        .modifier(SectionRouter())
        .modifier(BrandBar())
    }
}

struct OrgIndex: View {
    var body: some View {
        Page {
            Kicker(text: "Organización").padding(.top, 8)
            PageTitle(text: "Organización").padding(.top, 8)
            BodyText(text: "Sin personas identificadas y sin cifras inventadas.", emphasis: true).padding(.top, 12)
            ForEach(orgRows) { row in
                NavigationLink(value: MobileRoute.sheet(row.id)) {
                    FactRow(title: row.label, value: row.value)
                }
                .buttonStyle(.plain)
            }
            .padding(.top, 8)
        }
        .modifier(SectionRouter())
        .modifier(BrandBar())
    }
}

struct SectionRouter: ViewModifier {
    func body(content: Content) -> some View {
        content.navigationDestination(for: MobileRoute.self) { route in
            switch route {
            case .connections:
                LinksView()
            case .sheet(let id):
                SheetScreen(id: id)
            }
        }
    }
}

struct SheetScreen: View {
    let id: String
    @Environment(\.dismiss) private var dismiss
    @State private var fixture = false
    @State private var pause = false
    @State private var notice = false
    @State private var medium = false

    var body: some View {
        Group {
            if id == "notificaciones" {
                notices
            } else if id == "widgets" {
                widget
            } else if let sheet = MobileSheets.find(id, review: fixture) {
                sheetBody(sheet)
            }
        }
        .modifier(BrandBar())
    }

    @ViewBuilder
    private func sheetBody(_ sheet: MobileSheet) -> some View {
        Page {
            Kicker(text: fixture && id == "incidentes" ? "Fixture sintético" : "Sesión de demostración").padding(.top, 8)
            PageTitle(text: sheet.title).padding(.top, 8)
            BodyText(text: sheet.lede, emphasis: true).padding(.top, 12)
            ForEach(sheet.rows, id: \.0) { row in
                FactRow(title: row.0, value: row.1)
            }
            .padding(.top, 8)
            ForEach(sheet.blocks, id: \.0) { block in
                Text(block.0).font(SovFont.title(22)).padding(.top, 18)
                BodyText(text: block.1, emphasis: true).padding(.top, 6)
            }
            BodyText(text: sheet.note).padding(.top, 14)
            if id == "incidentes" {
                Button(fixture ? "Ocultar el fixture" : "Ver un fixture sintético") { fixture.toggle() }
                    .buttonStyle(LineButton())
                    .padding(.top, 16)
            }
            if id == "permisos" {
                if pause {
                    BodyText(text: "La pausa está dibujada en este dispositivo. El sistema no recibió nada.", emphasis: true).padding(.top, 16)
                    Button("Quitar la pausa dibujada") { pause = false }.buttonStyle(LineButton()).padding(.top, 10)
                } else {
                    Button("Dibujar la pausa") { pause = true }.buttonStyle(FilledButton()).padding(.top, 16)
                }
            }
            if let label = sheet.actionLabel, let next = sheet.actionId {
                if next == "inicio" || next == "cuenta" {
                    Button(label) { dismiss() }
                        .buttonStyle(FilledButton())
                        .padding(.top, 16)
                } else {
                    NavigationLink(value: next == "conexiones" ? MobileRoute.connections : MobileRoute.sheet(next)) {
                        Text(label).frame(maxWidth: .infinity, minHeight: 48)
                    }
                    .buttonStyle(FilledButton())
                    .padding(.top, 16)
                }
            }
        }
    }

    private var notices: some View {
        Page {
            Kicker(text: "Trabajo").padding(.top, 8)
            PageTitle(text: "Notificaciones").padding(.top, 8)
            BodyText(text: "El centro está vacío. Vacío no significa protegido.", emphasis: true).padding(.top, 12)
            if notice {
                Text("FIXTURE SINTÉTICO").font(SovFont.kicker()).padding(.top, 16)
                Text("Una página de prueba pide un código").font(SovFont.title(22)).padding(.top, 8)
                BodyText(text: "Inferido, no verificado. Este aviso no salió al Centro de notificaciones.").padding(.top, 6)
                Button("Cerrar el aviso") { notice = false }.buttonStyle(LineButton()).padding(.top, 12)
            } else {
                BodyText(text: "Ningún aviso en este dispositivo.").padding(.top, 16)
                Button("Ver un aviso sintético") { notice = true }.buttonStyle(FilledButton()).padding(.top, 12)
            }
            FactRow(title: "Centro de notificaciones", value: "Sin aviso").padding(.top, 16)
            FactRow(title: "Push", value: "No hay")
        }
    }

    private var widget: some View {
        Page {
            Kicker(text: "Este dispositivo").padding(.top, 8)
            PageTitle(text: "Widget").padding(.top, 8)
            BodyText(text: "No está en la pantalla de inicio. Esto es su forma.", emphasis: true).padding(.top, 12)
            Button(medium ? "Ver tamaño pequeño" : "Ver tamaño mediano") { medium.toggle() }
                .buttonStyle(medium ? LineButton() : FilledButton())
                .padding(.top, 16)
            Text("Sin cobertura que afirmar").font(SovFont.title(22)).padding(.top, 16)
            BodyText(text: medium ? "Tamaño mediano. Sigue sin anclarse y sin leer la pantalla." : "Tamaño pequeño. Sigue sin anclarse y sin leer la pantalla.").padding(.top, 6)
            FactRow(title: "Anclado", value: "No").padding(.top, 16)
            FactRow(title: "Captura", value: "Sin permiso")
        }
    }
}

struct MobileSheet {
    let title: String
    let lede: String
    let note: String
    let rows: [(String, String)]
    let blocks: [(String, String)]
    let actionLabel: String?
    let actionId: String?
}

enum MobileSheets {
    static func find(_ id: String, review: Bool) -> MobileSheet? {
        if id == "incidentes" && review {
            return MobileSheet(
                title: "Incidentes",
                lede: "Fixture sintético en revisión. No es una detección validada.",
                note: "Un fixture sintético no es una detección validada.",
                rows: [("Fuente", "Página de prueba"), ("Verificación externa", "No ejecutada")],
                blocks: [
                    ("Observado", "Una página de prueba pide un código de un solo uso y un cambio de cuenta."),
                    ("Inferido, no verificado", "Podría ser una suplantación. No hay fuente independiente en este fixture."),
                    ("Desconocido", "La identidad del remitente no está corroborada."),
                ],
                actionLabel: "Abrir investigación",
                actionId: "investigacion"
            )
        }
        return all[id]
    }

    private static let all: [String: MobileSheet] = [
        "protecciones": MobileSheet(title: "Protecciones", lede: "La captura prevista es de esta sesión y se puede revocar antes de pedirla al sistema.", note: "El botón no abre el diálogo del sistema.", rows: [("Esta sesión", "No concedida"), ("Otras apps", "No se leen"), ("Pantallas seguras", "No se evaden")], blocks: [("Alcance", "Solo fuentes que la persona elija, durante la sesión, con pausa y revocación visibles."), ("Límite", "No hay un sensor publicado. Esta pantalla explica el alcance, no lo activa.")], actionLabel: "Ir a permisos", actionId: "permisos"),
        "incidentes": MobileSheet(title: "Incidentes", lede: "No hay observaciones. Eso no significa protección activa.", note: "Un fixture sintético no es una detección validada.", rows: [("Observados", "0"), ("Inferidos", "0"), ("Desconocidos", "0")], blocks: [], actionLabel: "Abrir investigación", actionId: "investigacion"),
        "investigacion": MobileSheet(title: "Investigación", lede: "No hay una investigación en curso. El costo remoto de esta demostración es cero.", note: "Hecho, hipótesis y verificación externa se mantienen separados.", rows: [("Estado", "Sin cola"), ("Costo remoto", "0"), ("Fuentes citadas", "Ninguna")], blocks: [("Pasos previstos", "Evento, hipótesis y verificación. La verificación externa no se ejecuta aquí.")], actionLabel: "Volver a incidentes", actionId: "incidentes"),
        "dispositivos": MobileSheet(title: "Dispositivos", lede: "Ningún sistema tiene un sensor certificado.", note: "La ausencia de un dispositivo no es protección.", rows: [("Este dispositivo", "App presente, sin sensor"), ("El otro teléfono", "Sin enlace"), ("Escritorio", "Ventana, sin captura")], blocks: [("Matriz", "Esta aplicación está en el teléfono. No observa la pantalla. El escritorio tampoco captura.")], actionLabel: "Ver permisos", actionId: "permisos"),
        "permisos": MobileSheet(title: "Permisos", lede: "Pausa y revocación se explican aquí. El diálogo lo muestra el sistema.", note: "Estos controles no conceden el permiso de captura.", rows: [("Captura", "Sin permiso"), ("Pausa", "Solo dibujada"), ("Revocación", "Nada que revocar")], blocks: [("Sistema", "El diálogo de Android o el selector de iOS no está imitado en esta pantalla.")], actionLabel: "Volver al inicio", actionId: "inicio"),
        "recursos": MobileSheet(title: "Recursos", lede: "No hay medición de batería ni de gasto.", note: "Inferencias de pago en esta sesión: 0.", rows: [("Inferencias de pago", "0"), ("Inferencias locales", "No medidas"), ("Batería", "Sin medición")], blocks: [("Límite", "No hay un presupuesto remoto. El costo que se puede afirmar es cero.")], actionLabel: "Ver facturación", actionId: "facturacion"),
        "politicas": MobileSheet(title: "Políticas", lede: "No hay una política empresarial firmada. Esta vista no vigila personas.", note: "Sin chats privados ni perfiles de ánimo.", rows: [("Política", "No firmada"), ("Personas identificadas", "No"), ("Ánimo", "No se perfila")], blocks: [("Límite", "Una organización futura vería agregados con umbral, no el contenido de una persona.")], actionLabel: "Ver agregados", actionId: "agregados"),
        "agregados": MobileSheet(title: "Agregados", lede: "No hay indicadores de una organización. Vacío no es vigilancia.", note: "Un agregado futuro tendría umbral de privacidad.", rows: [("Indicadores", "Ninguno"), ("Umbral", "No definido"), ("Personas", "No listadas")], blocks: [("Qué no se muestra", "No hay nombres, mensajes ni un ranking de personas.")], actionLabel: "Ver integraciones", actionId: "integraciones"),
        "integraciones": MobileSheet(title: "Integraciones", lede: "No hay conectores activos.", note: "Ningún sistema está certificado.", rows: [("Conectores", "0"), ("Proveedores", "No configurados"), ("Webhooks", "No")], blocks: [("Estado", "No hay una clave de integración, ni un directorio, ni un conector de correo.")], actionLabel: "Ver auditoría", actionId: "auditoria"),
        "auditoria": MobileSheet(title: "Auditoría", lede: "No hay una bitácora exportable.", note: "Esta aplicación no conserva un registro de acciones.", rows: [("Eventos", "0"), ("Exportación", "No"), ("Retención", "No hay bitácora")], blocks: [("Qué faltaría", "Actor, acción, objeto y fecha. Hoy no hay filas porque no hay acciones reales.")], actionLabel: "Ver facturación", actionId: "facturacion"),
        "facturacion": MobileSheet(title: "Facturación", lede: "No hay precios ni factura. El gasto remoto de esta sesión es cero.", note: "No se muestra un plan ni un botón de pago.", rows: [("Importe", "No publicado"), ("Plan", "No ofrecido"), ("Inferencias de pago", "0")], blocks: [("Sitio público", "La página de precios del sitio también dice que no hay cifras.")], actionLabel: nil, actionId: nil),
        "ajustes": MobileSheet(title: "Ajustes", lede: "Preferencias de este dispositivo. No se escriben en un servidor.", note: "No hay notificación push ni una clave que cambiar.", rows: [("Idioma", "es"), ("Retención", "Solo local"), ("Telemetría", "No hay")], blocks: [], actionLabel: "Volver a la cuenta", actionId: "cuenta"),
    ]
}
