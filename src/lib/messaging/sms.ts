/**
 * SMS through Twilio, the fallback when a customer's phone isn't on WhatsApp.
 * Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM (a number or
 * messaging service in Canada). Every message is one staff confirmed, and
 * carries the opt-out line CASL asks for. Numbers and tokens are never logged.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SendResult } from "./whatsapp";

export interface SmsConfig {
  accountSid: string;
  authToken: string;
  from: string;
}

export function smsConfig(env: NodeJS.ProcessEnv = process.env): SmsConfig | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const from = env.TWILIO_FROM?.trim();
  return accountSid && authToken && from ? { accountSid, authToken, from } : null;
}

export const SMS_FOOTER = "\n回复 STOP 不再接收 / Reply STOP to opt out";

export async function sendSms(config: SmsConfig, to: string, text: string, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  try {
    const body = new URLSearchParams({ To: to, Body: `${text}${SMS_FOOTER}`.slice(0, 1500) });
    // A messaging service id (MG…) goes in MessagingServiceSid, a number in From.
    body.set(config.from.startsWith("MG") ? "MessagingServiceSid" : "From", config.from);
    const response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await response.json().catch(() => null)) as { sid?: string; code?: number; message?: string } | null;
    if (response.ok && data?.sid) return { ok: true, id: data.sid };
    return { ok: false, code: data?.code ?? null, reason: (data?.message ?? `HTTP ${response.status}`).slice(0, 160) };
  } catch (error) {
    return { ok: false, code: null, reason: error instanceof Error ? error.name : "network" };
  }
}

/** Twilio signs the full URL plus the sorted form fields with the auth token (X-Twilio-Signature, HMAC-SHA1, base64). */
export function validTwilioSignature(url: string, params: Record<string, string>, header: string | null, authToken: string): boolean {
  if (!authToken || !header) return false;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const expected = createHmac("sha1", authToken).update(data).digest();
  const given = Buffer.from(header, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
