import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bookableDays,
  isBookable,
  isOpenDay,
  parseClosedDates,
  shopHolidays,
  SLOT_TIMES,
} from "@/lib/repair-chat/booking";
import { composeFollowUpEmail, type OutgoingEmail } from "@/lib/repair-chat/followup";
import { handleBooking, handleBookingSlots, handleChat, handleLead, type RouteDeps } from "@/lib/repair-chat/http";
import { turnContext } from "@/lib/repair-chat/prompt";
import { runTool } from "@/lib/repair-chat/tools";
import type { LeadEvent } from "@/lib/repair-chat/lead";
import { RateLimiter } from "@/lib/repair-chat/rate-limit";
import { SessionStore } from "@/lib/repair-chat/session";

describe("booking slots", () => {
  it("offers half-hour slots from 11:00 to 16:30", () => {
    expect(SLOT_TIMES).toHaveLength(12);
    expect(SLOT_TIMES[0]).toBe("11:00");
    expect(SLOT_TIMES[SLOT_TIMES.length - 1]).toBe("16:30");
  });

  it("knows BC statutory holidays and Boxing Day", () => {
    expect([...shopHolidays(2026)].sort()).toEqual([
      "2026-01-01", "2026-02-16", "2026-04-03", "2026-05-18", "2026-07-01", "2026-08-03",
      "2026-09-07", "2026-09-30", "2026-10-12", "2026-11-11", "2026-12-25", "2026-12-26",
    ]);
    // Christmas 2027 is a Saturday and Boxing Day a Sunday: closed Monday the 27th.
    expect(shopHolidays(2027).has("2027-12-27")).toBe(true);
    expect(shopHolidays(2027).has("2027-03-26")).toBe(true); // Good Friday
  });

  it("is open Monday to Saturday except holidays and extra closed days", () => {
    expect(isOpenDay("2026-10-17")).toBe(true); // Saturday
    expect(isOpenDay("2026-10-18")).toBe(false); // Sunday
    expect(isOpenDay("2026-10-12")).toBe(false); // Thanksgiving
    expect(isOpenDay("2026-10-14", parseClosedDates("2026-10-14, junk"))).toBe(false);
  });

  it("needs two hours' notice today and looks 30 days ahead", () => {
    // 13:10 in Vancouver on Tuesday Oct 13 2026.
    const days = bookableDays(new Date("2026-10-13T20:10:00Z"));
    expect(days[0]).toEqual({ date: "2026-10-13", slots: ["15:30", "16:00", "16:30"] });
    expect(days[1].date).toBe("2026-10-14");
    expect(days[1].slots).toHaveLength(12);
    expect(days.some((d) => d.date === "2026-10-18")).toBe(false);
    expect(days[days.length - 1].date <= "2026-11-12").toBe(true);
    // After the last slot of the day, today drops out.
    expect(bookableDays(new Date("2026-10-14T00:00:00Z"))[0].date).toBe("2026-10-14");
    expect(bookableDays(new Date("2026-10-14T00:00:00Z")).some((d) => d.date === "2026-10-13")).toBe(false);
  });

  it("serves the open days without caching", async () => {
    const response = handleBookingSlots(new Date("2026-10-13T20:10:00Z"));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(((await response.json()) as { days: unknown[] }).days.length).toBeGreaterThan(20);
  });
});

const lead = { name: "Kevin Liu", phone: "604-555-0182" };
const now = new Date("2026-10-13T20:10:00Z");

function bookingRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request("https://speedxrental.com/api/repair-booking", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "https://speedxrental.com", ...headers },
    body: JSON.stringify({ locale: "zh-CN", lead, date: "2026-10-14", time: "11:30", sessionId: null, ...body }),
  });
}

function setup() {
  const sent: OutgoingEmail[] = [];
  const events: LeadEvent[] = [];
  const sessions = new SessionStore(async () => {});
  const deps = {
    configured: () => true,
    notify: async (e: LeadEvent) => void events.push(e),
    sessions,
    mailer: async (email: OutgoingEmail) => void sent.push(email),
    limiter: new RateLimiter(),
  };
  return { deps, sent, events, sessions };
}

describe("booking requests", () => {
  it("emails the shop with the customer, the slot and the estimates, and notes it on the session", async () => {
    const { deps, sent, events, sessions } = setup();
    const session = sessions.create(lead, "zh-CN");
    sessions.recordEstimate(session.id, {
      id: "E-1",
      kind: "labor",
      vehicle: "2019 Toyota Camry LE",
      service: "Brake Pads R&R",
      position: "Front",
      laborHours: 1.1,
      totalLow: 291.05,
      totalHigh: 317.84,
    } as never);

    const response = await handleBooking(bookingRequest({ sessionId: session.id }), deps, now);
    expect(response.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("【网站预约请求】Kevin Liu 604-555-0182 · 2026-10-14（周三）11:30 · 2019 Toyota Camry LE");
    expect(sent[0].text).toContain("E-1 · 2019 Toyota Camry LE · Brake Pads R&R");
    expect(events).toMatchObject([{ type: "booking_requested", date: "2026-10-14", time: "11:30" }]);
    expect(composeFollowUpEmail(sessions.get(session.id)!, "idle", null).text).toContain("预约请求：2026-10-14（周三）11:30");
  });

  it("refuses slots that aren't open and malformed requests", async () => {
    const { deps, sent } = setup();
    expect((await handleBooking(bookingRequest({ date: "2026-10-18" }), deps, now)).status).toBe(409); // Sunday
    expect((await handleBooking(bookingRequest({ date: "2026-10-13", time: "11:00" }), deps, now)).status).toBe(409); // too soon
    expect((await handleBooking(bookingRequest({ time: "10:30" }), deps, now)).status).toBe(400);
    expect((await handleBooking(bookingRequest({ lead: { name: "x", phone: "1" } }), deps, now)).status).toBe(400);
    expect(
      (await handleBooking(bookingRequest({}, { origin: "https://evil.example" }), deps, now)).status,
    ).toBe(403);
    expect(sent).toHaveLength(0);
    expect(isBookable("2026-10-14", "11:30", now)).toBe(true);
  });
});

// ------------------------------------------------------- appointments in the chat

describe("appointments asked for in the chat", () => {
  const tuesday = new Date("2026-10-13T20:10:00Z"); // 13:10 Tuesday in Vancouver

  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives the model today's shop date so it can work out 'tomorrow'", () => {
    expect(turnContext("zh-CN", null, "明天下午3点可以吗", [], tuesday)).toContain(
      "Today at the shop (Vancouver time): Tuesday 2026-10-13, 13:10.",
    );
  });

  it("accepts an open slot and offers open times for a closed one", async () => {
    vi.useFakeTimers({ now: tuesday, toFake: ["Date"] });
    const api = { get: async () => ({}) as never, post: async () => ({}) as never };
    const okOut = await runTool(api, "request_appointment", { date: "2026-10-14", time: "15:00" }, () => "E");
    expect(JSON.parse(okOut.content).status).toBe("requested");
    expect(okOut.events).toEqual([{ type: "appointment", date: "2026-10-14", time: "15:00" }]);

    const sunday = await runTool(api, "request_appointment", { date: "2026-10-18", time: "15:00" }, () => "E");
    expect(sunday.events).toEqual([]);
    expect(JSON.parse(sunday.content)).toMatchObject({
      status: "not_available",
      next_open_days: [{ date: "2026-10-13", first: "15:30" }, { date: "2026-10-14" }, { date: "2026-10-15" }],
    });
    const tooSoon = await runTool(api, "request_appointment", { date: "2026-10-13", time: "14:00" }, () => "E");
    expect(JSON.parse(tooSoon.content)).toMatchObject({ status: "not_available", open_slots_that_day: ["15:30", "16:00", "16:30"] });
  });

  function chatSetup(withLead: boolean) {
    vi.useFakeTimers({ now: tuesday, toFake: ["Date"] });
    const sent: OutgoingEmail[] = [];
    const sessions = new SessionStore(async () => {});
    const responses = [
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t", name: "request_appointment", input: { date: "2026-10-14", time: "15:00" } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "已帮您把周三 15:00 的预约请求发给店里，店里会打电话跟您确认。" }] },
    ];
    const deps: RouteDeps = {
      configured: () => true,
      limiter: new RateLimiter(),
      notify: async () => {},
      sessions,
      mailer: async (email) => void sent.push(email),
      catalog: () => ({ get: async () => ({}) as never, post: async () => ({}) as never }),
      client: () => ({ beta: { messages: { create: async () => responses.shift() as never } } }),
    };
    const chat = async () => {
      const response = await handleChat(
        new Request("https://speedxrental.com/api/repair-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", origin: "https://speedxrental.com" },
          body: JSON.stringify({
            locale: "zh-CN",
            history: [],
            message: "明天下午3点过来可以吗",
            vehicleKey: null,
            lead: withLead ? lead : null,
            sessionId: null,
          }),
        }),
        deps,
      );
      return (await response.text()).trim().split("\n").map((l) => JSON.parse(l));
    };
    return { sent, sessions, deps, chat };
  }

  it("emails the shop right away when the visitor already left name and phone", async () => {
    const { sent, chat } = chatSetup(true);
    const lines = await chat();
    expect(lines.map((l) => l.type)).toContain("message");
    expect(lines.some((l) => l.type === "appointment")).toBe(false);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain("【网站预约请求】Kevin Liu 604-555-0182 · 2026-10-14（周三）15:00");
    expect(sent[0].text).toContain("来源：客户在聊天中向 AI 助手提出");
  });

  it("asks for name and phone first, then emails once", async () => {
    const { sent, sessions, deps, chat } = chatSetup(false);
    const lines = await chat();
    expect(lines.find((l) => l.type === "lead_required")).toEqual({ type: "lead_required", reason: "appointment" });
    expect(lines.some((l) => l.type === "message")).toBe(false);
    expect(sent).toHaveLength(0);

    const sessionId = lines.find((l) => l.type === "session").id as string;
    const unlock = () =>
      handleLead(
        new Request("https://speedxrental.com/api/repair-lead", {
          method: "POST",
          headers: { "Content-Type": "application/json", origin: "https://speedxrental.com" },
          body: JSON.stringify({ locale: "zh-CN", lead, sessionId }),
        }),
        { ...deps, limiter: new RateLimiter() },
      ).then((r) => r.json() as Promise<{ pending: { text: string } | null }>);
    const released = await unlock();
    expect(released.pending?.text).toContain("周三 15:00");
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("希望到店：2026-10-14（周三）15:00");
    expect(sessions.get(sessionId)?.booking).toEqual({ date: "2026-10-14", time: "15:00" });

    await unlock();
    expect(sent).toHaveLength(1);
  });
});

const tuesday = new Date("2026-10-13T20:10:00Z");

describe("safety detection", () => {
  it("flags unsafe-to-drive descriptions in code and leaves ordinary ones alone", async () => {
    const { safetyConcern } = await import("@/lib/repair-chat/prompt");
    for (const text of [
      "Check engine light is flashing and the car is shaking a lot",
      "刹车踩到底了还停不住！",
      "There's smoke coming from under my hood right now",
      "车里有很大的汽油味",
      "Temperature gauge is in the red and steam is coming out",
      "開車的時候方向盤突然轉不動了",
      "特斯拉 Model 3 显示高压系统故障，还有点烧焦的味道",
    ]) {
      expect(safetyConcern(text), text).not.toBeNull();
    }
    for (const text of [
      "早上打不着火，咔咔响",
      "水温表偏高但没到红线",
      "How do I disconnect the high voltage battery on my Prius?",
      "My check engine light came on, car drives fine",
      "front brake pads squeak",
    ]) {
      expect(safetyConcern(text), text).toBeNull();
    }
    expect(turnContext("en", null, "There's smoke coming from under my hood", [], tuesday)).toContain(
      "A safety warning (stop driving / arrange a tow) is already shown above your reply",
    );
    const { safetyWarning } = await import("@/lib/repair-chat/prompt");
    expect(safetyWarning("刹车踩到底了还停不住", "Simplified Chinese")).toContain("请先不要再开这辆车");
    expect(safetyWarning("brakes grinding metal on metal, ok for a week?", "English")).toContain("don't keep driving it for another week");
    expect(safetyWarning("front pads squeak", "English")).toBeNull();
  });
});
