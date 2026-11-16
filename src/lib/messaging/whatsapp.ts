/**
 * WhatsApp Business Platform (Meta Cloud API), used for staff-confirmed
 * messages to website customers (2026-11-16). Nothing here runs until the
 * environment is set:
 *   WHATSAPP_TOKEN             system-user access token
 *   WHATSAPP_PHONE_NUMBER_ID   the business number's id
 *   WHATSAPP_APP_SECRET        checks the webhook's signature
 *   WHATSAPP_VERIFY_TOKEN      any string, repeated in Meta's webhook setup
 *   WHATSAPP_TEMPLATE_NAME     approved template for starting a conversation
 *                              (body: two variables, the customer's name and the message)
 *   WHATSAPP_TEMPLATE_LANG     its language code, default "en"
 * Tokens and phone numbers are never logged.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const GRAPH = "https://graph.facebook.com/v21.0";

export interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
  appSecret: string;
  verifyToken: string;
  templateName: string;
  templateLang: string;
}

export function whatsappConfig(env: NodeJS.ProcessEnv = process.env): WhatsAppConfig | null {
  const token = env.WHATSAPP_TOKEN?.trim();
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) return null;
  return {
    token,
    phoneNumberId,
    appSecret: env.WHATSAPP_APP_SECRET?.trim() ?? "",
    verifyToken: env.WHATSAPP_VERIFY_TOKEN?.trim() ?? "",
    templateName: env.WHATSAPP_TEMPLATE_NAME?.trim() ?? "",
    templateLang: env.WHATSAPP_TEMPLATE_LANG?.trim() || "en",
  };
}

export type SendResult = { ok: true; id: string } | { ok: false; code: number | null; reason: string };

/** Meta's error codes that mean "this number can't receive WhatsApp messages". */
export const NOT_ON_WHATSAPP = new Set([131026]);

async function post(config: WhatsAppConfig, body: Record<string, unknown>, fetchImpl: typeof fetch): Promise<SendResult> {
  try {
    const response = await fetchImpl(`${GRAPH}/${encodeURIComponent(config.phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await response.json().catch(() => null)) as { messages?: Array<{ id?: string }>; error?: { code?: number; message?: string } } | null;
    const id = data?.messages?.[0]?.id;
    if (response.ok && id) return { ok: true, id };
    // Meta's own words, shortened; they carry no account details.
    return { ok: false, code: data?.error?.code ?? null, reason: (data?.error?.message ?? `HTTP ${response.status}`).slice(0, 160) };
  } catch (error) {
    return { ok: false, code: null, reason: error instanceof Error ? error.name : "network" };
  }
}

/** A free-form message: allowed only within 24 hours of the customer's last message. */
export function sendWhatsAppText(config: WhatsAppConfig, to: string, text: string, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  return post(config, { to: to.replace(/^\+/, ""), type: "text", text: { body: text, preview_url: false } }, fetchImpl);
}

/** The template that opens a conversation; its two variables can't hold line breaks. */
export function sendWhatsAppTemplate(config: WhatsAppConfig, to: string, name: string, message: string, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const flat = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 900);
  return post(
    config,
    {
      to: to.replace(/^\+/, ""),
      type: "template",
      template: {
        name: config.templateName,
        language: { code: config.templateLang },
        components: [{ type: "body", parameters: [{ type: "text", text: flat(name) || "there" }, { type: "text", text: flat(message) }] }],
      },
    },
    fetchImpl,
  );
}

/** Meta signs every webhook with the app secret: X-Hub-Signature-256: sha256=<hmac of the raw body>. */
export function validSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export interface InboundMessage {
  kind: "message";
  id: string;
  /** E.164 with a leading +. */
  from: string;
  at: number;
  text: string;
}

export interface StatusReport {
  kind: "status";
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  code: number | null;
  reason: string;
}

const TYPE_NOTE: Record<string, string> = {
  image: "图片",
  audio: "语音",
  video: "视频",
  document: "文件",
  sticker: "贴纸",
  location: "位置",
  contacts: "名片",
};

/** What the webhook delivered: customers' messages and delivery reports. Unknown shapes are ignored. */
export function parseWebhook(body: unknown): Array<InboundMessage | StatusReport> {
  const out: Array<InboundMessage | StatusReport> = [];
  const entries = (body as { entry?: unknown[] } | null)?.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    for (const change of ((entry as { changes?: unknown[] })?.changes ?? []) as Array<{ value?: Record<string, unknown> }>) {
      const value = change?.value;
      if (!value) continue;
      for (const m of (Array.isArray(value.messages) ? value.messages : []) as Array<Record<string, unknown>>) {
        if (typeof m.id !== "string" || typeof m.from !== "string") continue;
        const type = typeof m.type === "string" ? m.type : "text";
        const text =
          type === "text"
            ? String((m.text as { body?: unknown } | undefined)?.body ?? "")
            : type === "button"
              ? String((m.button as { text?: unknown } | undefined)?.text ?? "")
              : `（客人发来了${TYPE_NOTE[type] ?? "一条非文字消息"}，请到 WhatsApp 里查看）`;
        out.push({ kind: "message", id: m.id, from: `+${m.from.replace(/\D/g, "")}`, at: (Number(m.timestamp) || Math.floor(Date.now() / 1000)) * 1000, text: text.slice(0, 2000) });
      }
      for (const s of (Array.isArray(value.statuses) ? value.statuses : []) as Array<Record<string, unknown>>) {
        const status = s.status;
        if (typeof s.id !== "string" || (status !== "sent" && status !== "delivered" && status !== "read" && status !== "failed")) continue;
        const error = (Array.isArray(s.errors) ? s.errors[0] : null) as { code?: number; title?: string } | null;
        out.push({ kind: "status", id: s.id, status, code: typeof error?.code === "number" ? error.code : null, reason: String(error?.title ?? "").slice(0, 120) });
      }
    }
  }
  return out;
}
