import SwiftUI

struct Palette {
    let canvas: Color
    let surface: Color
    let ink: Color
    let muted: Color
    let line: Color
    let brand: Color
    let danger: Color
    let onInk: Color

    static func of(_ scheme: ColorScheme) -> Palette {
        scheme == .dark ? dark : light
    }

    static let light = Palette(
        canvas: Color(hex: 0xF4F0E6),
        surface: Color(hex: 0xFBF7F0),
        ink: Color(hex: 0x1A1714),
        muted: Color(hex: 0x5E584E),
        line: Color(hex: 0xD8D0C3),
        brand: Color(hex: 0x7A5B3A),
        danger: Color(hex: 0x8C2E2A),
        onInk: Color(hex: 0xF4F0E6)
    )
    static let dark = Palette(
        canvas: Color(hex: 0x000000),
        surface: Color(hex: 0x1E1C19),
        ink: Color(hex: 0xF4F0E6),
        muted: Color(hex: 0xC4BBAE),
        line: Color(hex: 0x3C3832),
        brand: Color(hex: 0xD4B48A),
        danger: Color(hex: 0xF0B2AC),
        onInk: Color(hex: 0x000000)
    )
}

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

enum SovFont {
    static func brand(_ size: CGFloat) -> Font { .custom("Outfit", size: size, relativeTo: .headline).weight(.medium) }
    static func display(_ size: CGFloat) -> Font { .custom("Newsreader", size: size, relativeTo: .largeTitle).weight(.medium) }
    static func title(_ size: CGFloat) -> Font { .custom("Newsreader", size: size, relativeTo: .title2).weight(.medium) }
    static func body(_ size: CGFloat) -> Font { .custom("Source Sans 3", size: size, relativeTo: .body) }
    static func kicker(_ size: CGFloat = 12) -> Font { .custom("IBM Plex Mono", size: size, relativeTo: .caption) }
}

struct FilledButton: ButtonStyle {
    @Environment(\.colorScheme) private var scheme
    func makeBody(configuration: Configuration) -> some View {
        let palette = Palette.of(scheme)
        configuration.label
            .font(SovFont.body(17))
            .foregroundStyle(palette.onInk)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(palette.ink, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .opacity(configuration.isPressed ? 0.84 : 1)
    }
}

struct LineButton: ButtonStyle {
    @Environment(\.colorScheme) private var scheme
    func makeBody(configuration: Configuration) -> some View {
        let palette = Palette.of(scheme)
        configuration.label
            .font(SovFont.body(17))
            .foregroundStyle(palette.ink)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(palette.canvas, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(palette.line, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.72 : 1)
    }
}

struct Mark: View {
    var size: CGFloat = 28
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        Image(scheme == .dark ? "MarkPaper" : "MarkInk")
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

struct Page<Content: View>: View {
    @Environment(\.colorScheme) private var scheme
    @ViewBuilder var content: () -> Content
    var body: some View {
        let palette = Palette.of(scheme)
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                content()
            }
            .frame(maxWidth: 640, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
        }
        .background(palette.canvas)
        .scrollContentBackground(.hidden)
    }
}

struct Kicker: View {
    let text: String
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        Text(text.uppercased())
            .font(SovFont.kicker())
            .foregroundStyle(Palette.of(scheme).muted)
            .tracking(0.6)
    }
}

struct PageTitle: View {
    let text: String
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        Text(text)
            .font(SovFont.display(32))
            .foregroundStyle(Palette.of(scheme).ink)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }
}

struct BodyText: View {
    let text: String
    var emphasis = false
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        Text(text)
            .font(SovFont.body(emphasis ? 17 : 16))
            .foregroundStyle(emphasis ? Palette.of(scheme).ink : Palette.of(scheme).muted)
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct FactRow: View {
    let title: String
    let value: String
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let palette = Palette.of(scheme)
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 16) {
                Text(title).font(SovFont.body(17)).foregroundStyle(palette.ink)
                Spacer(minLength: 12)
                Text(value).font(SovFont.body(15)).foregroundStyle(palette.muted).multilineTextAlignment(.trailing)
            }
            .frame(minHeight: 52)
            Rectangle().fill(palette.line).frame(height: 1)
        }
        .accessibilityElement(children: .combine)
    }
}

struct BrandBar: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        let palette = Palette.of(scheme)
        content
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(palette.canvas, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 8) {
                        Mark(size: 22)
                        Text(Copy.brand).font(SovFont.brand(16)).foregroundStyle(palette.ink)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(Copy.brand)
                }
            }
    }
}
