export const locales = ["en", "zh-CN", "zh-TW"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const localeNames: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
};

export const localeHtmlLang: Record<Locale, string> = {
  en: "en",
  "zh-CN": "zh-Hans",
  "zh-TW": "zh-Hant",
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
