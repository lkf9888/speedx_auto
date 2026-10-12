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
  createdAt: "2026-10-11T00:00:00.000Z",
};

function ndjson(events: unknown[], status = 200) {
  return new Response(events.map((e) => JSON.stringify(e)).join("\n") + "\n", {
    status,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

describe("RepairChat", () => {
  beforeEach(() => {
    window.dataLayer = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a starter question and renders the estimate card with booking links", async () => {
    const fetchMock = vi.fn(async () =>
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

    await userEvent.click(screen.getByRole("button", { name: en.repairChat.starters[0] }));

    expect(await screen.findByText("Front pads are about $291 before tax.")).toBeInTheDocument();
    const card = screen.getByTestId("estimate-card");
    expect(card).toHaveTextContent("$291.05");
    expect(card).toHaveTextContent("$264.65");
    expect(card).toHaveTextContent("Brake Hydraulic System Bleed");
    const whatsapp = screen.getByRole("link", { name: en.repairChat.estimate.book });
    expect(decodeURIComponent(whatsapp.getAttribute("href")!)).toContain("E-ABC123");

    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toEqual({ locale: "en", history: [], message: en.repairChat.starters[0], vehicleKey: null });
  });

  it("sends the prior conversation and confirmed vehicle on the next message", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        ndjson([{ type: "vehicle", vehicle: { key: "k1", label: "Camry" } }, { type: "message", text: "Which axle?" }, { type: "done" }]),
      )
      .mockResolvedValueOnce(ndjson([{ type: "message", text: "Got it." }, { type: "done" }]));
    vi.stubGlobal("fetch", fetchMock);
    render(<RepairChat locale="en" dict={en} pagePath="/en/auto-repair" />);
    const input = screen.getByLabelText(en.repairChat.placeholder);

    await userEvent.type(input, "2019 Camry pads{Enter}");
    await screen.findByText("Which axle?");
    await userEvent.type(input, "Front{Enter}");
    await screen.findByText("Got it.");

    const second = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(second.history).toEqual([
      { role: "user", text: "2019 Camry pads" },
      { role: "assistant", text: "Which axle?" },
    ]);
    expect(second.vehicleKey).toBe("k1");
  });

  it("shows the localized busy message when rate-limited", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    render(<RepairChat locale="zh-CN" dict={zhCN} pagePath="/zh-CN/auto-repair" />);
    await userEvent.click(screen.getByRole("button", { name: zhCN.repairChat.starters[1] }));
    await waitFor(() => expect(screen.getByText(zhCN.repairChat.errors.busy)).toBeInTheDocument());
  });

  it("has complete copy in every locale", () => {
    for (const dict of [en, zhCN, zhTW]) {
      expect(dict.repairChat.starters).toHaveLength(3);
      expect(Object.keys(dict.repairChat.status).sort()).toEqual(["estimate", "services", "thinking", "vehicle"]);
      expect(dict.privacy.sections.some((s) => /Claude/.test(s.body))).toBe(true);
    }
  });
});
