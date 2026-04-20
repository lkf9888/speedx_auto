import { en } from "./en";
import { zhCN } from "./zh-CN";
import { zhTW } from "./zh-TW";
import type { Locale } from "./config";
import type { Dictionary } from "./en";

const dictionaries: Record<Locale, Dictionary> = {
  en,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
};

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries.en;
}

export type { Dictionary } from "./en";
