// Locale constants shared by server and client components. Kept free of
// next/headers so client components (e.g. LanguageSwitcher) can import it.
export type Locale = "es" | "en" | "pt" | "fr" | "it" | "de" | "ja" | "zh";
export const LOCALES: Locale[] = ["es", "en", "pt", "fr", "it", "de", "ja", "zh"];
export const LOCALE_NAMES: Record<Locale, string> = {
  es: "Español",
  en: "English",
  pt: "Português",
  fr: "Français",
  it: "Italiano",
  de: "Deutsch",
  ja: "日本語",
  zh: "中文",
};
