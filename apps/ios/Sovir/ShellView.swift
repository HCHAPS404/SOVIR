import SwiftUI
import UIKit

enum Tab: String, CaseIterable, Identifiable {
    case home, work, org, account
    var id: String { rawValue }
    var title: String {
        switch self {
        case .home: return Copy.home
        case .work: return "Operación"
        case .org: return "Organización"
        case .account: return Copy.account
        }
    }
    var symbol: String {
        switch self {
        case .home: return "house"
        case .work: return "list.bullet.rectangle"
        case .org: return "square.grid.2x2"
        case .account: return "person"
        }
    }
}

struct ShellView: View {
    @Environment(\.horizontalSizeClass) private var size
    @Environment(\.colorScheme) private var scheme
    @State private var tab: Tab = .home

    var body: some View {
        let palette = Palette.of(scheme)
        Group {
            if size == .regular {
                NavigationSplitView {
                    List(selection: $tab) {
                        ForEach(Tab.allCases) { item in
                            Label(item.title, systemImage: item.symbol).tag(item)
                        }
                    }
                    .navigationTitle(Copy.brand)
                    .scrollContentBackground(.hidden)
                    .background(palette.canvas)
                } detail: {
                    tabRoot(tab)
                }
                .background(palette.canvas)
            } else {
                TabView(selection: $tab) {
                    tabRoot(.home)
                        .tabItem { Label(Tab.home.title, systemImage: Tab.home.symbol) }
                        .tag(Tab.home)
                        .accessibilityIdentifier("tab-home")
                    tabRoot(.work)
                        .tabItem { Label(Tab.work.title, systemImage: Tab.work.symbol) }
                        .tag(Tab.work)
                        .accessibilityIdentifier("tab-work")
                    tabRoot(.org)
                        .tabItem { Label(Tab.org.title, systemImage: Tab.org.symbol) }
                        .tag(Tab.org)
                        .accessibilityIdentifier("tab-org")
                    tabRoot(.account)
                        .tabItem { Label(Tab.account.title, systemImage: Tab.account.symbol) }
                        .tag(Tab.account)
                        .accessibilityIdentifier("tab-account")
                }
                .modifier(TabBarTone())
            }
        }
        .tint(palette.ink)
    }

    @ViewBuilder
    private func tabRoot(_ tab: Tab) -> some View {
        NavigationStack {
            switch tab {
            case .home: HomeView()
            case .work: WorkIndex()
            case .org: OrgIndex()
            case .account: AccountView()
            }
        }
    }
}

private struct TabBarTone: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        content.onAppear(perform: apply).onChange(of: scheme) { _, _ in apply() }
    }

    private func apply() {
        let canvas = uiColor(scheme == .dark ? 0x000000 : 0xF4F0E6)
        let ink = uiColor(scheme == .dark ? 0xF4F0E6 : 0x1A1714)
        let muted = uiColor(scheme == .dark ? 0xC4BBAE : 0x5E584E)
        let line = uiColor(scheme == .dark ? 0x3C3832 : 0xD8D0C3)
        let appearance = UITabBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = canvas
        appearance.shadowColor = line
        let item = UITabBarItemAppearance()
        item.normal.iconColor = muted
        item.normal.titleTextAttributes = [.foregroundColor: muted]
        item.selected.iconColor = ink
        item.selected.titleTextAttributes = [.foregroundColor: ink]
        appearance.stackedLayoutAppearance = item
        appearance.inlineLayoutAppearance = item
        appearance.compactInlineLayoutAppearance = item
        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
    }
}

private func uiColor(_ hex: UInt32) -> UIColor {
    UIColor(
        red: CGFloat((hex >> 16) & 0xFF) / 255,
        green: CGFloat((hex >> 8) & 0xFF) / 255,
        blue: CGFloat(hex & 0xFF) / 255,
        alpha: 1
    )
}
