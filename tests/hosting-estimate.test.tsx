import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import HostingPage from "@/app/[locale]/hosting/page";
import { HostingEstimateChat } from "@/components/HostingEstimateChat";
import { en } from "@/i18n/en";
import { zhCN } from "@/i18n/zh-CN";
import { estimateIncome, findMake, MANAGEMENT_COMMISSION } from "@/lib/hosting-estimate/estimate";
import { handleHostingChat, handleHostingLead, HostingSessions, type HostingDeps } from "@/lib/hosting-estimate/http";
import { RateLimiter } from "@/lib/repair-chat/rate-limit";

const TODAY = new Date("2026-10-24T12:00:00");

describe("income estimate", () => {
  it("gives twelve months of net income from next month, after the 30% fee, matching TATO's model", () => {
    const out = estimateIncome({ make: "Toyota", model: "RAV4", year: 2021 }, "H-1", TODAY);
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    const card = out.card;
    expect(MANAGEMENT_COMMISSION).toBe(0.3);
    // TATO's estimateVehicle gives $8,571 gross for this car over the same twelve months.
    expect(card.annualNet).toBe(6000);
    expect(card.months).toHaveLength(12);
    expect(card.months[0]).toMatchObject({ month: 11, year: 2026 });
    expect(card.months[11]).toMatchObject({ month: 10, year: 2027 });
    expect(card.months.find((m) => m.month === 7)!.net).toBeGreaterThan(card.months.find((m) => m.month === 11)!.net * 3);
    expect(card.annualLow).toBeLessThan(card.annualNet);
    expect(card.annualHigh).toBeGreaterThan(card.annualNet);
    expect(card.monthlyAverage).toBe(500);
  });

  it("understands common ways of naming a car, and says when it can't", () => {
    expect(findMake("chevy")).toBe("Chevrolet");
    expect(findMake("Mercedes")).toBe("Mercedes-Benz");
    expect(estimateIncome({ make: "toyota", model: "RAV4 Hybrid XLE", year: 2022 }, "H", TODAY)).toMatchObject({ status: "ok", card: { vehicle: "2022 Toyota RAV4 Hybrid" } });
    expect(estimateIncome({ make: "Toyota", model: "RAV4", year: 2013 }, "H", TODAY)).toMatchObject({ status: "too_old", oldestYear: 2014 });
    expect(estimateIncome({ make: "Toyota", model: "Flying Car", year: 2022 }, "H", TODAY)).toMatchObject({ status: "unknown_model", make: "Toyota" });
    expect(estimateIncome({ make: "Zorgmobile", model: "X", year: 2022 }, "H", TODAY).status).toBe("unknown_make");
  });
});

/** A model that asks for the estimate on its first turn, then replies. */
function fakeClient(seen: unknown[] = []) {
  let call = 0;
  return {
    beta: {
      messages: {
        create: vi.fn(async (params: unknown) => {
          seen.push(params);
          call += 1;
          if (call === 1) {
            return {
              stop_reason: "tool_use",
              content: [{ type: "tool_use", id: "tu1", name: "estimate_income", input: { make: "Toyota", model: "RAV4", year: 2021 } }],
            } as never;
          }
          return { stop_reason: "end_turn", content: [{ type: "text", text: "About $6,000 a year, net after our management fee." }] } as never;
        }),
      },
    },
  };
}

function deps(over: Partial<HostingDeps> = {}): HostingDeps {
  return {
    client: () => fakeClient(),
    configured: () => true,
    limiter: new RateLimiter(),
    leadLimiter: new RateLimiter(),
    sessions: new HostingSessions(),
    mailer: vi.fn(async () => {}),
    newId: () => "H-TEST",
    today: () => TODAY,
    ...over,
  };
}

const post = (url: string, body: unknown) =>
  new Request(`https://speedxrental.com${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const lines = async (response: Response) => (await response.text()).trim().split("\n").map((l) => JSON.parse(l) as { type: string; [k: string]: unknown });

describe("hosting estimate endpoints", () => {
  it("holds the report until name and phone are given, then tells the shop", async () => {
    const seen: unknown[] = [];
    const d = deps({ client: () => fakeClient(seen) });
    const events = await lines(await handleHostingChat(post("/api/hosting-estimate/chat", { locale: "en", history: [], message: "2021 RAV4", lead: null, sessionId: null }), d));
    expect(events.map((e) => e.type)).toEqual(["session", "status", "lead_required", "done"]);
    const sessionId = events[0].id as string;

    const lead = { name: "Amy Chen", phone: "604-555-0100" };
    const released = (await (await handleHostingLead(post("/api/hosting-estimate/lead", { locale: "en", sessionId, lead }), d)).json()) as {
      pending: { text: string; cards: Array<{ annualNet: number }> };
    };
    expect(released.pending.text).toContain("$6,000");
    expect(released.pending.cards[0].annualNet).toBe(6000);
    const email = (d.mailer as ReturnType<typeof vi.fn>).mock.calls[0][0] as { subject: string; text: string };
    expect(email.subject).toContain("Amy Chen 604-555-0100");
    expect(email.text).toContain("2021 Toyota RAV4");
    expect(email.text).toContain("$6000");
    // Name and phone never reach the AI model.
    expect(JSON.stringify(seen)).not.toContain("604-555-0100");
    expect(JSON.stringify(seen)).not.toContain("Amy");
  });

  it("shows the report at once to an owner who already left contact details, and emails the shop again", async () => {
    const d = deps();
    const events = await lines(
      await handleHostingChat(post("/api/hosting-estimate/chat", { locale: "zh-CN", history: [], message: "2021 RAV4", lead: { name: "王", phone: "6045550100" }, sessionId: null }), d),
    );
    expect(events.map((e) => e.type)).toEqual(["session", "status", "income_estimate", "message", "done"]);
    expect(d.mailer).toHaveBeenCalledTimes(1);
  });

  it("refuses other sites, bad input and floods", async () => {
    const d = deps({ limiter: new RateLimiter({ perIpWindowMs: 60000, perIpWindowMax: 1, perIpDailyMax: 1, globalDailyMax: 10 }) });
    const foreign = new Request("https://speedxrental.com/api/hosting-estimate/chat", { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" });
    expect((await handleHostingChat(foreign, d)).status).toBe(403);
    expect((await handleHostingChat(post("/x", { locale: "fr", history: [], message: "hi" }), d)).status).toBe(400);
    const ok = { locale: "en", history: [], message: "hi", lead: null, sessionId: null };
    expect((await handleHostingChat(post("/x", ok), d)).status).toBe(200);
    expect((await handleHostingChat(post("/x", ok), d)).status).toBe(429);
  });
});

describe("hosting page estimate chat", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks for name and phone before showing the report", async () => {
    const card = (estimateIncome({ make: "Toyota", model: "RAV4", year: 2021 }, "H-1", TODAY) as { card: unknown }).card;
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) =>
      url === "/api/hosting-estimate/chat"
        ? new Response([{ type: "session", id: "a".repeat(32) }, { type: "lead_required" }, { type: "done" }].map((e) => JSON.stringify(e)).join("\n") + "\n")
        : Response.json({ pending: { text: "大约每年 $6,000 净收益。", cards: [card] } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<HostingEstimateChat locale="zh-CN" dict={zhCN} pagePath="/zh-CN/hosting" />);
    await userEvent.click(screen.getByRole("button", { name: zhCN.hostingEstimate.starters[0] }));
    const gate = await screen.findByTestId("hosting-lead-gate");
    expect(screen.queryByTestId("income-report")).not.toBeInTheDocument();
    await userEvent.type(within(gate).getByLabelText(zhCN.hostingEstimate.gate.name), "王先生");
    await userEvent.type(within(gate).getByLabelText(zhCN.hostingEstimate.gate.phone), "604 555 0100");
    await userEvent.click(within(gate).getByRole("button", { name: zhCN.hostingEstimate.gate.submit }));

    const report = await screen.findByTestId("income-report");
    expect(report).toHaveTextContent("$6,000");
    expect(report).toHaveTextContent(zhCN.hostingEstimate.report.afterFee);
    expect(within(report).getAllByRole("listitem").length).toBeGreaterThanOrEqual(12);
    expect(screen.getByText("大约每年 $6,000 净收益。")).toBeInTheDocument();
    const lead = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(lead).toMatchObject({ locale: "zh-CN", sessionId: "a".repeat(32), lead: { name: "王先生", phone: "604 555 0100" } });
  });

  it("is on the hosting page, with a button in the hero that jumps to it", async () => {
    render(await HostingPage({ params: Promise.resolve({ locale: "en" }) }));
    expect(screen.getByRole("heading", { name: en.hostingEstimate.title })).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: en.hostingEstimate.cta })) {
      expect(link).toHaveAttribute("href", "#income-estimate");
    }
    expect(document.getElementById("income-estimate")).not.toBeNull();
  });
});
