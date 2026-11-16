/**
 * HTTP side of staff ↔ customer messaging:
 *   GET/POST /api/whatsapp/webhook   Meta: verification, customers' messages, delivery reports
 *   POST     /api/sms/webhook        Twilio: a customer's SMS reply
 *   POST     /api/workbench/conversations/:id/send   staff confirm a message to the customer
 *   GET      /api/workbench/messaging                which channels are set up
 * The two webhooks are public but check the provider's signature, and refuse when it is missing.
 */
import { staffUser, type StaffUser } from "@/lib/workbench/access";
import { getConversationStore, type ConversationStore } from "@/lib/workbench/conversations";
import { toE164 } from "./phone";
import { channelsReady, handleWhatsAppEvents, MessagingError, receiveFromCustomer, sendToCustomer, type MessagingDeps } from "./service";
import { smsConfig, validTwilioSignature } from "./sms";
import { validSignature, whatsappConfig } from "./whatsapp";

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

export interface MessagingHttpDeps {
  user: (request: Request) => Promise<StaffUser | null>;
  store: () => ConversationStore | null;
  env: () => NodeJS.ProcessEnv;
  log: (entry: Record<string, unknown>) => void;
}

const defaultDeps: MessagingHttpDeps = {
  user: (request) => staffUser(request.headers),
  store: () => getConversationStore(),
  env: () => process.env,
  log: (entry) => console.info("messaging", JSON.stringify(entry)),
};

const depsFor = (store: ConversationStore, env: NodeJS.ProcessEnv): MessagingDeps => ({ store, whatsapp: whatsappConfig(env), sms: smsConfig(env) });

/** Meta's webhook: GET answers its verification, POST carries messages and delivery reports. */
export async function handleWhatsAppWebhook(request: Request, deps: MessagingHttpDeps = defaultDeps): Promise<Response> {
  const env = deps.env();
  const config = whatsappConfig(env);
  if (request.method === "GET") {
    const url = new URL(request.url);
    const ok = config?.verifyToken && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === config.verifyToken;
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain", ...NO_STORE } }) : new Response(null, { status: 403 });
  }
  if (!config || !config.appSecret) return new Response(null, { status: 503 });
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"), config.appSecret)) return new Response(null, { status: 401 });
  const store = deps.store();
  if (!store) return new Response(null, { status: 503 });
  try {
    const handled = await handleWhatsAppEvents(depsFor(store, env), JSON.parse(raw));
    deps.log({ action: "whatsapp_webhook", handled });
  } catch (error) {
    // Never the body or numbers; Meta would retry a failure for hours, so answer 200 after logging.
    console.error("whatsapp webhook failed", error instanceof Error ? error.message.slice(0, 160) : "unknown");
  }
  return new Response(null, { status: 200 });
}

const TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/** Twilio's webhook for a customer's SMS reply (no automatic answer). */
export async function handleSmsWebhook(request: Request, deps: MessagingHttpDeps = defaultDeps): Promise<Response> {
  const env = deps.env();
  const config = smsConfig(env);
  if (!config) return new Response(null, { status: 503 });
  const form = await request.formData().catch(() => null);
  if (!form) return new Response(null, { status: 400 });
  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === "string") params[key] = value;
  });
  const base = (env.PUBLIC_BASE_URL || "https://speedxrental.com").replace(/\/+$/, "");
  if (!validTwilioSignature(`${base}/api/sms/webhook`, params, request.headers.get("x-twilio-signature"), config.authToken)) return new Response(null, { status: 401 });
  const from = toE164(params.From ?? "");
  const store = deps.store();
  if (!from || !params.MessageSid || !store) return new Response(null, { status: 400 });
  try {
    await receiveFromCustomer(depsFor(store, env), "sms", { id: params.MessageSid, from, at: Date.now(), text: (params.Body ?? "").slice(0, 2000) });
    deps.log({ action: "sms_webhook" });
  } catch (error) {
    console.error("sms webhook failed", error instanceof Error ? error.message.slice(0, 160) : "unknown");
  }
  return new Response(TWIML, { status: 200, headers: { "Content-Type": "text/xml" } });
}

/** Staff confirm a message to the customer's phone. */
export async function handleSend(request: Request, conversationId: string, deps: MessagingHttpDeps = defaultDeps): Promise<Response> {
  const user = await deps.user(request);
  if (!user) return json({ error: "unauthorized" }, 401);
  const store = deps.store();
  if (!store) return json({ error: "not_configured", message: "对话存储没配置。" }, 503);
  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  if (!body || typeof body.text !== "string") return json({ error: "invalid" }, 400);
  try {
    const turn = await sendToCustomer(depsFor(store, deps.env()), conversationId, user.email, body.text);
    deps.log({ action: "send_to_customer", email: user.email, id: conversationId, channel: turn.channel, length: body.text.length });
    return json({ turn });
  } catch (error) {
    if (error instanceof MessagingError) return json({ error: error.kind, message: error.message }, error.kind === "not_found" ? 404 : error.kind === "failed" ? 502 : 400);
    console.error("send to customer failed", error instanceof Error ? error.message.slice(0, 160) : "unknown");
    return json({ error: "upstream", message: "发送失败。" }, 502);
  }
}

/** Which channels are set up (no secrets). */
export async function handleMessagingInfo(request: Request, deps: MessagingHttpDeps = defaultDeps): Promise<Response> {
  if (!(await deps.user(request))) return json({ error: "unauthorized" }, 401);
  const env = deps.env();
  return json({ ready: channelsReady({ whatsapp: whatsappConfig(env), sms: smsConfig(env) }) });
}
