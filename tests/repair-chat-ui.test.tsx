import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RepairChat } from "@/components/RepairChat";
import { en } from "@/i18n/en";
import { zhCN } from "@/i18n/zh-CN";
import { zhTW } from "@/i18n/zh-TW";

const estimate = {
  id: "E-ABC123",
  vehicle: "2019 Toyota Camry LE 2.5 L4",
  service: "Brake Pads R&R",
  position: "Front",
  laborHours: 1.1,
  laborRate: 120,
  laborWalkIn: 132,
  laborReferral: 105.6,
  primaryPartName: "Brake Pad Set",
  partOptions: [
    { description: "Brake Pad Set, Ceramic", series: "PRO-ACT", unitListPrice: 159.05, quantity: 1, total: 159.05, inStockLocally: true, note: "" },
  ],
  partsLow: 159.05,
  partsHigh: 159.05,
  totalLow: 291.05,
  totalHigh: 291.05,
  referralTotalLow: 264.65,
  referralTotalHigh: 264.65,
  laborNote: "Does not include: Brake Hydraulic System Bleed.",
  otherPartNames: [],
  partsNote: "",
  createdAt: "2026-10-11T00:00:00.000Z",
};

function ndjson(events: unknown[], status = 200) {
  return new Response(events.map((e) => JSON.stringify(e)).join("\n") + "\n", {
    status,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

const lead = { name: "Kevin", phone: "604-555-0182" };
const SESSION = "c".repeat(32);

const BOOKING_DAYS = [
  { date: "2026-10-14", slots: ["11:00", "11:30", "16:30"] },
  { date: "2026-11-02", slots: ["11:00"] },
];

/**
 * Answers /api/repair-lead with ok, /api/repair-booking with open days (GET)
 * or ok (POST), and /api/repair-chat with the queued streams.
 */
function api(...chatResponses: Response[]) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/repair-lead") return Response.json({ ok: true, sessionId: SESSION });
    if (url === "/api/repair-booking") {
      return init?.method === "POST" ? Response.json({ ok: true }) : Response.json({ days: BOOKING_DAYS });
    }
    const next = chatResponses.shift();
    if (!next) throw new Error("no chat response queued");
    return next;
  });
}

async function activate(dict = en) {
  await userEvent.type(screen.getByLabelText(dict.repairChat.gate.name), lead.name);
  await userEvent.type(screen.getByLabelText(dict.repairChat.gate.phone), lead.phone);
  await userEvent.click(screen.getByRole("button", { name: dict.repairChat.gate.submit }));
}

describe("RepairChat", () => {
  beforeEach(() => {
    window.dataLayer = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the chat locked until a name and valid phone are entered", async () => {
    const fetchMock = api();
    vi.stubGlobal("fetch", fetchMock);
    render(<RepairChat locale="en" dict={en} pagePath="/en/auto-repair" />);
    expect(screen.queryByLabelText(en.repairChat.placeholder)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(en.repairChat.gate.name), "Kevin");
    await userEvent.type(screen.getByLabelText(en.repairChat.gate.phone), "917-0710");
    await userEvent.click(screen.getByRole("button", { name: en.repairChat.gate.submit }));
    expect(screen.getByRole("alert")).toHaveTextContent(en.repairChat.gate.invalidPhone);
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText(en.repairChat.gate.phone));
    await userEvent.type(screen.getByLabelText(en.repairChat.gate.phone), lead.phone);
    await userEvent.click(screen.getByRole("button", { name: en.repairChat.gate.submit }));
    expect(await screen.findByText(en.repairChat.greeting.replace("{name}", "Kevin"))).toBeInTheDocument();
    expect(screen.getByLabelText(en.repairChat.placeholder)).toBeInTheDocument();
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      locale: "en",
      lead,
    });
  });

  it("always shows the sample estimate without the referral price or booking buttons", () => {
    render(<RepairChat locale="zh-TW" dict={zhTW} pagePath="/zh-TW/auto-repair" />);
    const demo = screen.getByTestId("demo-estimate-card");
    expect(demo).toHaveTextContent(zhTW.repairChat.demo.label);
    expect(demo).toHaveTextContent("$291.05 – $317.84");
    expect(demo).not.toHaveTextContent("$264.65");
    expect(screen.queryByRole("link", { name: zhTW.repairChat.estimate.book })).not.toBeInTheDocument();
    expect(screen.queryByTestId("screenshot-tip")).not.toBeInTheDocument();
  });

  it("sends a starter question and renders the estimate card with booking links", async () => {
    const fetchMock = api(
      ndjson([
        { type: "status", status: "estimate" },
        { type: "vehicle", vehicle: { key: "k1", label: "2019 Toyota Camry LE 2.5 L4" } },
        { type: "estimate", estimate },
        { type: "message", text: "Front pads are about $291 before tax." },
        { type: "done" },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<RepairChat locale="en" dict={en} pagePath="/en/auto-repair" />);
    await activate();

    await userEvent.click(screen.getByRole("button", { name: en.repairChat.starters[0] }));

    expect(await screen.findByText("Front pads are about $291 before tax.")).toBeInTheDocument();
    const card = screen.getByTestId("estimate-card");
    expect(card).toHaveTextContent("$291.05");
    expect(card).not.toHaveTextContent("$264.65");
    expect(card).toHaveTextContent("Brake Hydraulic System Bleed");
    expect(screen.getByTestId("screenshot-tip")).toHaveTextContent("Take a screenshot of this estimate");
    expect(screen.getByTestId("screenshot-tip")).toHaveTextContent("E-ABC123");
    expect(card).toHaveTextContent("Date 2026-10-1");
    const whatsapp = screen.getByRole("link", { name: en.repairChat.estimate.book });
    const prefilled = decodeURIComponent(whatsapp.getAttribute("href")!);
    expect(prefilled).toContain("E-ABC123");
    expect(prefilled).toContain("this is Kevin");

    const body = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toEqual({ locale: "en", history: [], message: en.repairChat.starters[0], vehicleKey: null, lead, sessionId: SESSION });

    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    window.dispatchEvent(new Event("pagehide"));
    expect(beacon).toHaveBeenCalledWith("/api/repair-lead/finish", expect.any(Blob));
  });

  it("sends the prior conversation and confirmed vehicle on the next message", async () => {
    const fetchMock = api(
      ndjson([{ type: "vehicle", vehicle: { key: "k1", label: "Camry" } }, { type: "message", text: "Which axle?" }, { type: "done" }]),
      ndjson([{ type: "message", text: "Got it." }, { type: "done" }]),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<RepairChat locale="en" dict={en} pagePath="/en/auto-repair" />);
    await activate();
    const input = screen.getByLabelText(en.repairChat.placeholder);

    await userEvent.type(input, "2019 Camry pads{Enter}");
    await screen.findByText("Which axle?");
    await userEvent.type(input, "Front{Enter}");
    await screen.findByText("Got it.");

    const second = JSON.parse((fetchMock.mock.calls[2] as unknown as [string, RequestInit])[1].body as string);
    expect(second.history).toEqual([
      { role: "user", text: "2019 Camry pads" },
      { role: "assistant", text: "Which axle?" },
    ]);
    expect(second.vehicleKey).toBe("k1");
  });

  it("shows the localized busy message when rate-limited", async () => {
    vi.stubGlobal("fetch", api(new Response("{}", { status: 429 })));
    render(<RepairChat locale="zh-CN" dict={zhCN} pagePath="/zh-CN/auto-repair" />);
    await activate(zhCN);
    await userEvent.click(screen.getByRole("button", { name: zhCN.repairChat.starters[1] }));
    await waitFor(() => expect(screen.getByText(zhCN.repairChat.errors.busy)).toBeInTheDocument());
  });

  it("offers the booking card once, after the first estimate, and sends the chosen slot", async () => {
    const fetchMock = api(
      ndjson([{ type: "estimate", estimate }, { type: "message", text: "About $291." }, { type: "done" }]),
      ndjson([{ type: "estimate", estimate: { ...estimate, id: "E-SECOND" } }, { type: "message", text: "Rear too." }, { type: "done" }]),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<RepairChat locale="zh-CN" dict={zhCN} pagePath="/zh-CN/auto-repair" />);
    await activate(zhCN);
    const b = zhCN.repairChat.booking;

    await userEvent.type(screen.getByLabelText(zhCN.repairChat.placeholder), "前刹车片{Enter}");
    const card = await screen.findByTestId("booking-card");
    expect(card).toHaveTextContent(b.screenshot);
    const submit = screen.getByRole("button", { name: b.submit });
    expect(submit).toBeDisabled();

    // Only bookable days are enabled; Oct 13 (not in the list) is not.
    await waitFor(() => expect(screen.getByRole("button", { name: /10月14日/ })).toBeEnabled());
    expect(screen.getByRole("button", { name: /10月13日/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /10月14日/ }));
    await userEvent.click(screen.getByRole("button", { name: "11:30" }));
    await userEvent.click(submit);
    expect(await screen.findByText(/已收到您的预约请求/)).toHaveTextContent("11:30");

    const post = fetchMock.mock.calls.find(
      ([url, init]) => url === "/api/repair-booking" && (init as RequestInit | undefined)?.method === "POST",
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(post[1].body as string)).toEqual({
      locale: "zh-CN",
      lead,
      sessionId: SESSION,
      date: "2026-10-14",
      time: "11:30",
    });

    await userEvent.type(screen.getByLabelText(zhCN.repairChat.placeholder), "后面也要{Enter}");
    await screen.findByText("Rear too.");
    expect(screen.getAllByTestId("booking-card")).toHaveLength(1);
  });

  it("renders flat-price and team-quote cards", async () => {
    const flat = {
      ...estimate,
      id: "E-FLAT",
      kind: "flat",
      service: "换机油",
      position: "普通轿车 / 小 SUV",
      laborHours: 0,
      laborWalkIn: 0,
      partOptions: [
        { description: "普通机油 0W-20", series: "oil_standard", unitListPrice: 95, quantity: 1, total: 95, inStockLocally: false, note: "" },
        { description: "高级机油 0W-30", series: "oil_premium", unitListPrice: 120, quantity: 1, total: 120, inStockLocally: false, note: "" },
      ],
      totalLow: 95,
      totalHigh: 120,
      laborNote: "",
      partsNote: "一口价，含机油和机油滤芯。",
    };
    const team = { ...estimate, id: "E-TEAM", kind: "team_quote", service: "换机油", partOptions: [], totalLow: 0, totalHigh: 0, laborNote: "" };
    vi.stubGlobal(
      "fetch",
      api(ndjson([{ type: "estimate", estimate: flat }, { type: "estimate", estimate: team }, { type: "message", text: "好的" }, { type: "done" }])),
    );
    render(<RepairChat locale="zh-CN" dict={zhCN} pagePath="/zh-CN/auto-repair" />);
    await activate(zhCN);
    await userEvent.type(screen.getByLabelText(zhCN.repairChat.placeholder), "换机油{Enter}");
    await screen.findByText("好的");

    const [flatCard, teamCard] = screen.getAllByTestId("estimate-card");
    expect(flatCard).toHaveTextContent(zhCN.repairChat.estimate.flatOptions);
    expect(flatCard).toHaveTextContent("$95.00 – $120.00");
    expect(flatCard).toHaveTextContent("含机油和机油滤芯");
    expect(flatCard).not.toHaveTextContent(zhCN.repairChat.estimate.labor);
    expect(teamCard).toHaveTextContent(zhCN.repairChat.estimate.teamQuote);
    expect(teamCard).not.toHaveTextContent("$");
    expect(screen.getAllByTestId("screenshot-tip")).toHaveLength(1);
  });

  it("shows the call-us message instead of the chat when over today's limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true, sessionId: SESSION, capped: true })),
    );
    render(<RepairChat locale="zh-TW" dict={zhTW} pagePath="/zh-TW/auto-repair" />);
    await activate(zhTW);
    expect(await screen.findByText(/看到您今天已經多次聯絡我們了/)).toHaveTextContent("+1 (778) 917-0710");
    expect(screen.queryByLabelText(zhTW.repairChat.placeholder)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: zhTW.repairChat.starters[0] })).not.toBeInTheDocument();
    expect(screen.getByTestId("capped-contact")).toBeInTheDocument();
  });

  it("has complete copy in every locale", () => {
    for (const dict of [en, zhCN, zhTW]) {
      expect(dict.repairChat.starters).toHaveLength(3);
      expect(Object.keys(dict.repairChat.status).sort()).toEqual(["estimate", "services", "thinking", "vehicle"]);
      expect(dict.privacy.sections.some((s) => /Claude/.test(s.body))).toBe(true);
      expect(dict.repairChat.greeting).toContain("{name}");
      expect(dict.repairChat.greeting).toContain("VIN");
      expect(dict.repairChat.capped).toContain("{phone}");
      expect(dict.repairChat.booking.done).toContain("{slot}");
      expect(dict.repairChat.booking.weekdays).toHaveLength(7);
    }
  });
});
