import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { emitRepairLead, emitRepairGateShown } = vi.hoisted(() => ({ emitRepairLead: vi.fn(), emitRepairGateShown: vi.fn() }));
vi.mock("@/lib/analytics", async (original) => ({ ...(await original<typeof import("@/lib/analytics")>()), emitRepairLead, emitRepairGateShown }));

import { RepairChat } from "@/components/RepairChat";
import { WebsiteVisitorBar } from "@/components/workbench/WebsiteCards";
import { en } from "@/i18n/en";
import { zhCN } from "@/i18n/zh-CN";
import { handleLead } from "@/lib/repair-chat/http";
import { contactLines, NO_NAME, parseLead, type LeadEvent } from "@/lib/repair-chat/lead";
import { firstName } from "@/lib/workbench/followup";
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

// Kevin, 2026-11-16: half of the customers who reached an estimate left at the form.
// The name is optional, the form says what the number is for, and there is a WhatsApp way out.
describe("the lighter estimate form", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("needs only a phone number, offers WhatsApp with the car and question filled in, and is counted", async () => {
    emitRepairGateShown.mockClear();
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/repair-lead") return Response.json({ ok: true, sessionId: SESSION, pending: { text: "About $291.", estimates: [] } });
      return ndjson([{ type: "session", id: SESSION }, { type: "lead_required" }, { type: "done" }]);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<RepairChat locale="en" dict={en} pagePath="/en/auto-repair" />);
    await userEvent.type(screen.getByLabelText(en.repairChat.placeholder), "front pads on my 2015 Civic{Enter}");
    const gate = await screen.findByTestId("lead-gate");
    expect(emitRepairGateShown).toHaveBeenCalledWith("en", "estimate");
    expect(gate).toHaveTextContent(en.repairChat.gate.intro);
    const link = within(gate).getByRole("link", { name: en.repairChat.gate.whatsappButton });
    const text = decodeURIComponent((link.getAttribute("href") ?? "").split("?text=")[1]);
    expect(link.getAttribute("href")).toContain("wa.me/");
    expect(text).toContain(en.repairChat.gate.whatsappIntro);
    expect(text).toContain("front pads on my 2015 Civic");
    expect(link).toHaveAttribute("href");

    await userEvent.type(within(gate).getByLabelText(en.repairChat.gate.phone), "604-555-0182");
    await userEvent.click(within(gate).getByRole("button", { name: en.repairChat.gate.submit }));
    expect(await screen.findByText("About $291.")).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/repair-lead") as unknown as [string, RequestInit];
    expect(JSON.parse(call[1].body as string).lead).toEqual({ name: "", phone: "604-555-0182" });
  });

  it("stores a placeholder for the name and never greets the customer with it", async () => {
    expect(parseLead({ phone: "604-555-0182" }, { nameOptional: true })).toEqual({ name: NO_NAME, phone: "604-555-0182" });
    expect(firstName(NO_NAME)).toBe("");
    expect(firstName("Amy Lin")).toBe("Amy");
  });
});

// Kevin, 2026-11-16: after two answered questions with no price the assistant stops asking and invites a
// phone number or email, because without contact details nobody can follow up.
describe("asking for contact instead of a third question", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("takes an email without a phone on the callback form only", () => {
    expect(parseLead({ name: "", email: "amy@example.com" }, { nameOptional: true, phoneOptional: true })).toEqual({ name: NO_NAME, phone: "", email: "amy@example.com" });
    expect(parseLead({ phone: "" }, { nameOptional: true, phoneOptional: true })).toBeNull();
    expect(parseLead({ email: "nope" }, { nameOptional: true, phoneOptional: true })).toBeNull();
    expect(parseLead({ email: "amy@example.com" }, { nameOptional: true })).toBeNull();
    expect(contactLines({ name: NO_NAME, phone: "", email: "amy@example.com" })).toContain("客户电话：（未留）");
  });

  it("tells the assistant not to ask a third question", async () => {
    const { turnContext } = await import("@/lib/repair-chat/prompt");
    expect(turnContext("en", null, "not sure", ["2010 civic", "right side"], new Date(), true)).toContain("Do NOT ask a third question");
    expect(turnContext("en", null, "hi", [], new Date(), false)).not.toContain("third question");
  });

  it("opens the contact form under the reply and sends an email-only request", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/repair-lead") return Response.json({ ok: true, sessionId: SESSION, pending: null });
      if (url === "/api/repair-booking") return Response.json({ days: [] });
      return ndjson([{ type: "session", id: SESSION }, { type: "contact_offer" }, { type: "message", text: "The team will work out the price and send it to you. Leave a phone or email below." }, { type: "done" }]);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<RepairChat locale="en" dict={en} pagePath="/en/auto-repair" />);
    await userEvent.type(screen.getByLabelText(en.repairChat.placeholder), "cv boot 2010 civic{Enter}");
    const form = await screen.findByTestId("callback-form");
    expect(form).toHaveTextContent(en.repairChat.gate.callbackIntro);
    // Neither phone nor email: refused with a plain message.
    await userEvent.click(within(form).getByRole("button", { name: en.repairChat.gate.callbackSubmit }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(en.repairChat.gate.invalidContact);
    await userEvent.type(within(form).getByLabelText(en.repairChat.gate.email), "amy@example.com");
    await userEvent.click(within(form).getByRole("button", { name: en.repairChat.gate.callbackSubmit }));
    expect(await screen.findByText(en.repairChat.callback.thanks)).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/repair-lead") as unknown as [string, RequestInit];
    expect(JSON.parse(call[1].body as string)).toMatchObject({ reason: "callback", lead: { phone: "", email: "amy@example.com" } });
  });
});

describe("the server counts answers without a price", () => {
  const catalog = { get: async () => ({}), post: async () => ({}) } as never;
  function make(requests: string[]) {
    const client = { beta: { messages: { create: async (params: unknown) => (requests.push(JSON.stringify(params)), { stop_reason: "end_turn", content: [{ type: "text", text: "Which side, and what engine?" }] } as never) } } };
    return {
      configured: () => true,
      limiter: new RateLimiter(),
      notify: async () => {},
      sessions: new SessionStore(async () => {}),
      catalog: () => catalog,
      client: () => client as never,
      houseRules: async () => [],
    };
  }
  const chat = async (deps: ReturnType<typeof make>, message: string, sessionId: string | null) => {
    const { handleChat } = await import("@/lib/repair-chat/http");
    const text = await (await handleChat(new Request("https://speedxrental.com/api/repair-chat", { method: "POST", headers: { "Content-Type": "application/json", origin: "https://speedxrental.com" }, body: JSON.stringify({ locale: "en", history: [], message, vehicleKey: null, lead: null, sessionId }) }), deps as never)).text();
    const events = text.trim().split("\n").map((l) => JSON.parse(l));
    return { events, sessionId: events.find((e) => e.type === "session")?.id ?? sessionId };
  };

  it("invites contact on the third customer message, once, and not before", async () => {
    const requests: string[] = [];
    const deps = make(requests);
    const one = await chat(deps, "cv boot 2010 civic", null);
    const two = await chat(deps, "right side", one.sessionId);
    expect(two.events.some((e) => e.type === "contact_offer")).toBe(false);
    expect(requests.join()).not.toContain("third question");
    const three = await chat(deps, "not sure", two.sessionId);
    expect(three.events.some((e) => e.type === "contact_offer")).toBe(true);
    expect(requests.at(-1)).toContain("Do NOT ask a third question");
    // The customer keeps going: the assistant helps as usual, no second invitation.
    const four = await chat(deps, "what about the engine", three.sessionId);
    expect(four.events.some((e) => e.type === "contact_offer")).toBe(false);
    expect(requests.at(-1)).not.toContain("third question");
  });
});

describe("review fixes for the contact invitation", () => {
  it("an email-only visitor can still book", async () => {
    const { handleBooking } = await import("@/lib/repair-chat/http");
    expect(handleBooking).toBeTypeOf("function");
    const { parseLead: parse } = await import("@/lib/repair-chat/lead");
    expect(parse({ email: "amy@example.com" }, { nameOptional: true, phoneOptional: true })).toMatchObject({ phone: "", email: "amy@example.com" });
  });
});

// Kevin, 2026-11-16 (shared conversation review): a job with no online price (paint scratches) showed the visitor a contact
// gate "to see your estimate" and staff a "$0" card. Now the card shows at once and the reply invites contact details.
describe("a job that needs the team's quote", () => {
  const catalog = { get: async () => ({}), post: async () => ({}) } as never;
  function make(requests: string[]) {
    const replies = [
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "request_team_quote", input: { service: "Paint scratch repair", vehicle_description: "2019 Subaru Outback" } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "The team will confirm the price. Please send photos and leave a phone number or email below." }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Thanks." }] },
    ];
    const client = { beta: { messages: { create: async (params: unknown) => (requests.push(JSON.stringify(params)), replies.shift() as never) } } };
    return { configured: () => true, limiter: new RateLimiter(), notify: async () => {}, sessions: new SessionStore(async () => {}), catalog: () => catalog, client: () => client as never, houseRules: async () => [] };
  }
  const chat = async (deps: ReturnType<typeof make>, message: string, sessionId: string | null) => {
    const { handleChat } = await import("@/lib/repair-chat/http");
    const text = await (await handleChat(new Request("https://speedxrental.com/api/repair-chat", { method: "POST", headers: { "Content-Type": "application/json", origin: "https://speedxrental.com" }, body: JSON.stringify({ locale: "en", history: [], message, vehicleKey: null, lead: null, sessionId }) }), deps as never)).text();
    const events = text.trim().split("\n").map((l) => JSON.parse(l));
    return { events, sessionId: events.find((e) => e.type === "session")?.id ?? sessionId };
  };

  it("shows the card without the gate, invites contact once, and tells the model to ask for photos and contact", async () => {
    const requests: string[] = [];
    const deps = make(requests);
    const first = await chat(deps, "paint scratches on my 2019 Subaru Outback", null);
    const types = first.events.map((e) => e.type);
    expect(types).not.toContain("lead_required");
    expect(first.events.find((e) => e.type === "estimate")?.estimate).toMatchObject({ kind: "team_quote" });
    expect(types.indexOf("contact_offer")).toBeGreaterThan(-1);
    expect(types.indexOf("contact_offer")).toBeLessThan(types.indexOf("message"));
    expect(requests.join()).toContain("leave a phone number, WhatsApp or email");
    expect(requests.join()).toContain("Do not ask which panels");
    const second = await chat(deps, "just the door", first.sessionId);
    expect(second.events.some((e) => e.type === "contact_offer")).toBe(false);
  });

  // Codex review: a reply with a priced card and a team card, in either order, keeps both behind the gate until contact
  // details arrive; and a new team card always brings the form back, even after the first offer.
  const mixed = (order: Array<"team" | "priced">) => {
    const team = { type: "tool_use", id: "t1", name: "request_team_quote", input: { service: "Paint scratch repair", vehicle_description: "2019 Subaru Outback" } };
    const priced = { type: "tool_use", id: "t2", name: "get_shop_service_price", input: { service: "inspection" } };
    const replies = [
      { stop_reason: "tool_use", content: order.map((o) => (o === "team" ? team : priced)) },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Done." }] },
    ];
    const client = { beta: { messages: { create: async () => replies.shift() as never } } };
    return { configured: () => true, limiter: new RateLimiter(), notify: async () => {}, sessions: new SessionStore(async () => {}), catalog: () => catalog, client: () => client as never, houseRules: async () => [] };
  };

  it.each([["team first", ["team", "priced"]], ["priced first", ["priced", "team"]]] as const)("a priced and a team card together are held together (%s)", async (_label, order) => {
    const deps = mixed([...order]);
    const out = await chat(deps as never, "inspection and paint scratches", null);
    const types = out.events.map((e) => e.type);
    expect(types).toContain("lead_required");
    expect(types).not.toContain("estimate");
    expect(types).not.toContain("message");
    expect(types).not.toContain("contact_offer");
  });

  it("a second team card brings the form back after the first offer", async () => {
    const requests: string[] = [];
    const sessions = new SessionStore(async () => {});
    const deps = { ...make(requests), sessions };
    const first = await chat(deps, "paint scratches on my 2019 Subaru Outback", null);
    expect(first.events.some((e) => e.type === "contact_offer")).toBe(true);
    // The visitor closed the form and started over in the same session; the model asks for another team quote.
    const again = { ...make(requests), sessions };
    const second = await chat(again, "and a dent on the bumper", first.sessionId);
    expect(second.events.some((e) => e.type === "contact_offer")).toBe(true);
  });
});

describe("the page for a job that needs the team's quote", () => {
  it("shows the card and the reply, with the contact form open under them", async () => {
    const team = { id: "E-TEAM", kind: "team_quote", service: "Paint scratch repair", position: "", vehicle: "2019 Subaru Outback", partOptions: [], totalLow: 0, totalHigh: 0, partsLow: 0, partsHigh: 0, laborHours: 0, laborRate: 0, laborWalkIn: 0, laborReferral: 0, referralTotalLow: 0, referralTotalHigh: 0, laborNote: "", partsNote: "" };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/repair-booking") return Response.json({ days: [] });
      return ndjson([{ type: "session", id: SESSION }, { type: "estimate", estimate: team }, { type: "contact_offer" }, { type: "message", text: "The team will confirm the price. Leave a phone number or email below." }, { type: "done" }]);
    }));
    render(<RepairChat locale="en" dict={en} pagePath="/en/auto-repair" />);
    await userEvent.type(screen.getByLabelText(en.repairChat.placeholder), "paint scratches 2019 Subaru Outback{Enter}");
    expect(await screen.findByTestId("callback-form")).toBeInTheDocument();
    expect(screen.getByText(/The team will confirm the price/)).toBeInTheDocument();
    expect(screen.queryByTestId("lead-gate")).not.toBeInTheDocument();
  });
});
