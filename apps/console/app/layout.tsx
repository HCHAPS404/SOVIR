import type { Metadata } from "next";
import { IBM_Plex_Mono, Newsreader, Outfit, Source_Sans_3 } from "next/font/google";
import "@sovir/ui-web/tokens.css";

const display = Newsreader({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-display", display: "swap" });
const body = Source_Sans_3({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-body", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-mono", display: "swap" });
const brand = Outfit({ subsets: ["latin"], weight: ["500"], variable: "--font-brand", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Consola SOVIR", template: "%s · Consola SOVIR" },
  description: "Consola local de demostración. No indexar.",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/brand/icon-ink.png", media: "(prefers-color-scheme: light)" },
      { url: "/brand/icon-paper.png", media: "(prefers-color-scheme: dark)" },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var q=new URLSearchParams(location.search).get('theme');var t=(q==='light'||q==='dark')?q:localStorage.getItem('sovir-theme');if(q==='light'||q==='dark')localStorage.setItem('sovir-theme',q);if(t!=='light'&&t!=='dark')t='dark';localStorage.setItem('sovir-theme',t);document.documentElement.dataset.theme=t;}catch(e){}})();",
          }}
        />
      </head>
      <body className={`${display.variable} ${body.variable} ${mono.variable} ${brand.variable}`}>{children}</body>
    </html>
  );
}
