/**
 * Simplified/Traditional Chinese clean-up in code. The model is told which
 * script to write, but small models still mix the two now and then, so the
 * reply is converted to the customer's script before it is shown.
 */
import * as OpenCC from "opencc-js";

type Convert = (text: string) => string;

let toTraditional: Convert | null = null;
let toSimplified: Convert | null = null;

/** `language` is a detectCustomerLanguage() result, e.g. "Traditional Chinese". */
export function matchScript(text: string, language: string): string {
  if (!/[一-鿿]/.test(text)) return text;
  if (language === "Traditional Chinese") {
    toTraditional ??= OpenCC.Converter({ from: "cn", to: "tw" });
    return toTraditional(text);
  }
  if (language === "Simplified Chinese") {
    toSimplified ??= OpenCC.Converter({ from: "tw", to: "cn" });
    return toSimplified(text);
  }
  return text;
}
