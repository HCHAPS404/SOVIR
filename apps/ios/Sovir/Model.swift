import Foundation
import SwiftUI

enum Door: String, CaseIterable, Identifiable {
    case google, github, microsoft, apple, email
    var id: String { rawValue }
    var label: String {
        switch self {
        case .google: return "Google"
        case .github: return "GitHub"
        case .microsoft: return "Microsoft"
        case .apple: return "Apple"
        case .email: return "el correo"
        }
    }
}

enum GateKind { case signIn, register }

struct AttemptResult: Equatable {
    let door: Door
    let message: String
    let accountCreated: Bool
    let networkCalled: Bool
    let enteredShell: Bool
}

func refuse(_ kind: GateKind, _ door: Door) -> AttemptResult {
    let message: String
    switch kind {
    case .signIn:
        message = "Elegiste \(door.label). No se inició sesión. No se llamó a ningún servicio."
    case .register:
        message = "Elegiste \(door.label). No se guardó el registro. No se llamó a ningún servicio."
    }
    return AttemptResult(door: door, message: message, accountCreated: false, networkCalled: false, enteredShell: false)
}

func emailProblem(_ value: String) -> String? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return "Falta el correo." }
    guard let at = trimmed.firstIndex(of: "@") else { return "El correo no tiene forma de dirección." }
    if at == trimmed.startIndex || trimmed.lastIndex(of: "@") != at || trimmed.index(after: at) == trimmed.endIndex {
        return "El correo no tiene forma de dirección."
    }
    return nil
}

func secretProblem(_ value: String) -> String? {
    value.isEmpty ? "Falta la clave." : nil
}

enum SourceID: String, CaseIterable, Identifiable, Hashable {
    case phone, extensionBrowser, console, desktop
    var id: String { rawValue }
}

struct Source: Identifiable {
    let id: SourceID
    let title: String
    let summary: String
    let body: String
}

let sources: [Source] = [
    Source(id: .phone, title: "Este dispositivo", summary: "El aparato donde se abre esta aplicación.", body: "No está registrado en una cuenta. Marcarlo pendiente solo guarda una nota local."),
    Source(id: .extensionBrowser, title: "Extensión del navegador", summary: "El permiso por sitio vive en la extensión, no aquí.", body: "Esta aplicación no observa páginas ni hereda el permiso de la extensión."),
    Source(id: .console, title: "Consola web", summary: "La sesión de la consola no se comparte con este dispositivo.", body: "Entrar en la web no enlaza este aparato."),
    Source(id: .desktop, title: "Escritorio", summary: "Windows, macOS o Linux.", body: "No hay un instalador publicado ni un enlace con este dispositivo."),
]

enum Pending: Equatable { case absent, localNote }

func pendingOf(_ marked: Bool) -> Pending { marked ? .localNote : .absent }

func pendingLabel(_ state: Pending) -> String {
    switch state {
    case .absent: return "Sin enlace"
    case .localNote: return "Pendiente en este dispositivo"
    }
}

enum ThemeChoice: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var scheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

enum Detail: Hashable {
    case source(SourceID)
    case permissions
}

enum GateRoute: Hashable { case signIn, register }

enum Copy {
    static let brand = "SOVIR"
    static let welcomeLine = "En el dispositivo, con una política, en tus manos."
    static let welcomeNote = "Esta aplicación no observa la pantalla."
    static let enter = "Entrar"
    static let create = "Crear cuenta"
    static let noAccountTitle = "Ninguna cuenta se abre desde aquí."
    static let signInLede = "Simulación de acceso. No hay cuenta ni clave guardada."
    static let registerLede = "Simulación de alta. No se crea un usuario ni se conserva la clave."
    static let continueEmail = "Continuar con el correo"
    static let otherOptions = "Otras opciones"
    static let email = "Correo"
    static let secret = "Clave"
    static let emailPlaceholder = "nombre@correo.com"
    static let developer = "Perfil de desarrollador"
    static let developerNote = "Entra sin cuenta. La sesión queda solo en este dispositivo y no concede ningún permiso."
    static let termsNote = "Al continuar no se abre una cuenta y no se envía el correo. Esta pantalla no llama a ningún servicio."
    static let haveEntry = "Ir a entrar"
    static let sessionKicker = "Sesión de demostración"
    static let homeTitle = "Sin cobertura que afirmar"
    static let homeLede = "No hay sensores conectados. Vacío no significa protegido."
    static let capture = "Captura"
    static let noPermission = "Sin permiso"
    static let lastEvent = "Último evento"
    static let none = "Ninguno"
    static let links = "Enlaces"
    static let localNotes = "Notas locales"
    static let toConnect = "Por conectar"
    static let connectionsTitle = "Conexiones"
    static let connectionsLede = "Fuentes que podrían enlazarse más adelante. Ninguna está enlazada con una cuenta."
    static let noNetwork = "Esta aplicación no consulta la red."
    static let markPending = "Dejar pendiente en este dispositivo"
    static let clearPending = "Quitar la nota"
    static let pendingExplain = "La nota queda en este dispositivo. No crea una cuenta, no enlaza un servicio y no pide un permiso del sistema."
    static let activity = "Actividad"
    static let incidents = "Incidentes"
    static let investigation = "Investigación"
    static let incidentsEmpty = "No hay observaciones. Eso no significa protección activa."
    static let investigationEmpty = "No hay una investigación en curso. El costo remoto de esta demostración es cero."
    static let investigationSteps = "Los pasos previstos son evento, hipótesis y verificación. La verificación externa no se ejecuta aquí."
    static let showFixture = "Ver un fixture sintético"
    static let hideFixture = "Ocultar el fixture"
    static let fixtureBanner = "Fixture sintético"
    static let fixtureObserved = "Observado"
    static let fixtureObservedBody = "Una página de prueba pide un código de un solo uso y un cambio de cuenta."
    static let fixtureInferred = "Inferido, no verificado"
    static let fixtureInferredBody = "Podría ser una suplantación. No hay fuente independiente en este fixture."
    static let fixtureUnknown = "Desconocido"
    static let fixtureUnknownBody = "La identidad del remitente no está corroborada."
    static let account = "Cuenta"
    static let developerProfile = "Perfil de desarrollador"
    static let noIdentity = "No hay correo ni nombre guardados."
    static let theme = "Tema"
    static let system = "Sistema"
    static let light = "Claro"
    static let dark = "Oscuro"
    static let permissions = "Permisos"
    static let closeSession = "Cerrar sesión"
    static let closeNote = "Cierra la sesión de demostración en este dispositivo. No hay una cuenta que borrar."
    static let permissionsTitle = "Permisos"
    static let permissionsLede = "No hay un permiso de captura. Esta aplicación no lo puede conceder."
    static let permissionsBody = "No se declara el selector de iOS, ni proyección de pantalla, ni un portal de escritorio. El diálogo del sistema no está dibujado. No se leen otras aplicaciones."
    static let pause = "Pausa"
    static let pauseValue = "No hay un sensor que pausar"
    static let revoke = "Revocación"
    static let revokeValue = "No hay una concesión que revocar"
    static let home = "Inicio"
}

final class Session: ObservableObject {
    @Published private(set) var demo: Bool
    @Published private(set) var theme: ThemeChoice
    @Published private(set) var pending: Set<SourceID>
    let accountExists = false
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        demo = defaults.bool(forKey: Key.demo)
        theme = ThemeChoice(rawValue: defaults.string(forKey: Key.theme) ?? "") ?? .system
        let stored = defaults.stringArray(forKey: Key.pending) ?? []
        pending = Set(stored.compactMap(SourceID.init(rawValue:)))
    }

    func openDemo() {
        demo = true
        defaults.set(true, forKey: Key.demo)
    }

    func closeDemo() {
        demo = false
        defaults.set(false, forKey: Key.demo)
    }

    func setTheme(_ choice: ThemeChoice) {
        theme = choice
        defaults.set(choice.rawValue, forKey: Key.theme)
    }

    func toggle(_ id: SourceID) {
        if pending.contains(id) { pending.remove(id) } else { pending.insert(id) }
        defaults.set(pending.map(\.rawValue), forKey: Key.pending)
    }

    private enum Key {
        static let demo = "sovir.demo"
        static let theme = "sovir.theme"
        static let pending = "sovir.pending"
    }
}
