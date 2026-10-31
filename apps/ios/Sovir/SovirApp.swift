import SwiftUI

@main
struct SovirApp: App {
    @StateObject private var session = Session()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .preferredColorScheme(session.theme.scheme)
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Group {
            if session.demo {
                ShellView()
            } else {
                GateHost()
            }
        }
        .background(Palette.of(scheme).canvas)
    }
}

private struct GateHost: View {
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            WelcomeView(
                onSignIn: { path.append(GateRoute.signIn) },
                onRegister: { path.append(GateRoute.register) }
            )
            .navigationDestination(for: GateRoute.self) { route in
                switch route {
                case .signIn:
                    AccessView(kind: .signIn)
                case .register:
                    AccessView(kind: .register)
                }
            }
        }
    }
}
