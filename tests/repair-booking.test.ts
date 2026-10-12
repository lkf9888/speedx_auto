import { describe, expect, it } from "vitest";
import {
  bookableDays,
  isBookable,
  isOpenDay,
  parseClosedDates,
  shopHolidays,
  SLOT_TIMES,
} from "@/lib/repair-chat/booking";
import { composeFollowUpEmail, type OutgoingEmail } from "@/lib/repair-chat/followup";
import { handleBooking, handleBookingSlots } from "@/lib/repair-chat/http";
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
