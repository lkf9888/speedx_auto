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

type Card = typeof estimate | Record<string, unknown>;

/**
 * Fake server. Chat requests take the queued streams in order. A reply made
 * with `held()` streams only lead_required; /api/repair-lead then releases
 * it. /api/repair-booking answers open days (GET) or ok (POST).
 */
function api(...chatResponses: Array<Response | { held: { text: string; estimates: Card[] } }>) {
  let pending: { text: string; estimates: Card[] } | null = null;
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/repair-lead") {
      const released = pending;
      pending = null;
      return Response.json({ ok: true, sessionId: SESSION, pending: released });
    }
    if (url === "/api/repair-booking") {
      return init?.method === "POST" ? Response.json({ ok: true }) : Response.json({ days: BOOKING_DAYS });
    }
    const next = chatResponses.shift();
    if (!next) throw new Error("no chat response queued");
    if (next instanceof Response) return next;
    pending = next.held;
    return ndjson([{ type: "session", id: SESSION }, { type: "status", status: "estimate" }, { type: "lead_required" }, { type: "done" }]);
  });
}

const held = (text: string, ...estimates: Card[]) => ({ held: { text, estimates } });

async function ask(text: string, dict = en) {
  await userEvent.type(screen.getByLabelText(dict.repairChat.placeholder), `${text}{Enter}`);
}

async function giveContact(dict = en, phone = lead.phone) {
  await userEvent.type(await screen.findByLabelText(dict.repairChat.gate.name), lead.name);
  await userEvent.type(screen.getByLabelText(dict.repairChat.gate.phone), phone);
  await userEvent.click(screen.getByRole("button", { name: dict.repairChat.gate.submit }));
}

const bodyOf = (call: unknown) => JSON.parse(((call as [string, RequestInit])[1].body as string));

describe("RepairChat", () => {
  beforeEach(() => {
    window.dataLayer = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("looks like a messaging app: assistant header, icon send button, times on sent messages", async () => {
    vi.stubGlobal("fetch", api(ndjson([{ type: "session", id: SESSION }, { type: "message", text: "Which car is it?" }, { type: "done" }])));
    const { container } = render(<RepairChat locale="en" dict={en} pagePath="/en/auto-repair" />);
    expect(screen.getByText(en.repairChat.assistantStatus)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.repairChat.send })).toBeDisabled();
    // The greeting has no time (server and browser must render the same text).
    expect(container.querySelectorAll(".wa-meta")).toHaveLength(0);

    await ask("brake noise");
    await screen.findByText("Which car is it?");
    expect(container.querySelectorAll(".wa-bubble-out .wa-meta")).toHaveLength(1);
    expect(container.querySelectorAll(".wa-bubble-in .wa-meta").length).toBeGreaterThan(0);
  });

  it("opens the chat right away, without asking for name or phone", async () => {
    const fetchMock = api(ndjson([{ type: "session", id: SESSION }, { type: "message", text: "Which car is it?" }, { type: "done" }]));
    vi.stubGlobal("fetch", fetchMock);
    render(<RepairChat locale="en" dict={en} pagePath="/en/auto-repair" />);
    expect(screen.getByText(en.repairChat.greeting)).toBeInTheDocument();
    expect(screen.queryByLabelText(en.repairChat.gate.name)).not.toBeInTheDocument();

    await ask("brake noise");
    expect(await screen.findByText("Which car is it?")).toBeInTheDocument();
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({
      locale: "en",
      history: [],
      message: "brake noise",
      vehicleKey: null,
      lead: null,
      sessionId: null,
    });
  });

  it("asks for name and phone when the estimate is ready, then shows it", async () => {
    const fetchMock = api(
      held("Front pads are about $291 before tax.", estimate),
      ndjson([{ type: "message", text: "Rear pads too?" }, { type: "done" }]),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<RepairChat locale="en" dict={en} pagePath="/en/auto-repair" />);
    await userEvent.click(screen.getByRole("button", { name: en.repairChat.starters[0] }));

    const gate = await screen.findByTestId("lead-gate");
    expect(gate).toHaveTextContent(en.repairChat.gate.title);
    expect(screen.queryByTestId("estimate-card")).not.toBeInTheDocument();
    expect(screen.queryByText(/Front pads are about/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(en.repairChat.placeholder)).not.toBeInTheDocument();

    await giveContact(en, "917-0710");
    expect(screen.getByRole("alert")).toHaveTextContent(en.repairChat.gate.invalidPhone);
    await userEvent.clear(screen.getByLabelText(en.repairChat.gate.phone));
    await userEvent.type(screen.getByLabelText(en.repairChat.gate.phone), lead.phone);
    await userEvent.click(screen.getByRole("button", { name: en.repairChat.gate.submit }));

    expect(await screen.findByText("Front pads are about $291 before tax.")).toBeInTheDocument();
    const card = screen.getByTestId("estimate-card");
    // Ranges only: parts span and the total widened 10% each way, no exact figures or part names.
    expect(card).toHaveTextContent("$262 – $320");
    expect(card).not.toHaveTextContent("$291.05");
    expect(card).not.toHaveTextContent("$264.65");
    expect(card).toHaveTextContent(en.repairChat.demo.remarkRange);
    expect(screen.getByTestId("screenshot-tip")).toHaveTextContent("E-ABC123");
    const whatsapp = screen.getByRole("link", { name: en.repairChat.estimate.book });
    expect(decodeURIComponent(whatsapp.getAttribute("href")!)).toContain("this is Kevin");
    expect(screen.queryByTestId("lead-gate")).not.toBeInTheDocument();

    const unlock = fetchMock.mock.calls.find(([url]) => url === "/api/repair-lead");
    expect(bodyOf(unlock)).toEqual({ locale: "en", lead, sessionId: SESSION });

    // Later messages carry the contact details and the released reply.
    await ask("ok");
    await screen.findByText("Rear pads too?");
    const later = bodyOf(fetchMock.mock.calls.filter(([url]) => url === "/api/repair-chat")[1]);
    expect(later.lead).toEqual(lead);
    expect(later.sessionId).toBe(SESSION);
    expect(later.history).toEqual([
      { role: "user", text: en.repairChat.starters[0] },
      { role: "assistant", text: "Front pads are about $291 before tax." },
    ]);

    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    window.dispatchEvent(new Event("pagehide"));
    expect(beacon).toHaveBeenCalledWith("/api/repair-lead/finish", expect.any(Blob));
  });

  it("asks the last question again if the server lost the held reply", async () => {
    const fetchMock = api(
      ndjson([{ type: "session", id: SESSION }, { type: "lead_required" }, { type: "done" }]),
      ndjson([{ type: "estimate", estimate }, { type: "message", text: "About $291." }, { type: "done" }]),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<RepairChat locale="en" dict={en} pagePath="/en/auto-repair" />);
    await ask("2019 Camry front pads");
    await giveContact();
    expect(await screen.findByText("About $291.")).toBeInTheDocument();
    const retry = bodyOf(fetchMock.mock.calls.filter(([url]) => url === "/api/repair-chat")[1]);
    expect(retry).toMatchObject({ message: "2019 Camry front pads", lead, history: [] });
    expect(screen.getAllByText("2019 Camry front pads")).toHaveLength(1);
  });

  it("sends the prior conversation and confirmed vehicle on the next message", async () => {
    const fetchMock = api(
      ndjson([{ type: "vehicle", vehicle: { key: "k1", label: "Camry" } }, { type: "message", text: "Which axle?" }, { type: "done" }]),
      ndjson([{ type: "message", text: "Got it." }, { type: "done" }]),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<RepairChat locale="en" dict={en} pagePath="/en/auto-repair" />);
    await ask("2019 Camry pads");
    await screen.findByText("Which axle?");
    await ask("Front");
    await screen.findByText("Got it.");

    const second = bodyOf(fetchMock.mock.calls[1]);
    expect(second.history).toEqual([
      { role: "user", text: "2019 Camry pads" },
      { role: "assistant", text: "Which axle?" },
    ]);
    expect(second.vehicleKey).toBe("k1");
  });

  it("shows the localized busy message when rate-limited", async () => {
    vi.stubGlobal("fetch", api(new Response("{}", { status: 429 })));
    render(<RepairChat locale="zh-CN" dict={zhCN} pagePath="/zh-CN/auto-repair" />);
    await userEvent.click(screen.getByRole("button", { name: zhCN.repairChat.starters[1] }));
    await waitFor(() => expect(screen.getByText(zhCN.repairChat.errors.busy)).toBeInTheDocument());
  });

  it("always shows the sample estimate without the referral price or booking buttons", () => {
    render(<RepairChat locale="zh-TW" dict={zhTW} pagePath="/zh-TW/auto-repair" />);
    const demo = screen.getByTestId("demo-estimate-card");
    expect(screen.getByText(zhTW.repairChat.demo.label)).toBeInTheDocument();
    expect(demo).toHaveTextContent(zhTW.repairChat.demo.stamp);
    // Ranges only: parts span $159–$186 (3 options), total widened 10% each way, no itemised part list.
    expect(demo).toHaveTextContent("$159 – $186");
    expect(demo).toHaveTextContent("$262 – $350");
    expect(demo).toHaveTextContent(zhTW.repairChat.demo.partsLine.replace("{count}", "3"));
    expect(demo).toHaveTextContent(zhTW.repairChat.demo.remarkReference);
    expect(demo).toHaveTextContent(zhTW.repairChat.demo.remarkRange);
    expect(demo).not.toHaveTextContent("PRO-ACT");
    expect(demo).not.toHaveTextContent("$185.84");
    expect(demo).not.toHaveTextContent("$264.65");
    expect(screen.queryByRole("link", { name: zhTW.repairChat.estimate.book })).not.toBeInTheDocument();
    expect(screen.queryByTestId("screenshot-tip")).not.toBeInTheDocument();
  });

  it("offers the booking card once, after the first estimate, and sends the chosen slot", async () => {
    const fetchMock = api(
      held("About $291.", estimate),
      ndjson([{ type: "estimate", estimate: { ...estimate, id: "E-SECOND" } }, { type: "message", text: "Rear too." }, { type: "done" }]),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<RepairChat locale="zh-CN" dict={zhCN} pagePath="/zh-CN/auto-repair" />);
    const b = zhCN.repairChat.booking;

    await ask("前刹车片", zhCN);
    await giveContact(zhCN);
    const card = await screen.findByTestId("booking-card");
    expect(card).toHaveTextContent(b.screenshot);
    const submit = screen.getByRole("button", { name: b.submit });
    expect(submit).toBeDisabled();

    await waitFor(() => expect(screen.getByRole("button", { name: /10月14日/ })).toBeEnabled());
    expect(screen.getByRole("button", { name: /10月13日/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /10月14日/ }));
    await userEvent.click(screen.getByRole("button", { name: "11:30" }));
    await userEvent.click(submit);
    expect(await screen.findByText(/已收到您的预约请求/)).toHaveTextContent("11:30");

    const post = fetchMock.mock.calls.find(
      ([url, init]) => url === "/api/repair-booking" && (init as RequestInit | undefined)?.method === "POST",
    );
    expect(bodyOf(post)).toEqual({ locale: "zh-CN", lead, sessionId: SESSION, date: "2026-10-14", time: "11:30" });

    await ask("后面也要", zhCN);
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
    vi.stubGlobal("fetch", api(held("好的", flat, team)));
    render(<RepairChat locale="zh-CN" dict={zhCN} pagePath="/zh-CN/auto-repair" />);
    await ask("换机油", zhCN);
    await giveContact(zhCN);
    await screen.findByText("好的");

    const [flatCard, teamCard] = screen.getAllByTestId("estimate-card");
    expect(flatCard).toHaveTextContent(zhCN.repairChat.estimate.flatOptions);
    expect(flatCard).toHaveTextContent("$95 – $120");
    expect(flatCard).not.toHaveTextContent(zhCN.repairChat.demo.remarkRange);
    expect(flatCard).toHaveTextContent("含机油和机油滤芯");
    expect(flatCard).not.toHaveTextContent(zhCN.repairChat.estimate.labor);
    expect(teamCard).toHaveTextContent(zhCN.repairChat.estimate.teamQuote);
    expect(teamCard).not.toHaveTextContent("$");
    expect(screen.getAllByTestId("screenshot-tip")).toHaveLength(1);
  });

  it("renders a tire card with one installed price per tire", async () => {
    const tires = {
      ...estimate,
      id: "E-TIRE",
      kind: "tires",
      service: "新轮胎（含安装） · 225/65R17",
      position: "",
      laborHours: 0,
      laborWalkIn: 0,
      partOptions: [
        { description: "BrandA AS1 225/65R17 102H", series: "all_season", unitListPrice: 132, quantity: 4, total: 528, inStockLocally: false, note: "" },
        { description: "BrandF W1 225/65R17 102H", series: "winter", unitListPrice: 157, quantity: 4, total: 628, inStockLocally: false, note: "" },
      ],
      totalLow: 528,
      totalHigh: 628,
      laborNote: "",
      partsNote: "每条价格已含安装。库存和到货时间以店里确认为准。",
    };
    vi.stubGlobal("fetch", api(held("两款可选。", tires)));
    render(<RepairChat locale="zh-CN" dict={zhCN} pagePath="/zh-CN/auto-repair" />);
    await ask("225/65R17 四条多少钱", zhCN);
    await giveContact(zhCN);
    await screen.findByText("两款可选。");
    const card = screen.getByTestId("estimate-card");
    expect(card).toHaveTextContent(zhCN.repairChat.estimate.tireOptions);
    expect(card).toHaveTextContent("BrandA AS1 225/65R17 102H · $132 × 4");
    expect(card).toHaveTextContent("$528 – $628");
    expect(card).toHaveTextContent("库存和到货时间以店里确认为准");
    expect(card).not.toHaveTextContent(/环保|eco/i);
  });

  it("shows the call-us message and closes the input when over today's limit", async () => {
    const text = zhTW.repairChat.capped.replaceAll("{phone}", "+1 (778) 917-0710");
    vi.stubGlobal("fetch", api(ndjson([{ type: "session", id: SESSION }, { type: "capped" }, { type: "message", text }, { type: "done" }])));
    render(<RepairChat locale="zh-TW" dict={zhTW} pagePath="/zh-TW/auto-repair" />);
    await ask("煞車有聲音", zhTW);
    expect(await screen.findByText(/看到您今天已經多次聯絡我們了/)).toHaveTextContent("+1 (778) 917-0710");
    expect(screen.queryByLabelText(zhTW.repairChat.placeholder)).not.toBeInTheDocument();
    expect(screen.getByTestId("capped-contact")).toBeInTheDocument();
  });

  it("asks for contact details with appointment wording when the chat booked a time", async () => {
    let released = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/repair-lead") {
          released = true;
          return Response.json({ ok: true, sessionId: SESSION, pending: { text: "已把周三 15:00 的预约请求发给店里。", estimates: [] } });
        }
        return ndjson([{ type: "session", id: SESSION }, { type: "lead_required", reason: "appointment" }, { type: "done" }]);
      }),
    );
    render(<RepairChat locale="zh-CN" dict={zhCN} pagePath="/zh-CN/auto-repair" />);
    await ask("明天下午3点过来", zhCN);
    const gate = await screen.findByTestId("lead-gate");
    expect(gate).toHaveTextContent(zhCN.repairChat.gate.appointmentTitle);
    expect(gate).not.toHaveTextContent(zhCN.repairChat.gate.title);
    await userEvent.type(screen.getByLabelText(zhCN.repairChat.gate.name), lead.name);
    await userEvent.type(screen.getByLabelText(zhCN.repairChat.gate.phone), lead.phone);
    await userEvent.click(screen.getByRole("button", { name: zhCN.repairChat.gate.appointmentSubmit }));
    expect(await screen.findByText("已把周三 15:00 的预约请求发给店里。")).toBeInTheDocument();
    expect(released).toBe(true);
    expect(screen.queryByTestId("booking-card")).not.toBeInTheDocument();
  });

  it("labels a card in the customer's language, not the page's", async () => {
    vi.stubGlobal("fetch", api(held("About $291.", { ...estimate, lang: "en" })));
    render(
      <RepairChat
        locale="zh-CN"
        dict={zhCN}
        pagePath="/zh-CN/auto-repair"
        cardCopies={{ en: en.repairChat, "zh-CN": zhCN.repairChat, "zh-TW": zhTW.repairChat }}
      />,
    );
    await ask("front brake pads for my camry", zhCN);
    await giveContact(zhCN);
    await screen.findByText("About $291.");
    const card = screen.getByTestId("estimate-card");
    expect(card).toHaveTextContent(en.repairChat.estimate.total);
    expect(card).not.toHaveTextContent(zhCN.repairChat.estimate.total);
  });

  it("doesn't ask the AI the same question twice in a row", async () => {
    const fetchMock = api(ndjson([{ type: "message", text: "Which car is it?" }, { type: "done" }]));
    vi.stubGlobal("fetch", fetchMock);
    render(<RepairChat locale="en" dict={en} pagePath="/en/auto-repair" />);
    await ask("brake noise");
    await screen.findByText("Which car is it?");
    await ask("brake noise");
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/repair-chat")).toHaveLength(1);
    expect(screen.getAllByText("brake noise")).toHaveLength(1);
  });

  it("offers a starter question that names the trim, so it can be priced straight away", () => {
    for (const dict of [en, zhCN, zhTW]) expect(dict.repairChat.starters[2]).toMatch(/Civic LX|思域 LX/);
  });

  it("has complete copy in every locale", () => {
    for (const dict of [en, zhCN, zhTW]) {
      expect(dict.repairChat.starters).toHaveLength(3);
      expect(Object.keys(dict.repairChat.status).sort()).toEqual(["estimate", "services", "thinking", "vehicle"]);
      expect(dict.privacy.sections.some((s) => /Claude/.test(s.body))).toBe(true);
      expect(dict.repairChat.greeting).not.toContain("{name}");
      expect(dict.repairChat.greeting).toContain("VIN");
      expect(dict.repairChat.capped).toContain("{phone}");
      expect(dict.repairChat.booking.done).toContain("{slot}");
      expect(dict.repairChat.booking.weekdays).toHaveLength(7);
    }
    expect(zhCN.repairChat.intro).toBe("告诉助手您的车型和故障现象。它会分析可能的原因并给出零件和维修参考估价。");
  });
});

describe("RepairChat photos", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends a photo with the question, shows it, and only mentions it on later turns", async () => {
    const server = api(
      ndjson([{ type: "session", id: SESSION }, { type: "message", text: "That's a 2019 Camry, VIN …1234." }, { type: "done" }]),
      ndjson([{ type: "message", text: "Front pads?" }, { type: "done" }]),
    );
    vi.stubGlobal("fetch", server);
    render(<RepairChat locale="en" dict={en} pagePath="/en/auto-repair" />);
    await userEvent.upload(screen.getByTestId("photo-input"), new File([new Uint8Array([1, 2, 3])], "vin.jpg", { type: "image/jpeg" }));
    // A photo alone is enough to send.
    await waitFor(() => expect(screen.getByRole("button", { name: en.repairChat.send })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: en.repairChat.send }));
    await screen.findByText("That's a 2019 Camry, VIN …1234.");
    const first = bodyOf(server.mock.calls[0]);
    expect(first.photos).toEqual([{ name: "vin.jpg", mediaType: "image/jpeg", data: "AQID" }]);
    expect(screen.getByTestId("sent-photos")).toBeInTheDocument();

    await ask("brake noise");
    await screen.findByText("Front pads?");
    const second = bodyOf(server.mock.calls[1]);
    expect(second.photos).toBeUndefined();
    expect(second.history[0].text).toBe("[Photo ×1]");
  });

  it("takes at most two photos and refuses other files", async () => {
    vi.stubGlobal("fetch", api());
    render(<RepairChat locale="zh-CN" dict={zhCN} pagePath="/zh-CN/auto-repair" />);
    await userEvent.upload(screen.getByTestId("photo-input"), new File(["x"], "list.pdf", { type: "application/pdf" }), { applyAccept: false });
    expect(await screen.findByRole("alert")).toHaveTextContent(zhCN.repairChat.photo.failed);
    const photo = (n: number) => new File([new Uint8Array([n])], `p${n}.jpg`, { type: "image/jpeg" });
    await userEvent.upload(screen.getByTestId("photo-input"), [photo(1), photo(2), photo(3)]);
    // Photos are prepared one by one: wait for the notice and both previews, not the first render.
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(zhCN.repairChat.photo.max));
    await waitFor(() => expect(screen.getAllByRole("button", { name: new RegExp(zhCN.repairChat.photo.remove) })).toHaveLength(2));
  });
});
