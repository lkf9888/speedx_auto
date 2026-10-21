import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { emitRepairLead } = vi.hoisted(() => ({ emitRepairLead: vi.fn() }));
vi.mock("@/lib/analytics", async (original) => ({ ...(await original<typeof import("@/lib/analytics")>()), emitRepairLead }));

import { RepairBooking } from "@/components/RepairBooking";
import { RepairChat } from "@/components/RepairChat";
import { en } from "@/i18n/en";
import { zhCN } from "@/i18n/zh-CN";

// The repair search campaigns optimize for these two conversions: each is reported once, and only after the server accepted it.

const SESSION = "c".repeat(32);
const lead = { name: "Kevin", phone: "604-555-0182" };

function ndjson(events: unknown[]) {
  return new Response(events.map((e) => JSON.stringify(e)).join("\n") + "\n", { headers: { "Content-Type": "application/x-ndjson" } });
}

async function giveContact() {
  await userEvent.type(await screen.findByLabelText(en.repairChat.gate.name), lead.name);
  await userEvent.type(screen.getByLabelText(en.repairChat.gate.phone), lead.phone);
  await userEvent.click(screen.getByRole("button", { name: en.repairChat.gate.submit }));
}

beforeEach(() => {
  emitRepairLead.mockClear();
  window.dataLayer = [];
});
afterEach(() => vi.unstubAllGlobals());

describe("estimate lead conversion", () => {
  it("is reported once, after /api/repair-lead says ok, and not when it fails", async () => {
    let leadAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/repair-lead") {
          leadAttempts += 1;
          return leadAttempts === 1 ? new Response("down", { status: 503 }) : Response.json({ ok: true, sessionId: SESSION, pending: { text: "About $291.", estimates: [] } });
        }
        if (url === "/api/repair-booking") return Response.json({ days: [] });
        return ndjson([{ type: "session", id: SESSION }, { type: "lead_required" }, { type: "done" }]);
      }),
    );
    render(<RepairChat locale="en" dict={en} pagePath="/en/auto-repair" />);
    await userEvent.type(screen.getByLabelText(en.repairChat.placeholder), "front brake pads{Enter}");

    await giveContact();
    // The first attempt failed: nothing reported, the form stays.
    await waitFor(() => expect(leadAttempts).toBe(1));
    expect(emitRepairLead).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: en.repairChat.gate.submit }));
    expect(await screen.findByText("About $291.")).toBeInTheDocument();
    expect(emitRepairLead).toHaveBeenCalledTimes(1);
    expect(emitRepairLead).toHaveBeenCalledWith("estimate_lead", "en");
  });
});

describe("booking request conversion", () => {
  const days = [{ date: "2026-10-14", slots: ["11:00", "11:30"] }];

  async function book(postStatus: number) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "POST" ? Response.json({ ok: postStatus === 200 }, { status: postStatus }) : Response.json({ days }))),
    );
    render(<RepairBooking copy={zhCN.repairChat.booking} locale="zh-CN" lead={lead} sessionId={SESSION} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /10月14日/ })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: /10月14日/ }));
    await userEvent.click(screen.getByRole("button", { name: "11:30" }));
    await userEvent.click(screen.getByRole("button", { name: zhCN.repairChat.booking.submit }));
  }

  it("is reported once when the shop received the request", async () => {
    await book(200);
    expect(await screen.findByText(/已收到您的预约请求/)).toBeInTheDocument();
    expect(emitRepairLead).toHaveBeenCalledTimes(1);
    expect(emitRepairLead).toHaveBeenCalledWith("booking_request", "zh-CN");
  });

  it("is not reported when the request failed", async () => {
    await book(500);
    await waitFor(() => expect(screen.getByRole("button", { name: zhCN.repairChat.booking.submit })).toBeEnabled());
    expect(emitRepairLead).not.toHaveBeenCalled();
  });
});
