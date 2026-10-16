/**
 * Customer PDFs are always in English, but staff quote cards carry Chinese
 * wording (service names, the shop's flat-price options, "(带钉)"). This turns
 * those into English and drops any Chinese left over, so a PDF never shows it.
 */
import { englishFlatWord } from "@/lib/repair-chat/flat-price";

/** Chinese phrases the workbench writes on staff quotes, longest first. */
const PHRASES: Array<[RegExp, string]> = [
  [/新轮胎（含安装）|新輪胎（含安裝）/g, "New tires, installed"],
  [/换胎（客人自带轮胎）/g, "Tire change (customer's own tires)"],
  [/普通胎（18 寸及以下）/g, 'Standard tire, up to 18"'],
  [/普通胎（19 寸及以上）/g, 'Standard tire, 19" and up'],
  [/越野胎（AT\/RT\/MT）/g, "Off-road tire (AT/RT/MT)"],
  [/防爆胎/g, "Run-flat tire"],
  [/[（(]带钉[）)]|[（(]帶釘[）)]/g, "(studded)"],
  [/，?左右两边/g, ", both sides"],
  [/现货|現貨/g, "in stock"],
  [/需调货，约 1–3 天|需調貨，約 1–3 天/g, "about 1–3 days to arrive"],
];

const FULL_WIDTH: Record<string, string> = { "（": "(", "）": ")", "，": ", ", "：": ": ", "；": "; ", "、": ", ", "。": ". " };

const CJK = /[　-〿㐀-䶿一-鿿豈-﫿＀-￯]/;

export function toEnglish(text: string): string {
  if (!CJK.test(text)) return text;
  const translated = text
    .split(/\s*·\s*/)
    .map((part) => englishFlatWord(part) ?? PHRASES.reduce((s, [pattern, english]) => s.replace(pattern, english), part))
    .join(" · ");
  return translated
    .replace(/[（）()，：；、。]/g, (c) => FULL_WIDTH[c] ?? c)
    .replace(new RegExp(CJK.source, "g"), " ")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;:·-]+|[\s,;:·-]+$/g, "");
}
