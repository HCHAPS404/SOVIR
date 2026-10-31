import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Page {
            Kicker(text: Copy.sessionKicker).padding(.top, 8)
            PageTitle(text: Copy.homeTitle).padding(.top, 8)
            BodyText(text: Copy.homeLede, emphasis: true).padding(.top, 12)
            NavigationLink(value: Detail.permissions) {
                FactRow(title: Copy.capture, value: Copy.noPermission)
            }
            .buttonStyle(.plain)
            .padding(.top, 20)
            FactRow(title: Copy.lastEvent, value: Copy.none)
            FactRow(title: Copy.links, value: session.pending.isEmpty ? Copy.none : Copy.localNotes)
            Text(Copy.toConnect)
                .font(SovFont.title(22))
                .foregroundStyle(Palette.of(scheme).ink)
                .padding(.top, 28)
                .accessibilityAddTraits(.isHeader)
            ForEach(sources) { source in
                NavigationLink(value: Detail.source(source.id)) {
                    FactRow(title: source.title, value: pendingLabel(pendingOf(session.pending.contains(source.id))))
                }
                .buttonStyle(.plain)
            }
            BodyText(text: Copy.noNetwork).padding(.top, 16)
        }
        .navigationDestination(for: Detail.self, destination: detail)
        .modifier(BrandBar())
    }
}

struct LinksView: View {
    @EnvironmentObject private var session: Session

    var body: some View {
        Page {
            PageTitle(text: Copy.connectionsTitle).padding(.top, 8)
            BodyText(text: Copy.connectionsLede, emphasis: true).padding(.top, 12)
            ForEach(sources) { source in
                NavigationLink(value: Detail.source(source.id)) {
                    FactRow(title: source.title, value: pendingLabel(pendingOf(session.pending.contains(source.id))))
                }
                .buttonStyle(.plain)
            }
            .padding(.top, 8)
            BodyText(text: Copy.noNetwork).padding(.top, 16)
        }
        .navigationDestination(for: Detail.self, destination: detail)
        .modifier(BrandBar())
    }
}

struct LinkDetailView: View {
    let id: SourceID
    @EnvironmentObject private var session: Session
    private var source: Source { sources.first { $0.id == id }! }
    private var marked: Bool { session.pending.contains(id) }

    var body: some View {
        Page {
            Kicker(text: pendingLabel(pendingOf(marked))).padding(.top, 8)
            PageTitle(text: source.title).padding(.top, 8)
            BodyText(text: source.summary, emphasis: true).padding(.top, 16)
            BodyText(text: source.body).padding(.top, 8)
            BodyText(text: Copy.pendingExplain).padding(.top, 8)
            if marked {
                Button(Copy.clearPending) { session.toggle(id) }
                    .buttonStyle(LineButton())
                    .padding(.top, 24)
            } else {
                Button(Copy.markPending) { session.toggle(id) }
                    .buttonStyle(FilledButton())
                    .padding(.top, 24)
            }
        }
        .navigationTitle(Copy.connectionsTitle)
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct ActivityView: View {
    @State private var incidents = true
    @State private var fixture = false
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let palette = Palette.of(scheme)
        Page {
            PageTitle(text: Copy.activity).padding(.top, 8)
            HStack(spacing: 8) {
                if incidents {
                    Button(Copy.incidents) { incidents = true }.buttonStyle(FilledButton())
                    Button(Copy.investigation) { incidents = false }.buttonStyle(LineButton())
                } else {
                    Button(Copy.incidents) { incidents = true }.buttonStyle(LineButton())
                    Button(Copy.investigation) { incidents = false }.buttonStyle(FilledButton())
                }
            }
            .padding(.top, 16)
            if incidents {
                BodyText(text: Copy.incidentsEmpty, emphasis: true).padding(.top, 20)
                if fixture {
                    Text(Copy.fixtureBanner.uppercased())
                        .font(SovFont.kicker())
                        .foregroundStyle(palette.brand)
                        .padding(.top, 16)
                    Text(Copy.fixtureObserved).font(SovFont.title(22)).foregroundStyle(palette.ink).padding(.top, 12)
                    BodyText(text: Copy.fixtureObservedBody, emphasis: true).padding(.top, 6)
                    Text(Copy.fixtureInferred).font(SovFont.title(22)).foregroundStyle(palette.ink).padding(.top, 14)
                    BodyText(text: Copy.fixtureInferredBody, emphasis: true).padding(.top, 6)
                    Text(Copy.fixtureUnknown).font(SovFont.title(22)).foregroundStyle(palette.ink).padding(.top, 14)
                    BodyText(text: Copy.fixtureUnknownBody, emphasis: true).padding(.top, 6)
                    Button(Copy.hideFixture) { fixture = false }.buttonStyle(LineButton()).padding(.top, 16)
                } else {
                    Button(Copy.showFixture) { fixture = true }.buttonStyle(LineButton()).padding(.top, 16)
                }
            } else {
                BodyText(text: Copy.investigationEmpty, emphasis: true).padding(.top, 20)
                BodyText(text: Copy.investigationSteps).padding(.top, 8)
            }
        }
        .modifier(BrandBar())
    }
}

struct AccountView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let palette = Palette.of(scheme)
        Page {
            Kicker(text: Copy.sessionKicker).padding(.top, 8)
            PageTitle(text: Copy.account).padding(.top, 8)
            BodyText(text: Copy.developerProfile, emphasis: true).padding(.top, 12)
            BodyText(text: Copy.noIdentity).padding(.top, 4)
            Text(Copy.theme)
                .font(SovFont.title(22))
                .foregroundStyle(palette.ink)
                .padding(.top, 24)
                .accessibilityAddTraits(.isHeader)
            Picker(Copy.theme, selection: themeBinding) {
                Text(Copy.system).tag(ThemeChoice.system)
                Text(Copy.light).tag(ThemeChoice.light)
                Text(Copy.dark).tag(ThemeChoice.dark)
            }
            .pickerStyle(.segmented)
            .padding(.top, 10)
            NavigationLink(value: MobileRoute.sheet("ajustes")) {
                FactRow(title: "Ajustes", value: "Solo en este dispositivo")
            }
            .buttonStyle(.plain)
            .padding(.top, 16)
            NavigationLink(value: Detail.permissions) {
                FactRow(title: Copy.permissions, value: Copy.noPermission)
            }
            .buttonStyle(.plain)
            .padding(.top, 8)
            Button(Copy.closeSession) { session.closeDemo() }
                .buttonStyle(LineButton())
                .padding(.top, 24)
                .accessibilityIdentifier("close-session")
            BodyText(text: Copy.closeNote).padding(.top, 10)
        }
        .navigationDestination(for: Detail.self, destination: detail)
        .modifier(SectionRouter())
        .modifier(BrandBar())
    }

    private var themeBinding: Binding<ThemeChoice> {
        Binding(get: { session.theme }, set: { session.setTheme($0) })
    }
}

struct PermissionsView: View {
    var body: some View {
        Page {
            PageTitle(text: Copy.permissionsTitle).padding(.top, 8)
            BodyText(text: Copy.permissionsLede, emphasis: true).padding(.top, 12)
            BodyText(text: Copy.permissionsBody).padding(.top, 12)
            FactRow(title: Copy.capture, value: Copy.noPermission).padding(.top, 20)
            FactRow(title: Copy.pause, value: Copy.pauseValue)
            FactRow(title: Copy.revoke, value: Copy.revokeValue)
        }
        .navigationTitle(Copy.permissions)
        .navigationBarTitleDisplayMode(.inline)
    }
}

@ViewBuilder
func detail(_ route: Detail) -> some View {
    switch route {
    case .source(let id):
        LinkDetailView(id: id)
    case .permissions:
        PermissionsView()
    }
}
