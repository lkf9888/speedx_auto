import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { emitRepairLead } = vi.hoisted(() => ({ emitRepairLead: vi.fn() }));
vi.mock("@/lib/analytics", async (original) => ({ ...(await original<typeof import("@/lib/analytics")>()), emitRepairLead }));

import { RepairChat } from "@/components/RepairChat";
import { WebsiteVisitorBar } from "@/components/workbench/WebsiteCards";
import { en } from "@/i18n/en";
import { zhCN } from "@/i18n/zh-CN";
import { handleLead } from "@/lib/repair-chat/http";
import { contactLines, parseLead, type LeadEvent } from "@/lib/repair-chat/lead";
import { composeFollowUpEmail, type OutgoingEmail } from "@/lib/repair-chat/followup";
import { RateLimiter } from "@/lib/repair-chat/rate-limit";
import { SessionStore } from "@/lib/repair-chat/session";
import { ConversationStore, summarize } from "@/lib/workbench/conversations";
import { memoryKv } from "@/lib/workbench/kv";
import { WebsiteInbox, websiteConversationId } from "@/lib/workbench/website-inbox";

// From the website chats of Oct 23 – Nov 11, 2026: 4 of 7 visitors who left no number never got an
// estimate, so there was no form to leave one. Kevin: offer a callback, add optional WeChat and email.

const SESSION = "d".repeat(32);

describe("contact details", () => {
  it("take an optional WeChat ID and email, and refuse ones that don't look right", () => {
    expect(parseLead({ name: "Amy", phone: "604-555-0182", wechat: " amy_88 ", email: "amy@example.com" })).toEqual({ name: "Amy", phone: "604-555-0182", wechat: "amy_88", email: "amy@example.com" });
    expect(parseLead({ name: "Amy", phone: "604-555-0182", wechat: "", email: "" })).toEqual({ name: "Amy", phone: "604-555-0182" });
    expect(parseLead({ name: "Amy", phone: "604-555-0182", email: "not an email" })).toBeNull();
    expect(parseLead({ name: "Amy", phone: "604-555-0182", wechat: "has space" })).toBeNull();
    // Phone stays required.
    expect(parseLead({ name: "Amy", wechat: "amy_88" })).toBeNull();
  });

  it("appear in the shop's emails", () => {
    expect(contactLines({ name: "Amy", phone: "604-555-0182", wechat: "amy_88", email: "amy@example.com" })).toEqual(["客户姓名：Amy", "客户电话：604-555-0182", "客户微信：amy_88", "客户邮箱：amy@example.com"]);
    const sessions = new SessionStore(async () => {});
    const session = sessions.create({ name: "Amy", phone: "604-555-0182", email: "amy@example.com" }, "zh-CN");
    expect(composeFollowUpEmail(session, "idle", null).text).toContain("客户邮箱：amy@example.com");
  });
});

describe("a callback request", () => {
  function server() {
    const store = new ConversationStore(memoryKv());
    const inbox = new WebsiteInbox(store);
    const sessions = new SessionStore(async () => {});
    const emails: OutgoingEmail[] = [];
    const events: LeadEvent[] = [];
    const deps = {
      configured: () => true,
      notify: async (e: LeadEvent) => void events.push(e),
      sessions,
      inbox: () => inbox,
      mailer: async (email: OutgoingEmail) => void emails.push(email),
      limiter: new RateLimiter(),
    };
    return { store, inbox, sessions, emails, events, deps };
  }
  const post = (body: unknown) =>
    new Request("https://speedxrental.com/api/repair-lead", { method: "POST", headers: { "Content-Type": "application/json", origin: "https://speedxrental.com" }, body: JSON.stringify(body) });

  it("emails the shop right away with the conversation, and marks the workbench chat", async () => {
    const s = server();
    const session = s.sessions.create(null, "zh-CN");
    s.sessions.record(session.id, { role: "user", text: "2003 C230 打不着火，一直抖" });
    await s.inbox.exchange({ thread: session.thread, contact: { name: "", phone: "", locale: "zh-CN" }, question: "2003 C230 打不着火", photos: [], reply: "可能是点火或燃油问题……", estimates: [], held: false });

    const response = await handleLead(post({ locale: "zh-CN", sessionId: session.id, reason: "callback", lead: { name: "Wang", phone: "604-555-0100", wechat: "wang_c230" } }), s.deps);
    expect(response.status).toBe(200);
    expect(s.emails).toHaveLength(1);
    expect(s.emails[0].subject).toBe("【网站回电请求】Wang 604-555-0100");
    expect(s.emails[0].text).toContain("客户微信：wang_c230");
    expect(s.emails[0].text).toContain("2003 C230 打不着火，一直抖");
    expect(s.events.map((e) => e.type)).toEqual(["lead_started", "callback_requested"]);

    const saved = (await s.store.get(websiteConversationId(session.thread)))!;
    expect(saved.website).toMatchObject({ name: "Wang", phone: "604-555-0100", wechat: "wang_c230" });
    expect(saved.website?.callbackAt).toBeGreaterThan(0);
    expect(summarize(saved)).toMatchObject({ website: "Wang", callback: true });
  });

  it("uses the browser's copy of the chat when the server lost the session", async () => {
    const s = server();
    await handleLead(post({ locale: "en", sessionId: SESSION, reason: "callback", lead: { name: "Li", phone: "604-555-0101" }, history: [{ role: "user", text: "Starter motor price?" }] }), s.deps);
    expect(s.emails[0].text).toContain("Starter motor price?");
  });

  it("emails the shop once per visit, however often the form is sent", async () => {
    const s = server();
    const session = s.sessions.create(null, "en");
    const body = { locale: "en", sessionId: session.id, reason: "callback", lead: { name: "Li", phone: "604-555-0101" } };
    await handleLead(post(body), s.deps);
    await handleLead(post({ ...body, lead: { ...body.lead, wechat: "li_88" } }), s.deps);
    expect(s.emails).toHaveLength(1);
    expect(s.events.filter((e) => e.type === "callback_requested")).toHaveLength(1);
  });

  it("is not sent for the estimate form", async () => {
    const s = server();
    const session = s.sessions.create(null, "en");
    await handleLead(post({ locale: "en", sessionId: session.id, lead: { name: "Li", phone: "604-555-0101" } }), s.deps);
    expect(s.emails).toEqual([]);
  });
});

function ndjson(events: unknown[]) {
  return new Response(events.map((e) => JSON.stringify(e)).join("\n") + "\n", { headers: { "Content-Type": "application/x-ndjson" } });
}

describe("the website chat", () => {
  beforeEach(() => {
    emitRepairLead.mockClear();
    window.dataLayer = [];
  });
  afterEach(() => vi.unstubAllGlobals());

  it("offers a callback under a reply with no estimate, and sends it with the optional details", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/repair-lead") return Response.json({ ok: true, sessionId: SESSION, pending: null });
      if (url === "/api/repair-booking") return Response.json({ days: [] });
      return ndjson([{ type: "session", id: SESSION }, { type: "message", text: "Is the check engine light flashing?" }, { type: "done" }]);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<RepairChat locale="zh-CN" dict={zhCN} pagePath="/zh-CN/auto-repair" />);
    // Not before the customer has asked anything.
    expect(screen.queryByTestId("callback-offer")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(zhCN.repairChat.placeholder), "2003 C230 打不着火{Enter}");
    const offer = await screen.findByTestId("callback-offer");
    expect(offer).toHaveTextContent(zhCN.repairChat.callback.offer);

    await userEvent.click(within(offer).getByRole("button", { name: /请师傅回电/ }));
    const form = screen.getByTestId("callback-form");
    expect(form).toHaveTextContent(zhCN.repairChat.gate.callbackTitle);
    await userEvent.type(within(form).getByLabelText(zhCN.repairChat.gate.name), "Wang");
    await userEvent.type(within(form).getByLabelText(zhCN.repairChat.gate.phone), "604-555-0100");
    await userEvent.type(within(form).getByLabelText(zhCN.repairChat.gate.wechat), "wang_c230");
    await userEvent.click(within(form).getByRole("button", { name: zhCN.repairChat.gate.callbackSubmit }));

    expect(await screen.findByText(zhCN.repairChat.callback.thanks)).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/repair-lead") as unknown as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body).toMatchObject({ reason: "callback", sessionId: SESSION, lead: { name: "Wang", phone: "604-555-0100", wechat: "wang_c230" } });
    expect(body.history).toEqual([
      { role: "user", text: "2003 C230 打不着火" },
      { role: "assistant", text: "Is the check engine light flashing?" },
    ]);
    expect(emitRepairLead).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId("callback-offer")).not.toBeInTheDocument());
    expect(screen.queryByTestId("callback-form")).not.toBeInTheDocument();
  });

  it("checks the optional email before sending the estimate form", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/repair-lead") return Response.json({ ok: true, sessionId: SESSION, pending: { text: "About $291.", estimates: [] } });
      return ndjson([{ type: "session", id: SESSION }, { type: "lead_required" }, { type: "done" }]);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<RepairChat locale="en" dict={en} pagePath="/en/auto-repair" />);
    await userEvent.type(screen.getByLabelText(en.repairChat.placeholder), "front pads{Enter}");
    const gate = await screen.findByTestId("lead-gate");
    expect(screen.queryByTestId("callback-offer")).not.toBeInTheDocument();
    await userEvent.type(within(gate).getByLabelText(en.repairChat.gate.name), "Amy");
    await userEvent.type(within(gate).getByLabelText(en.repairChat.gate.phone), "604-555-0182");
    await userEvent.type(within(gate).getByLabelText(en.repairChat.gate.email), "amy@");
    await userEvent.click(within(gate).getByRole("button", { name: en.repairChat.gate.submit }));
    expect(await within(gate).findByRole("alert")).toHaveTextContent(en.repairChat.gate.invalidEmail);
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/repair-lead")).toBe(false);

    await userEvent.type(within(gate).getByLabelText(en.repairChat.gate.email), "example.com");
    await userEvent.click(within(gate).getByRole("button", { name: en.repairChat.gate.submit }));
    expect(await screen.findByText("About $291.")).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/repair-lead") as unknown as [string, RequestInit];
    expect(JSON.parse(call[1].body as string).lead).toEqual({ name: "Amy", phone: "604-555-0182", email: "amy@example.com" });
  });
});

describe("the workbench", () => {
  it("shows a callback request, WeChat and email, or that the customer can't be reached", () => {
    const { rerender } = render(<WebsiteVisitorBar visitor={{ name: "Wang", phone: "604-555-0100", wechat: "wang_c230", email: "w@example.com", locale: "zh-CN", callbackAt: 1 }} />);
    expect(screen.getByTestId("callback-badge")).toHaveTextContent("客人要求回电");
    expect(screen.getByText("微信 wang_c230")).toBeInTheDocument();
    expect(screen.getByText("w@example.com").getAttribute("href")).toBe("mailto:w@example.com");
    rerender(<WebsiteVisitorBar visitor={{ name: "", phone: "", locale: "en" }} />);
    expect(screen.getByText("客人没有留联系方式，无法回访")).toBeInTheDocument();
    expect(screen.queryByTestId("callback-badge")).not.toBeInTheDocument();
  });
});
