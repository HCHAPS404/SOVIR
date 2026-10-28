import SwiftUI

struct WelcomeView: View {
    let onSignIn: () -> Void
    let onRegister: () -> Void
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Page {
            HStack(spacing: 10) {
                Mark(size: 36)
                Text(Copy.brand).font(SovFont.brand(20)).foregroundStyle(Palette.of(scheme).ink)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(Copy.brand)
            .padding(.top, 28)
            PageTitle(text: Copy.welcomeLine).padding(.top, 36)
            BodyText(text: Copy.welcomeNote).padding(.top, 12)
            Button(Copy.enter, action: onSignIn)
                .buttonStyle(FilledButton())
                .padding(.top, 32)
                .accessibilityIdentifier("enter")
            Button(Copy.create, action: onRegister)
                .buttonStyle(LineButton())
                .padding(.top, 10)
                .accessibilityIdentifier("register")
            BodyText(text: Copy.noNetwork).padding(.top, 28)
        }
        .toolbar(.hidden, for: .navigationBar)
    }
}

struct AccessView: View {
    let kind: GateKind
    @EnvironmentObject private var session: Session
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var secret = ""
    @State private var showMail = false
    @State private var problem: String?
    @State private var result: String?

    var body: some View {
        let palette = Palette.of(scheme)
        Page {
            PageTitle(text: Copy.noAccountTitle).padding(.top, 12)
            BodyText(text: kind == .signIn ? Copy.signInLede : Copy.registerLede).padding(.top, 12)
            if let result {
                BodyText(text: result, emphasis: true).padding(.top, 24)
                Button(Copy.otherOptions) {
                    self.result = nil
                    problem = nil
                }
                .buttonStyle(LineButton())
                .padding(.top, 16)
            } else if showMail {
                mailFields(palette)
            } else {
                ForEach(Door.allCases.filter { $0 != .email }) { door in
                    Button("Continuar con \(door.label)") { finish(door) }
                        .buttonStyle(LineButton())
                        .padding(.top, 10)
                }
                Button(Copy.continueEmail) { showMail = true }
                    .buttonStyle(FilledButton())
                    .padding(.top, 10)
            }
            BodyText(text: Copy.termsNote).padding(.top, 18)
            if kind == .register {
                Button(Copy.haveEntry) { dismiss() }
                    .buttonStyle(LineButton())
                    .padding(.top, 10)
            }
            if kind == .signIn {
                Rectangle().fill(palette.line).frame(height: 1).padding(.top, 28)
                Button(Copy.developer) { session.openDemo() }
                    .buttonStyle(FilledButton())
                    .padding(.top, 20)
                    .accessibilityIdentifier("developer-profile")
                BodyText(text: Copy.developerNote).padding(.top, 10)
            }
        }
        .modifier(BrandBar())
    }

    @ViewBuilder
    private func mailFields(_ palette: Palette) -> some View {
        TextField(Copy.emailPlaceholder, text: $email)
            .textFieldStyle(.plain)
            .font(SovFont.body(17))
            .padding(14)
            .background(palette.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(palette.line, lineWidth: 1))
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .keyboardType(.emailAddress)
            .textContentType(.none)
            .padding(.top, 20)
            .accessibilityLabel(Copy.email)
        SecureField(Copy.secret, text: $secret)
            .textFieldStyle(.plain)
            .font(SovFont.body(17))
            .padding(14)
            .background(palette.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(palette.line, lineWidth: 1))
            .textContentType(.none)
            .padding(.top, 10)
            .accessibilityLabel(Copy.secret)
        if let problem {
            Text(problem).font(SovFont.body(15)).foregroundStyle(palette.danger).padding(.top, 8)
        }
        Button(Copy.continueEmail) { submit() }
            .buttonStyle(FilledButton())
            .padding(.top, 14)
        Button(Copy.otherOptions) {
            email = ""
            secret = ""
            problem = nil
            showMail = false
        }
        .buttonStyle(LineButton())
        .padding(.top, 10)
    }

    private func submit() {
        if let issue = emailProblem(email) ?? secretProblem(secret) {
            problem = issue
            return
        }
        finish(.email)
    }

    private func finish(_ door: Door) {
        email = ""
        secret = ""
        problem = nil
        showMail = false
        result = refuse(kind, door).message
    }
}
