/**
 * Phone numbers as customers type them on the website form, turned into the
 * E.164 form WhatsApp and SMS want. Ten digits (or eleven starting with 1)
 * are North American; anything with a leading + keeps its country code.
 */
export function toE164(raw: string): string | null {
  const text = raw.trim();
  const digits = text.replace(/\D/g, "");
  if (text.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** Whether two phone numbers written differently are the same line. */
export function samePhone(a: string, b: string): boolean {
  const x = toE164(a);
  return x !== null && x === toE164(b);
}

/** Words that mean "stop messaging me", in the languages the shop's customers write. */
const STOP = /^\s*(stop|stopall|unsubscribe|cancel|end|quit|退订|取消订阅|取消|停止|不要再发|退訂|取消訂閱|停止發送|不要再發)\s*[.!。！]*\s*$/i;
export const isStopWord = (text: string): boolean => STOP.test(text);
