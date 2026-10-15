import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { render, screen } from "@testing-library/react";
import { handleChat, handleLead, type RouteDeps } from "@/lib/repair-chat/http";
import { SessionStore } from "@/lib/repair-chat/session";
import { RateLimiter } from "@/lib/repair-chat/rate-limit";
import type { EstimateCard } from "@/lib/repair-chat/pricing";
import { memoryKv } from "@/lib/workbench/kv";
import { ConversationStore, MAX_CONVERSATIONS } from "@/lib/workbench/conversations";
import { WebsiteInbox, websiteConversationId } from "@/lib/workbench/website-inbox";
import { historyFromTurns } from "@/lib/workbench/http";
import { WebsiteEstimateCard, WebsiteVisitorBar } from "@/components/workbench/WebsiteCards";

const thread = "ab".repeat(16);
const card = {
  id: "E-1A2B3C4D",
  kind: "tires",
  vehicle: "—",
  service: "新轮胎（含安装） · 225/65R17",
  position: "",
  laborHours: 0,
  laborRate: 120,
  laborWalkIn: 0,
  partOptions: [{ description: "Michelin X-ICE SNOW 225/65R17 106T XL", series: "winter", unitListPrice: 280, quantity: 4, total: 1120, inStockLocally: false, note: "" }],
  partsLow: 1120,
  partsHigh: 1120,
  totalLow: 1120,
  totalHigh: 1120,
} as unknown as EstimateCard;

function setup() {
  const store = new ConversationStore(memoryKv());
  return { store, inbox: new WebsiteInbox(store) };
}

describe("website inbox", () => {
  it("saves each question and reply as one website conversation, held until contact is given", async () => {
    const { store, inbox } = setup();
    inbox.asking(thread);
    expect(store.pending.get(websiteConversationId(thread))?.by).toBe("website");
    await inbox.exchange({
      thread,
      contact: { name: "", phone: "", locale: "zh-CN" },
      question: "225/65R17 米其林冬季胎4条多少钱",
      photos: [{ mediaType: "image/jpeg" }],
      reply: "每条 $280",
      estimates: [card],
      held: true,
      vehicle: { key: "k1", label: "2019 Toyota RAV4" },
    });
    const id = websiteConversationId(thread);
    expect(id).toMatch(/^c[a-z0-9]{6,40}$/);
    expect(store.pending.has(id)).toBe(false);
    const saved = await store.get(id);
    expect(saved?.title).toBe("225/65R17 米其林冬季胎4条多少钱");
    expect(saved?.vehicle?.label).toBe("2019 Toyota RAV4");
    expect(saved?.website).toEqual({ name: "", phone: "", locale: "zh-CN" });
    expect(saved?.turns.map((t) => [t.role, t.author, t.source])).toEqual([
      ["user", "website", "website"],
      ["assistant", "assistant", "website"],
    ]);
    expect(saved?.turns[0].attachments).toEqual([{ name: "客人照片 1", mediaType: "image/jpeg" }]);
    expect(saved?.turns[1].estimates).toEqual([card]);
    expect(saved?.turns[1].held).toBe(true);
    expect((await store.list())[0].website).toBe("");

    await inbox.contact(thread, { name: "Amy", phone: "604-555-0182", locale: "zh-CN" });
    const after = await store.get(id);
    expect(after?.website).toMatchObject({ name: "Amy", phone: "604-555-0182" });
    expect(after?.turns.some((t) => t.held)).toBe(false);
    expect((await store.list())[0].website).toBe("Amy");
  });

  it("drops old website chats before staff conversations when over the limit", async () => {
    let clock = 0;
    const store = new ConversationStore(memoryKv(), () => ++clock);
    const inbox = new WebsiteInbox(store);
    const older = "cd".repeat(16);
    await inbox.exchange({ thread: older, contact: { name: "", phone: "", locale: "en" }, question: "q", photos: [], reply: "a", estimates: [], held: false });
    for (let i = 0; i < MAX_CONVERSATIONS - 1; i += 1) await store.append(`cstaff${i}`, "kevin@speedx.ca", [], undefined, `t${i}`);
    // Over the limit twice: both website chats go, even the newest, and every staff one stays.
    await inbox.exchange({ thread, contact: { name: "", phone: "", locale: "en" }, question: "q", photos: [], reply: "a", estimates: [], held: false });
    await store.append("cstafflast", "kevin@speedx.ca", [], undefined, "last");
    const ids = (await store.list()).map((c) => c.id);
    expect(ids).toHaveLength(MAX_CONVERSATIONS);
    expect(ids.filter((id) => id.startsWith("cw"))).toEqual([]);
    expect(ids).toContain("cstaff0");
  });

  it("ignores contact details for a visit with no saved question", async () => {
    const { store, inbox } = setup();
    await inbox.contact(thread, { name: "Amy", phone: "604-555-0182", locale: "en" });
    expect(await store.list()).toEqual([]);
  });

  it("labels website turns for the workbench AI and never includes name or phone", async () => {
    const { store, inbox } = setup();
    await inbox.exchange({ thread, contact: { name: "Amy", phone: "604-555-0182", locale: "en" }, question: "winter tires?", photos: [], reply: "Here you go", estimates: [card], held: false });
    const history = historyFromTurns((await store.get(websiteConversationId(thread)))!.turns);
    expect(history[0].text).toContain("[网站客人在公开估价页上问]");
    expect(history[1].text).toContain("[网站 AI 客服回复客人]");
    expect(history[1].text).toContain("$1120");
    expect(JSON.stringify(history)).not.toMatch(/Amy|604-555/);
  });
});

describe("public chat route copies visits to the workbench", () => {
  const body = { locale: "en", history: [], message: "brake noise", vehicleKey: null, lead: null, sessionId: null };
  const request = (b: unknown, headers: Record<string, string> = {}) =>
    new Request("https://speedxrental.com/api/repair-chat", { method: "POST", headers: { "Content-Type": "application/json", origin: "https://speedxrental.com", ...headers }, body: JSON.stringify(b) });
  const deps = (inbox: WebsiteInbox, sessions = new SessionStore(async () => {})): RouteDeps => ({
    configured: () => true,
    limiter: new RateLimiter(),
    notify: async () => {},
    sessions,
    inbox: () => inbox,
    catalog: () => ({ get: async () => ({}) as never, post: async () => ({}) as never }),
    client: () => ({ beta: { messages: { create: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "Hello" }] }) as never } } }),
  });

  it("saves the exchange, then the contact details from the lead form", async () => {
    const { store, inbox } = setup();
    const sessions = new SessionStore(async () => {});
    const response = await handleChat(request(body), deps(inbox, sessions));
    const events = (await response.text()).trim().split("\n").map((l) => JSON.parse(l));
    const sessionId = events.find((e) => e.type === "session").id as string;
    const id = websiteConversationId(sessionId);
    expect((await store.get(id))?.turns.map((t) => t.text)).toEqual(["brake noise", "Hello"]);

    const lead = new Request("https://speedxrental.com/api/repair-chat/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: "https://speedxrental.com" },
      body: JSON.stringify({ lead: { name: "Amy", phone: "604-555-0182" }, locale: "en", sessionId }),
    });
    await handleLead(lead, { configured: () => true, notify: async () => {}, sessions, inbox: () => inbox, limiter: new RateLimiter() });
    expect((await store.get(id))?.website).toMatchObject({ name: "Amy", phone: "604-555-0182", locale: "en" });
  });

  it("keeps one conversation when a session is reopened after a restart", async () => {
    const { store, inbox } = setup();
    await (await handleChat(request({ ...body, sessionId: thread, history: [{ role: "user", text: "hi" }, { role: "assistant", text: "Hello" }] }), deps(inbox))).text();
    expect((await store.list()).map((c) => c.id)).toEqual([websiteConversationId(thread)]);
  });

  it("does not copy evaluation runs", async () => {
    const token = "eval-token-for-tests";
    vi.stubEnv("REPAIR_EVAL_TOKEN_SHA256", createHash("sha256").update(token).digest("hex"));
    vi.resetModules();
    const fresh = await import("@/lib/repair-chat/http");
    const { store, inbox } = setup();
    await (await fresh.handleChat(request(body, { "x-repair-eval": token }), deps(inbox))).text();
    expect(await store.list()).toEqual([]);
    vi.unstubAllEnvs();
  });
});

describe("website cards in the workbench", () => {
  it("shows the customer's contact links and the estimate they saw", () => {
    render(
      <>
        <WebsiteVisitorBar visitor={{ name: "Amy", phone: "604-555-0182", locale: "zh-CN", booking: { date: "2026-10-20", time: "10:00" } }} />
        <WebsiteEstimateCard card={card} />
      </>,
    );
    expect(screen.getByText("604-555-0182").getAttribute("href")).toBe("tel:604-555-0182");
    expect(screen.getByText("WhatsApp").getAttribute("href")).toBe("https://wa.me/16045550182");
    expect(screen.getByText(/想预约 2026-10-20 10:00/)).toBeTruthy();
    expect(screen.getByTestId("website-estimate").textContent).toContain("$1120");
  });
});
