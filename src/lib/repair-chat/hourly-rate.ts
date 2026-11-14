/**
 * The shop doesn't tell customers its hourly labor rate (Kevin, 2026-11-14):
 * labor is quoted as part of each job's total. The public assistant is never
 * given the rate, and the prompt says not to give one; this is the last check
 * in code. Any sentence in a public reply that states an hourly figure is
 * dropped and the shop's explanation goes in front instead.
 */

/** A dollar figure followed by "per hour" in some form: "$120/h", "$120 an hour", "120 元每小时". */
const AMOUNT_PER_HOUR =
  /\$?\s?\d{2,3}(?:\.\d{1,2})?\s*(?:dollars?|CAD|加元|加币|加幣|元|块|塊)?\s*(?:\/\s*(?:hours?|hrs?|h)\b|\/\s*(?:小时|小時)|per\s+(?:labou?r\s+)?hour|an\s+hour|hourly|每小时|每小時|每个小时|每個小時|一小时|一小時)/i;

/** A rate word followed closely by a figure: "hourly rate is $120", "时薪 120 元", "每小时 $120". */
const RATE_THEN_AMOUNT =
  /(?:hourly\s+(?:labou?r\s+)?rate|labou?r\s+rate|shop\s+rate|rate\s+per\s+hour|per[-\s]hour\s+rate|时薪|時薪|每小时|每小時|小时费|小時費|工时单价|工時單價|工时费率|工時費率)[^.!?。！？\n\d$]{0,12}\$?\s?\d{2,3}/i;

export function statesHourlyRate(sentence: string): boolean {
  return AMOUNT_PER_HOUR.test(sentence) || RATE_THEN_AMOUNT.test(sentence);
}

/** What the customer is told instead (Traditional Chinese comes from matchScript afterwards). */
export function hourlyRateAnswer(language: string): string {
  return /Chinese/.test(language)
    ? "工时按这款车、这个项目在工时手册里的标准工时计算，已经包含在每个估价里，所以我们不单独报每小时的价钱。告诉我车型和要做的项目，我帮您算总价；具体工时由师傅到店确认。"
    : "Labor is charged by the standard labor-guide time for your vehicle and the job, and it's already included in each estimate, so we don't quote a separate hourly rate. Tell me your vehicle and what it needs and I'll give you the total; the team confirms the exact hours at the shop.";
}

/** Sentence ends: after . ! ? followed by space, after 。！？, or at a line break. Kept as separators. */
const SENTENCE_BREAK = /((?<=[.!?])\s+|(?<=[。！？])|\n+)/;

/** The reply with any hourly-rate sentence removed and the shop's explanation in front; unchanged when there is none. */
export function hideHourlyRate(text: string, language: string): string {
  const parts = text.split(SENTENCE_BREAK);
  let removed = false;
  let kept = "";
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i] ?? "";
    const separator = parts[i + 1] ?? "";
    if (statesHourlyRate(sentence)) {
      removed = true;
      continue;
    }
    kept += sentence + separator;
  }
  if (!removed) return text;
  const rest = kept.trim();
  return rest ? `${hourlyRateAnswer(language)}\n\n${rest}` : hourlyRateAnswer(language);
}
