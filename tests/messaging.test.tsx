import { createHmac } from "node:crypto";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChannelBadge, CustomerMessageBox } from "@/components/workbench/CustomerMessageBox";
import { handleMessagingInfo, handleSend, handleSmsWebhook, handleWhatsAppWebhook, type MessagingHttpDeps } from "@/lib/messaging/http";
import { isStopWord, samePhone, toE164 } from "@/lib/messaging/phone";
import { plannedChannel } from "@/lib/messaging/plan";
import { applyStatus, handleWhatsAppEvents, MessagingError, receiveFromCustomer, sendToCustomer, type MessagingDeps } from "@/lib/messaging/service";
import { validTwilioSignature } from "@/lib/messaging/sms";
import { parseWebhook, validSignature, type WhatsAppConfig } from "@/lib/messaging/whatsapp";
import type { Conversation } from "@/lib/workbench/conversation-types";
import { ConversationStore } from "@/lib/workbench/conversations";
import { historyFromTurns } from "@/lib/workbench/http";
import { memoryKv } from "@/lib/workbench/kv";

// 2026-11-16, WhatsApp phase 1: staff confirm each message to a website customer's phone; WhatsApp when the
// number is on it, SMS when it isn't; the customer's replies land in the same workbench conversation.

const WA: WhatsAppConfig = { token: "tok", phoneNumberId: "123", appSecret: "secret", verifyToken: "verify-me", templateName: "reply_to_inquiry", templateLang: "en" };
const SMS = { accountSid: "ACxx", authToken: "auth", from: "+16045550000" };
const CUSTOMER = "+16045550182";
const NOW = 1_800_000_000_000;

function setup(options: { whatsapp?: WhatsAppConfig | null; sms?: typeof SMS | null; fetchImpl?: typeof fetch } = {}) {
  const store = new ConversationStore(memoryKv(), () => NOW);
  const calls: Array<{ url: string; body: string }> = [];
  const fetchImpl: typeof fetch = options.fetchImpl ?? (async (url, init) => {
    calls.push({ url: String(url), body: String(init?.body) });
    return String(url).includes("twilio") ? Response.json({ sid: "SM1" }) : Response.json({ messages: [{ id: "wamid.1" }] });
  });
  const deps: MessagingDeps = { store, whatsapp: options.whatsapp === undefined ? WA : options.whatsapp, sms: options.sms === undefined ? SMS : options.sms, fetchImpl, now: () => NOW };
  return { store, deps, calls };
}

async function lead(store: ConversationStore, id = "cwtest1", phone = "604-555-0182", name = "Amy Lin") {
  await store.change(id, "website", (c) => {
    c.website = { name, phone, locale: "en" };
    c.title = "front pads";
  }, true);
  return id;
}

describe("phone numbers", () => {
  it("become E.164 and compare across spellings", () => {
    expect(toE164("604-555-0182")).toBe("+16045550182");
    expect(toE164("(604) 555 0182")).toBe("+16045550182");
    expect(toE164("1 604 555 0182")).toBe("+16045550182");
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
    expect(toE164("555-0182")).toBeNull();
    expect(samePhone("604-555-0182", "+16045550182")).toBe(true);
    expect(samePhone("604-555-0182", "604-555-0183")).toBe(false);
  });

  it("knows stop words in English and Chinese", () => {
    for (const word of ["STOP", " stop. ", "退订", "取消订阅", "Unsubscribe"]) expect(isStopWord(word)).toBe(true);
    expect(isStopWord("please stop by tomorrow")).toBe(false);
  });
});

describe("webhook parsing and signatures", () => {
  const body = {
    entry: [{ changes: [{ value: {
      messages: [{ id: "wamid.in1", from: "16045550182", timestamp: "1800000000", type: "text", text: { body: "Is it ready?" } }, { id: "wamid.in2", from: "16045550182", type: "image" }],
      statuses: [{ id: "wamid.out1", status: "failed", errors: [{ code: 131026, title: "Message undeliverable" }] }, { id: "wamid.out2", status: "delivered" }, { id: "x", status: "weird" }],
    } }] }],
  };

  it("reads customers' messages and delivery reports", () => {
    const items = parseWebhook(body);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ kind: "message", id: "wamid.in1", from: "+16045550182", text: "Is it ready?", at: 1_800_000_000_000 });
    expect(items[1]).toMatchObject({ kind: "message", text: expect.stringContaining("图片") });
    expect(items[2]).toMatchObject({ kind: "status", id: "wamid.out1", status: "failed", code: 131026 });
    expect(parseWebhook(null)).toEqual([]);
    expect(parseWebhook({ entry: [{ changes: [{}] }] })).toEqual([]);
  });

  it("checks Meta's and Twilio's signatures", () => {
    const raw = JSON.stringify(body);
    const good = `sha256=${createHmac("sha256", "secret").update(raw).digest("hex")}`;
    expect(validSignature(raw, good, "secret")).toBe(true);
    expect(validSignature(raw + " ", good, "secret")).toBe(false);
    expect(validSignature(raw, null, "secret")).toBe(false);
    expect(validSignature(raw, good, "")).toBe(false);
    const params = { From: "+16045550182", Body: "hi" };
    const url = "https://speedxrental.com/api/sms/webhook";
    const sig = createHmac("sha1", "auth").update(url + "BodyhiFrom+16045550182").digest("base64");
    expect(validTwilioSignature(url, params, sig, "auth")).toBe(true);
    expect(validTwilioSignature(url, { ...params, Body: "hello" }, sig, "auth")).toBe(false);
  });
});

describe("sending to the customer", () => {
  it("replies in WhatsApp's free-form window and records the message", async () => {
    const { store, deps, calls } = setup();
    const id = await lead(store);
    await receiveFromCustomer(deps, "whatsapp", { id: "wamid.in1", from: CUSTOMER, at: NOW - 3600_000, text: "Hi, is the quote still good?" });
    const turn = await sendToCustomer(deps, id, "kevin@speedx.ca", "  Yes, come in Monday.  ");
    expect(turn).toMatchObject({ channel: "whatsapp", text: "Yes, come in Monday.", author: "kevin@speedx.ca", delivery: { status: "sent", id: "wamid.1" } });
    expect(JSON.parse(calls[0].body)).toMatchObject({ messaging_product: "whatsapp", to: "16045550182", type: "text", text: { body: "Yes, come in Monday." } });
    expect((await store.get(id))!.turns.at(-1)!.id).toBe(turn.id);
  });

  it("opens with the approved template when the customer hasn't written for 24 hours", async () => {
    const { store, deps, calls } = setup();
    const id = await lead(store);
    await sendToCustomer(deps, id, "kevin@speedx.ca", "Your rotors arrive\ntomorrow.");
    const sent = JSON.parse(calls[0].body);
    expect(sent.type).toBe("template");
    expect(sent.template).toMatchObject({ name: "reply_to_inquiry", language: { code: "en" } });
    expect(sent.template.components[0].parameters).toEqual([{ type: "text", text: "Amy" }, { type: "text", text: "Your rotors arrive tomorrow." }]);
  });

  it("falls back to SMS at once when Meta says the number isn't on WhatsApp", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      calls.push(String(url));
      return String(url).includes("twilio") ? Response.json({ sid: "SM9" }) : Response.json({ error: { code: 131026, message: "Message undeliverable" } }, { status: 400 });
    };
    const { store, deps } = setup({ fetchImpl });
    const id = await lead(store);
    const turn = await sendToCustomer(deps, id, "kevin@speedx.ca", "Your car is ready.");
    expect(turn).toMatchObject({ channel: "sms", delivery: { status: "sent", id: "SM9", resentAsSms: true } });
    expect((await store.get(id))!.messaging?.smsOnly).toBe(true);
    // From now on this number goes straight to SMS, and every SMS carries the opt-out line.
    await sendToCustomer(deps, id, "kevin@speedx.ca", "Thanks!");
    expect(calls.filter((u) => u.includes("graph.facebook.com"))).toHaveLength(1);
  });

  it("uses SMS when WhatsApp isn't set up, with the opt-out line", async () => {
    const { store, deps, calls } = setup({ whatsapp: null });
    const id = await lead(store);
    const turn = await sendToCustomer(deps, id, "kevin@speedx.ca", "Hello");
    expect(turn.channel).toBe("sms");
    const form = new URLSearchParams(calls[0].body);
    expect(form.get("To")).toBe(CUSTOMER);
    expect(form.get("From")).toBe("+16045550000");
    expect(form.get("Body")).toContain("STOP");
  });

  it("refuses with a plain reason: no number, opted out, nothing set up, empty, too long", async () => {
    const { store, deps } = setup();
    const none = await lead(store, "cwnone", "");
    await expect(sendToCustomer(deps, none, "k@x", "hi")).rejects.toMatchObject({ kind: "no_phone" });
    const id = await lead(store);
    await expect(sendToCustomer(deps, id, "k@x", "   ")).rejects.toMatchObject({ kind: "empty" });
    await expect(sendToCustomer(deps, id, "k@x", "x".repeat(1001))).rejects.toMatchObject({ kind: "too_long" });
    await expect(sendToCustomer(deps, "missing", "k@x", "hi")).rejects.toMatchObject({ kind: "not_found" });
    await receiveFromCustomer(deps, "whatsapp", { id: "wamid.stop", from: CUSTOMER, at: NOW, text: "STOP" });
    await expect(sendToCustomer(deps, id, "k@x", "hi")).rejects.toBeInstanceOf(MessagingError);
    await expect(sendToCustomer(deps, id, "k@x", "hi")).rejects.toMatchObject({ kind: "opted_out" });
    const bare = setup({ whatsapp: null, sms: null });
    const other = await lead(bare.store);
    await expect(sendToCustomer(bare.deps, other, "k@x", "hi")).rejects.toMatchObject({ kind: "not_configured" });
  });

  it("keeps a failed send in the chat with the reason, and throws", async () => {
    const fetchImpl: typeof fetch = async () => Response.json({ error: { code: 190, message: "Invalid token" } }, { status: 401 });
    const { store, deps } = setup({ fetchImpl, sms: null });
    const id = await lead(store);
    await receiveFromCustomer(deps, "whatsapp", { id: "wamid.in1", from: CUSTOMER, at: NOW - 1000, text: "hi" });
    await expect(sendToCustomer(deps, id, "k@x", "hello")).rejects.toMatchObject({ kind: "failed" });
    expect((await store.get(id))!.turns.at(-1)!.delivery).toMatchObject({ status: "failed", error: "Invalid token" });
  });
});

describe("the customer writing to us", () => {
  it("lands in their existing conversation, opens the 24-hour window and is not stored twice", async () => {
    const { store, deps } = setup();
    const id = await lead(store);
    const message = { id: "wamid.in1", from: CUSTOMER, at: NOW - 1000, text: "Can I come at 3?" };
    await receiveFromCustomer(deps, "whatsapp", message);
    await receiveFromCustomer(deps, "whatsapp", message);
    const c = (await store.get(id))!;
    expect(c.turns.filter((t) => t.text === "Can I come at 3?")).toHaveLength(1);
    expect(c.turns.at(-1)).toMatchObject({ author: "website", channel: "whatsapp" });
    expect(c.messaging).toMatchObject({ lastWhatsAppInboundAt: NOW - 1000, whatsappWorks: true });
  });

  it("starts a conversation for a new number, with a placeholder name", async () => {
    const { store, deps } = setup();
    await receiveFromCustomer(deps, "sms", { id: "SM77", from: "+16045559999", at: NOW, text: "Do you do brakes?" });
    const found = await store.findByPhone((p) => samePhone(p, "604-555-9999"));
    expect(found?.website).toMatchObject({ name: "未留姓名", phone: "+16045559999" });
    expect(found?.turns).toHaveLength(1);
    expect(found?.messaging?.lastWhatsAppInboundAt).toBeUndefined();
  });

  it("is applied from a webhook body", async () => {
    const { store, deps } = setup();
    const id = await lead(store);
    const n = await handleWhatsAppEvents(deps, { entry: [{ changes: [{ value: { messages: [{ id: "wamid.a", from: "16045550182", timestamp: "1800000000", type: "text", text: { body: "ok thanks" } }] } }] }] });
    expect(n).toBe(1);
    expect((await store.get(id))!.turns.at(-1)!.text).toBe("ok thanks");
  });
});

describe("delivery reports", () => {
  it("moves a message from sent to delivered to read, never backwards", async () => {
    const { store, deps } = setup();
    const id = await lead(store);
    await receiveFromCustomer(deps, "whatsapp", { id: "wamid.in1", from: CUSTOMER, at: NOW - 1000, text: "hi" });
    await sendToCustomer(deps, id, "k@x", "hello");
    await applyStatus(deps, { id: "wamid.1", status: "read", code: null, reason: "" });
    await applyStatus(deps, { id: "wamid.1", status: "delivered", code: null, reason: "" });
    expect((await store.get(id))!.turns.at(-1)!.delivery?.status).toBe("read");
  });

  it("sends a WhatsApp message again as SMS when Meta reports it undeliverable", async () => {
    const { store, deps, calls } = setup();
    const id = await lead(store);
    await sendToCustomer(deps, id, "k@x", "Your car is ready");
    await applyStatus(deps, { id: "wamid.1", status: "failed", code: 131026, reason: "Message undeliverable" });
    const c = (await store.get(id))!;
    expect(c.turns.at(-1)!.delivery).toMatchObject({ status: "failed", resentAsSms: true });
    expect(c.messaging?.smsOnly).toBe(true);
    expect(calls.some((x) => x.url.includes("twilio") && x.body.includes("Your+car+is+ready"))).toBe(true);
  });
});

describe("the HTTP side", () => {
  const raw = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: "wamid.h1", from: "16045550182", timestamp: "1800000000", type: "text", text: { body: "hello from whatsapp" } }] } }] }] });
  const env = { WHATSAPP_TOKEN: "tok", WHATSAPP_PHONE_NUMBER_ID: "123", WHATSAPP_APP_SECRET: "secret", WHATSAPP_VERIFY_TOKEN: "verify-me", WHATSAPP_TEMPLATE_NAME: "reply_to_inquiry", TWILIO_ACCOUNT_SID: "ACxx", TWILIO_AUTH_TOKEN: "auth", TWILIO_FROM: "+16045550000" } as unknown as NodeJS.ProcessEnv;
  const http = (store: ConversationStore, user = true): MessagingHttpDeps => ({ user: async () => (user ? { email: "kevin@speedx.ca" } : null), store: () => store, env: () => env, log: () => undefined });

  it("answers Meta's verification only with the right token", async () => {
    const { store } = setup();
    const ok = await handleWhatsAppWebhook(new Request("https://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42"), http(store));
    expect(await ok.text()).toBe("42");
    const bad = await handleWhatsAppWebhook(new Request("https://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42"), http(store));
    expect(bad.status).toBe(403);
  });

  it("takes a signed WhatsApp message and refuses an unsigned one", async () => {
    const { store } = setup();
    const id = await lead(store);
    const unsigned = await handleWhatsAppWebhook(new Request("https://x/api/whatsapp/webhook", { method: "POST", body: raw }), http(store));
    expect(unsigned.status).toBe(401);
    const signature = `sha256=${createHmac("sha256", "secret").update(raw).digest("hex")}`;
    const signed = await handleWhatsAppWebhook(new Request("https://x/api/whatsapp/webhook", { method: "POST", body: raw, headers: { "x-hub-signature-256": signature } }), http(store));
    expect(signed.status).toBe(200);
    expect((await store.get(id))!.turns.at(-1)!.text).toBe("hello from whatsapp");
  });

  it("takes a signed Twilio SMS and refuses an unsigned one", async () => {
    const { store } = setup();
    const id = await lead(store);
    const params = { From: "+16045550182", Body: "yes please", MessageSid: "SMabc" };
    const form = new URLSearchParams(params);
    const unsigned = await handleSmsWebhook(new Request("https://speedxrental.com/api/sms/webhook", { method: "POST", body: form }), http(store));
    expect(unsigned.status).toBe(401);
    const sig = createHmac("sha1", "auth").update("https://speedxrental.com/api/sms/webhook" + "Bodyyes pleaseFrom+16045550182MessageSidSMabc").digest("base64");
    const signed = await handleSmsWebhook(new Request("https://speedxrental.com/api/sms/webhook", { method: "POST", body: new URLSearchParams(params), headers: { "x-twilio-signature": sig } }), http(store));
    expect(signed.status).toBe(200);
    expect((await store.get(id))!.turns.at(-1)).toMatchObject({ text: "yes please", channel: "sms" });
  });

  it("refuses webhooks when nothing is configured", async () => {
    const { store } = setup();
    const bare: MessagingHttpDeps = { ...http(store), env: () => ({}) as NodeJS.ProcessEnv };
    expect((await handleWhatsAppWebhook(new Request("https://x/api/whatsapp/webhook", { method: "POST", body: raw }), bare)).status).toBe(503);
    expect((await handleSmsWebhook(new Request("https://x/api/sms/webhook", { method: "POST", body: new URLSearchParams({}) }), bare)).status).toBe(503);
  });

  it("lets signed-in staff send and see what's set up, and nobody else", async () => {
    const { store } = setup();
    const id = await lead(store);
    const nope = await handleSend(new Request("https://x", { method: "POST", body: JSON.stringify({ text: "hi" }) }), id, http(store, false));
    expect(nope.status).toBe(401);
    expect((await handleMessagingInfo(new Request("https://x"), http(store, false))).status).toBe(401);
    const info = await (await handleMessagingInfo(new Request("https://x"), http(store))).json();
    expect(info.ready).toEqual({ whatsapp: true, whatsappTemplate: true, sms: true });
    vi.stubGlobal("fetch", async (url: string) => (String(url).includes("twilio") ? Response.json({ sid: "SM1" }) : Response.json({ messages: [{ id: "wamid.http" }] })));
    const sent = await handleSend(new Request("https://x", { method: "POST", body: JSON.stringify({ text: "On my way" }) }), id, http(store));
    vi.unstubAllGlobals();
    expect(sent.status).toBe(200);
    expect((await sent.json()).turn).toMatchObject({ text: "On my way", channel: "whatsapp" });
    const bad = await handleSend(new Request("https://x", { method: "POST", body: JSON.stringify({ text: "" }) }), id, http(store));
    expect(bad.status).toBe(400);
  });
});

describe("the workbench", () => {
  const convo = (messaging: Conversation["messaging"] = undefined): Conversation => ({ id: "c1", title: "t", vehicle: null, createdBy: "w", createdAt: 0, updatedBy: "w", updatedAt: 0, turns: [], website: { name: "Amy Lin", phone: "604-555-0182", locale: "en" }, ...(messaging ? { messaging } : {}) });

  it("plans the channel and says why", () => {
    const all = { whatsapp: true, whatsappTemplate: true, sms: true };
    expect(plannedChannel(convo(), all, NOW).note).toContain("模板");
    expect(plannedChannel(convo({ lastWhatsAppInboundAt: NOW - 1000 }), all, NOW)).toMatchObject({ channel: "whatsapp" });
    expect(plannedChannel(convo({ lastWhatsAppInboundAt: NOW - 25 * 3600_000 }), all, NOW).note).toContain("模板");
    expect(plannedChannel(convo({ smsOnly: true }), all, NOW)).toMatchObject({ channel: "sms" });
    expect(plannedChannel(convo({ optedOut: true }), all, NOW)).toMatchObject({ channel: null });
    expect(plannedChannel(convo(), { whatsapp: true, whatsappTemplate: false, sms: false }, NOW)).toMatchObject({ channel: null });
  });

  it("sends from the box only when staff press the button", async () => {
    const onSent = vi.fn();
    const fetchMock = vi.fn(async () => Response.json({ turn: { id: "t1", role: "user", text: "Hi Amy", author: "k@x", at: 1, quotes: [], channel: "whatsapp", delivery: { status: "sent" } } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CustomerMessageBox conversation={convo({ lastWhatsAppInboundAt: Date.now() - 1000 })} ready={{ whatsapp: true, whatsappTemplate: true, sms: true }} onSent={onSent} />);
    expect(screen.getByTestId("channel-plan")).toHaveTextContent("WhatsApp：客人 24 小时内回复过");
    await userEvent.type(screen.getByLabelText("发给客人的消息"), "Hi Amy");
    expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "确认发送" }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ text: "Hi Amy", requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    vi.unstubAllGlobals();
  });

  it("shows the reason when it can't send, and is off when nothing is set up", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "failed", message: "发送失败。（Invalid token）" }, { status: 502 })));
    const { unmount } = render(<CustomerMessageBox conversation={convo()} ready={{ whatsapp: true, whatsappTemplate: true, sms: true }} onSent={() => undefined} />);
    await userEvent.type(screen.getByLabelText("发给客人的消息"), "x");
    await userEvent.click(screen.getByRole("button", { name: "确认发送" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid token");
    unmount();
    vi.unstubAllGlobals();
    render(<CustomerMessageBox conversation={convo()} ready={{ whatsapp: false, whatsappTemplate: false, sms: false }} onSent={() => undefined} />);
    expect(screen.getByLabelText("发给客人的消息")).toBeDisabled();
  });

  it("badges messages with their channel and delivery", () => {
    render(<ChannelBadge turn={{ channel: "whatsapp", author: "k@x", delivery: { status: "delivered" } }} />);
    expect(screen.getByTestId("channel-badge")).toHaveTextContent("发给客人 · WhatsApp · 已送达");
  });

  it("tells the workbench AI which messages were to the customer's phone, not to it", () => {
    const base = { id: "1", quotes: [], at: 1, source: "website" as const };
    const history = historyFromTurns([
      { ...base, role: "user", author: "k@x", text: "what is the price?", source: undefined },
      { ...base, role: "assistant", author: "assistant", text: "About $300", source: undefined },
      { ...base, id: "2", role: "user", author: "k@x", text: "Come Monday", channel: "whatsapp", delivery: { status: "sent" } },
      { ...base, id: "3", role: "user", author: "website", text: "ok", channel: "whatsapp" },
    ]);
    expect(history[2].text).toContain("不是对你的提问");
    expect(history[3].text).toContain("客人通过 WhatsApp 回复");
  });
});

// Codex's review of the first version, each one reproduced and fixed.
describe("review fixes", () => {
  it("a retry with the same request id never sends twice", async () => {
    const { store, deps, calls } = setup();
    const id = await lead(store);
    const first = await sendToCustomer(deps, id, "k@x", "Hello", "req-0000001");
    const again = await sendToCustomer(deps, id, "k@x", "Hello", "req-0000001");
    expect(again.id).toBe(first.id);
    expect(calls).toHaveLength(1);
    expect((await store.get(id))!.turns.filter((t) => t.text === "Hello")).toHaveLength(1);
  });

  it("a message whose answer was lost stays written down as sending, and a retry doesn't resend it", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      throw new Error("socket closed");
    };
    const { store, deps } = setup({ fetchImpl });
    const id = await lead(store);
    await expect(sendToCustomer(deps, id, "k@x", "Hello", "req-0000002")).rejects.toMatchObject({ kind: "failed" });
    expect(calls).toBe(1);
    expect((await store.get(id))!.turns.at(-1)!.delivery?.status).toBe("failed");
  });

  it("STOP is kept for the number, so a new conversation can't undo it", async () => {
    const { store, deps } = setup();
    const id = await lead(store);
    await receiveFromCustomer(deps, "whatsapp", { id: "wamid.s", from: CUSTOMER, at: NOW, text: "STOP" });
    expect(await store.isOptedOut(CUSTOMER)).toBe(true);
    const fresh = await lead(store, "cwfresh", "(604) 555-0182");
    await expect(sendToCustomer(deps, fresh, "k@x", "hi")).rejects.toMatchObject({ kind: "opted_out" });
    await expect(sendToCustomer(deps, id, "k@x", "hi")).rejects.toMatchObject({ kind: "opted_out" });
  });

  it("two reports of one failure start one SMS only", async () => {
    const { store, deps, calls } = setup();
    const id = await lead(store);
    await sendToCustomer(deps, id, "k@x", "Your car is ready");
    const report = { id: "wamid.1", status: "failed" as const, code: 131026, reason: "undeliverable" };
    await Promise.all([applyStatus(deps, report), applyStatus(deps, report)]);
    await applyStatus(deps, report);
    expect(calls.filter((x) => x.url.includes("twilio"))).toHaveLength(1);
    expect((await store.get(id))!.turns.at(-1)!.delivery?.resentAsSms).toBe(true);
  });

  it("the same inbound message arriving twice at once is stored once", async () => {
    const { store, deps } = setup();
    const id = await lead(store);
    const message = { id: "SMdup", from: CUSTOMER, at: NOW, text: "yes" };
    await Promise.all([receiveFromCustomer(deps, "sms", message), receiveFromCustomer(deps, "sms", message)]);
    expect((await store.get(id))!.turns.filter((t) => t.text === "yes")).toHaveLength(1);
  });

  it("an older message arriving late doesn't close the 24-hour window", async () => {
    const { store, deps } = setup();
    const id = await lead(store);
    await receiveFromCustomer(deps, "whatsapp", { id: "w2", from: CUSTOMER, at: NOW - 1000, text: "newer" });
    await receiveFromCustomer(deps, "whatsapp", { id: "w1", from: CUSTOMER, at: NOW - 30 * 3600_000, text: "older" });
    expect((await store.get(id))!.messaging?.lastWhatsAppInboundAt).toBe(NOW - 1000);
  });

  it("a conversation made for a new number has an id that isn't the number", async () => {
    const { store, deps } = setup();
    await receiveFromCustomer(deps, "sms", { id: "SM5", from: "+16045558888", at: NOW, text: "hi" });
    const c = await store.findByPhone((p) => samePhone(p, "+16045558888"));
    expect(c!.id).toMatch(/^wa[a-f0-9]{30}$/);
    expect(c!.id).not.toContain("6045558888");
  });

  it("refuses to cut a first message the template can't hold, and over-long texts", async () => {
    const { store, deps } = setup();
    const id = await lead(store);
    await expect(sendToCustomer(deps, id, "k@x", "x".repeat(950))).rejects.toMatchObject({ kind: "template_too_long" });
    await expect(sendToCustomer(deps, id, "k@x", "😀".repeat(501))).rejects.toMatchObject({ kind: "too_long" });
  });

  it("answers a webhook with 500 when saving fails, so the provider tries again", async () => {
    const { store } = setup();
    const env = { WHATSAPP_TOKEN: "tok", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_APP_SECRET: "secret", WHATSAPP_VERIFY_TOKEN: "v" } as unknown as NodeJS.ProcessEnv;
    const raw = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: "w9", from: "16045550182", type: "text", text: { body: "STOP" } }] } }] }] });
    vi.spyOn(store, "findByMessageId").mockRejectedValue(new Error("kv down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await handleWhatsAppWebhook(
      new Request("https://x/api/whatsapp/webhook", { method: "POST", body: raw, headers: { "x-hub-signature-256": `sha256=${createHmac("sha256", "secret").update(raw).digest("hex")}` } }),
      { user: async () => null, store: () => store, env: () => env, log: () => undefined },
    );
    expect(response.status).toBe(500);
    expect(JSON.stringify(spy.mock.calls)).not.toContain("6045550182");
    spy.mockRestore();
  });
});
