import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostingEstimateChat } from "@/components/HostingEstimateChat";
import { zhCN } from "@/i18n/zh-CN";
import * as analytics from "@/lib/analytics";
import { saveConsent } from "@/lib/consent";
import { estimateIncome } from "@/lib/hosting-estimate/estimate";
import { loadMetaPixel, resetMetaPixelForTests } from "@/lib/meta-pixel";

const HOSTING_LABEL = "AW-625073096/hostingTestLabel";
const REPAIR_LABEL = "AW-625073096/--kTCJeh_aQdEMi3h6oC";

function resetTracking() {
  localStorage.clear();
  window.dataLayer = [];
  delete window.gtag;
  resetMetaPixelForTests();
}

const metaTracks = () => (window.fbq?.queue ?? []).filter((call) => call[0] === "track");

describe("emitHostingLead", () => {
  beforeEach(resetTracking);
  afterEach(resetTracking);

  it("after consent: one generate_lead, one Meta Lead and one Ads conversion with the hosting label", () => {
    saveConsent("granted");
    loadMetaPixel();
    const gtag = vi.fn();
    window.gtag = gtag;
    analytics.emitHostingLead("en", HOSTING_LABEL);
    expect(gtag.mock.calls).toEqual([
      ["event", "generate_lead", { lead_type: "hosting_estimate", intent: "hosting", locale: "en" }],
      ["event", "conversion", { send_to: HOSTING_LABEL, currency: "CAD", transport_type: "beacon" }],
    ]);
    expect(metaTracks()).toEqual([["track", "Lead", { content_category: "hosting" }]]);
  });

  it("without consent: only generate_lead, no Meta and no Ads", () => {
    loadMetaPixel();
    const gtag = vi.fn();
    window.gtag = gtag;
    analytics.emitHostingLead("zh-CN", HOSTING_LABEL);
    expect(gtag.mock.calls).toEqual([["event", "generate_lead", { lead_type: "hosting_estimate", intent: "hosting", locale: "zh-CN" }]]);
    expect(window.fbq).toBeUndefined();
  });

  it("sends no Ads conversion until the hosting label exists, and never the repair label", () => {
    expect(analytics.HOSTING_LEAD_CONVERSION_DESTINATION).not.toBe(REPAIR_LABEL);
    saveConsent("granted");
    loadMetaPixel();
    const gtag = vi.fn();
    window.gtag = gtag;
    analytics.emitHostingLead("en", null);
    expect(gtag.mock.calls.map((c) => c[1])).toEqual(["generate_lead"]);
    expect(metaTracks()).toEqual([["track", "Lead", { content_category: "hosting" }]]);
  });

  it("queues the conversion for the Google tag when gtag hasn't loaded yet", () => {
    saveConsent("granted");
    analytics.emitHostingLead("zh-TW", HOSTING_LABEL);
    const pushed = JSON.stringify(window.dataLayer);
    expect(pushed).toContain("generate_lead");
    expect(pushed).toContain(HOSTING_LABEL);
  });
});

describe("hosting estimate chat reports the lead once", () => {
  const card = (estimateIncome({ make: "Toyota", model: "RAV4", year: 2021 }, "H-1", new Date("2026-11-13T12:00:00")) as { card: unknown }).card;
  const chatHeld = () =>
    new Response([{ type: "session", id: "a".repeat(32) }, { type: "lead_required" }, { type: "done" }].map((e) => JSON.stringify(e)).join("\n") + "\n");

  let emit: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    resetTracking();
    emit = vi.spyOn(analytics, "emitHostingLead").mockImplementation(() => {});
  });
  afterEach(() => {
    emit.mockRestore();
    vi.unstubAllGlobals();
    resetTracking();
  });

  async function fillGate(name = "王先生", phone = "604 555 0100") {
    const gate = await screen.findByTestId("hosting-lead-gate");
    await userEvent.clear(within(gate).getByLabelText(zhCN.hostingEstimate.gate.name));
    await userEvent.type(within(gate).getByLabelText(zhCN.hostingEstimate.gate.name), name);
    await userEvent.clear(within(gate).getByLabelText(zhCN.hostingEstimate.gate.phone));
    await userEvent.type(within(gate).getByLabelText(zhCN.hostingEstimate.gate.phone), phone);
    await userEvent.click(within(gate).getByRole("button", { name: zhCN.hostingEstimate.gate.submit }));
  }

  it("reports after the server accepts the contact, with only the locale", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url === "/api/hosting-estimate/chat" ? chatHeld() : Response.json({ pending: { text: "好的", cards: [card] } }))),
    );
    render(<HostingEstimateChat locale="zh-CN" dict={zhCN} pagePath="/zh-CN/hosting" />);
    await userEvent.click(screen.getByRole("button", { name: zhCN.hostingEstimate.starters[0] }));
    await fillGate();
    await screen.findByTestId("income-report");
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]).toEqual(["zh-CN"]);
  });

  it("does not report when the submission fails, and reports once when a retry succeeds", async () => {
    let leadCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/hosting-estimate/chat") return chatHeld();
        leadCalls += 1;
        if (leadCalls === 1) return Response.json({ error: "busy" }, { status: 429 });
        if (leadCalls === 2) throw new TypeError("network down");
        return Response.json({ pending: { text: "好的", cards: [card] } });
      }),
    );
    render(<HostingEstimateChat locale="zh-CN" dict={zhCN} pagePath="/zh-CN/hosting" />);
    await userEvent.click(screen.getByRole("button", { name: zhCN.hostingEstimate.starters[0] }));
    await fillGate();
    expect(await screen.findByRole("alert")).toHaveTextContent(zhCN.hostingEstimate.gate.failed);
    await fillGate();
    expect(await screen.findByRole("alert")).toHaveTextContent(zhCN.hostingEstimate.gate.failed);
    expect(emit).not.toHaveBeenCalled();

    await fillGate();
    await screen.findByTestId("income-report");
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("reports only once in a visit, even when the contact form is submitted a second time", async () => {
    let leadCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/hosting-estimate/chat") return chatHeld();
        leadCalls += 1;
        // First time the server lost the held report (it restarted): the page asks again and the form returns.
        return Response.json({ pending: leadCalls === 1 ? null : { text: "好的", cards: [card] } });
      }),
    );
    render(<HostingEstimateChat locale="zh-CN" dict={zhCN} pagePath="/zh-CN/hosting" />);
    await userEvent.click(screen.getByRole("button", { name: zhCN.hostingEstimate.starters[0] }));
    await fillGate();
    await fillGate("王先生", "604 555 0199");
    await screen.findByTestId("income-report");
    expect(leadCalls).toBe(2);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
