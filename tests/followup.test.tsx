import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FollowUpPanel } from "@/components/workbench/FollowUpPanel";
import { buildEstimate, type EstimateCard } from "@/lib/repair-chat/pricing";
import type { Conversation, Turn } from "@/lib/workbench/conversation-types";
import { ConversationStore, newTurnId } from "@/lib/workbench/conversations";
import { defaultOffer, offerPrices, renderFollowUpEmail, smsLink, type FollowUpOffer } from "@/lib/workbench/followup";
import { handleFollowUp, readOffer, type FollowUpDeps } from "@/lib/workbench/followup-http";
import { FollowUpStore } from "@/lib/workbench/followup-store";
import { HouseRulesStore } from "@/lib/workbench/house-rules-store";
import { memoryKv } from "@/lib/workbench/kv";
import { handleUnsubscribe } from "@/lib/workbench/unsubscribe-http";

// Kevin, 2026-11-14: follow-up offers to website customers who left a phone or
// email, by email (template C, from the repair mailbox) or a text they send.

const card = (): EstimateCard =>
  buildEstimate(
    "2019 Toyota Camry LE",
    { status: "ok", serviceName: "Brake Pads R&R", position: "Front", laborHours: 1.1, laborNote: "", primaryPartName: "Pads", partOptions: [{ description: "Pads", series: "", listPrice: 159.05, quantity: 1, inStockLocally: true, note: "" }, { description: "Pads OE", series: "", listPrice: 185.84, quantity: 1, inStockLocally: true, note: "" }], otherPartNames: [], partsNote: "" },
    "E-7F3A21",
    new Date("2026-11-10T20:00:00Z"),
  );

const offer = (patch: Partial<FollowUpOffer> = {}): FollowUpOffer => ({
  estimateId: "E-7F3A21",
  kind: "amount",
  value: 30,
  expiresOn: "2026-11-30",
  subject: "您的维修报价单（已加 $30 优惠）",
  message: "林先生您好，这是您查的前刹车片报价。",
  sms: "林先生您好，SPEEDX AUTO 给您加了 $30 优惠。",
  ...patch,
});

async function seeded(website: Partial<NonNullable<Conversation["website"]>> = {}) {
  const kv = memoryKv();
  const conversations = new ConversationStore(kv);
  const turns: Turn[] = [
    { id: newTurnId(), role: "user", text: "2019 Camry 前刹车片多少钱", author: "website", at: 1, quotes: [], source: "website" },
    { id: newTurnId(), role: "assistant", text: "大约 $262–$350", author: "assistant", at: 2, quotes: [], source: "website", estimates: [card()] },
  ];
  await conversations.append("w-thread1", "website", turns, undefined, "2019 Camry");
  await conversations.change("w-thread1", "website", (c) => {
    c.website = { name: "Lin Wei", phone: "604-555-0182", email: "lin@example.com", locale: "zh-CN", ...website };
  });
  return { kv, conversations };
}

function deps(kv: ReturnType<typeof memoryKv>, conversations: ConversationStore, overrides: Partial<FollowUpDeps> = {}): FollowUpDeps & { sent: unknown[]; rules: () => HouseRulesStore } {
  const sent: unknown[] = [];
  const rules = new HouseRulesStore(kv);
  return {
    user: async () => ({ email: "kevin@x.com" }),
    conversations: () => conversations,
    store: () => new FollowUpStore(kv),
    rules: () => rules,
    mailer: () => async (mail) => void sent.push(mail),
    client: () => null,
    log: () => {},
    now: () => new Date("2026-11-14T20:00:00Z"),
    sent,
    ...overrides,
  } as FollowUpDeps & { sent: unknown[]; rules: () => HouseRulesStore };
}

const req = (body: unknown) => new Request("https://repair.speedxrental.com/api/workbench/conversations/w-thread1/followup", { method: "POST", body: JSON.stringify(body) });

describe("the offer and the email", () => {
  it("takes the offer off the range the customer saw", () => {
    // Off the card's totals ($291.05–$317.84), then the ±10% allowance, as the website will show it.
    expect(offerPrices(card(), { kind: "amount", value: 30 })).toMatchObject({ before: { low: 262, high: 350 }, after: { low: 235, high: 317 } });
    expect(offerPrices(card(), { kind: "percent", value: 10 }).after).toEqual({ low: 236, high: 315 });
  });

  it("renders template C with the quote, the offer, the shop and an unsubscribe link, in the customer's language", () => {
    const zh = renderFollowUpEmail({ locale: "zh-CN", customerName: "Lin Wei", card: card(), offer: offer(), unsubscribeUrl: "https://speedxrental.com/unsubscribe/tok" });
    expect(zh.html).toContain("$262 – $350");
    expect(zh.html).toContain("− $30");
    expect(zh.html).toContain("$235 – $317");
    expect(zh.html).toContain("Lin专属优惠");
    expect(zh.html).toContain("2026-11-30 前有效");
    expect(zh.html).toContain("https://speedxrental.com/unsubscribe/tok");
    expect(zh.html).toContain("2980 Number 3 Rd");
    expect(zh.text).toContain("$235 – $317");
    const tw = renderFollowUpEmail({ locale: "zh-TW", customerName: "Lin", card: card(), offer: offer(), unsubscribeUrl: "u", toTraditional: (t) => t.replace("优惠", "優惠") });
    expect(tw.html).toContain("優惠");
    const en = renderFollowUpEmail({ locale: "en", customerName: "Lin", card: card(), offer: offer({ subject: "Your quote" }), unsubscribeUrl: "u" });
    expect(en.html).toContain("Offer for Lin");
    expect(en.html).not.toMatch(/\$120|per hour|cost/i);
  });

  it("escapes what staff type", () => {
    const mail = renderFollowUpEmail({ locale: "en", customerName: "<b>x</b>", card: card(), offer: offer({ message: "<script>alert(1)</script>" }), unsubscribeUrl: "u" });
    expect(mail.html).not.toContain("<script>");
  });

  it("opens Google Messages with the text filled in", () => {
    expect(smsLink("604-555-0182", "Hi & bye")).toBe("sms:+16045550182?body=Hi%20%26%20bye");
  });

  it("drafts a sensible offer without the AI", () => {
    const d = defaultOffer(card(), "zh-CN", "Lin Wei", "2026-11-14");
    expect(d).toMatchObject({ kind: "percent", value: 10, expiresOn: "2026-11-28" });
    expect(d.sms).toContain("778-917-0710");
  });
});

describe("/api/workbench/conversations/[id]/followup", () => {
  it("checks the offer staff send", async () => {
    const { conversations } = await seeded();
    const c = (await conversations.get("w-thread1"))!;
    expect(readOffer(offer({ value: 80, kind: "percent" }), c, "2026-11-14")).toMatch(/1%–50%/);
    expect(readOffer(offer({ expiresOn: "2026-11-01" }), c, "2026-11-14")).toMatch(/今天或以后/);
    expect(readOffer(offer({ estimateId: "E-NOPE" }), c, "2026-11-14")).toMatch(/选一个/);
  });

  it("drafts with the AI from the chat and estimates, never the phone or email", async () => {
    const { kv, conversations } = await seeded();
    const seen: string[] = [];
    const client = {
      beta: {
        messages: {
          create: async (params: unknown) => {
            seen.push(JSON.stringify(params));
            return {
              stop_reason: "tool_use",
              content: [{ type: "tool_use", id: "t", name: "draft_offer", input: { estimate_id: "E-7F3A21", discount_kind: "amount", discount_value: 25, valid_days: 10, subject: "林先生，刹车片优惠", message: "您好", sms: "您好" } }],
            } as never;
          },
        },
      },
    };
    const res = (await (await handleFollowUp(req({ action: "draft" }), "w-thread1", deps(kv, conversations, { client: () => client }))).json()) as { offer: FollowUpOffer };
    expect(res.offer).toMatchObject({ kind: "amount", value: 25, expiresOn: "2026-11-24", subject: "林先生，刹车片优惠" });
    expect(seen[0]).toContain("Brake Pads R&R");
    expect(seen[0]).not.toMatch(/604|0182|lin@example/);
  });

  it("sends the email, registers the customer's discount once, and records it", async () => {
    const { kv, conversations } = await seeded();
    const d = deps(kv, conversations);
    const res = await handleFollowUp(req({ action: "send", offer: offer() }), "w-thread1", d);
    expect(res.status).toBe(200);
    const mail = d.sent[0] as { to: string; subject: string; oneClickUrl: string; html: string };
    expect(mail.to).toBe("lin@example.com");
    // Mail apps' one-click unsubscribe POSTs to the API; the footer links to the page.
    expect(mail.oneClickUrl).toMatch(/^https:\/\/speedxrental\.com\/api\/followup\/unsubscribe\?token=[A-Za-z0-9_-]{22}$/);
    expect(mail.html).toMatch(/https:\/\/speedxrental\.com\/unsubscribe\/[A-Za-z0-9_-]{22}/);
    expect(mail.oneClickUrl).not.toContain("lin");
    const rules = await d.rules()!.list(true);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ kind: "discount", amount: 30, customerPhone: "6045550182", endDate: "2026-11-30", appliesTo: "labor_jobs", serviceKeyword: "Brake Pads" });
    await handleFollowUp(req({ action: "log", channel: "sms", offer: offer() }), "w-thread1", d);
    expect(await d.rules()!.list(true)).toHaveLength(1);
    const saved = (await conversations.get("w-thread1"))!;
    expect(saved.followUps?.map((f) => f.channel)).toEqual(["email", "sms"]);
  });

  it("refuses to email until the mailbox is set up, or after the customer unsubscribed", async () => {
    const { kv, conversations } = await seeded();
    expect((await handleFollowUp(req({ action: "send", offer: offer() }), "w-thread1", deps(kv, conversations, { mailer: () => null }))).status).toBe(503);
    const d = deps(kv, conversations);
    await handleFollowUp(req({ action: "send", offer: offer() }), "w-thread1", d);
    const oneClick = (d.sent[0] as { oneClickUrl: string }).oneClickUrl;
    const unsub = await handleUnsubscribe(new Request(oneClick, { method: "POST" }), () => new FollowUpStore(kv));
    expect(unsub.status).toBe(200);
    const later = deps(kv, conversations, { now: () => new Date("2026-11-14T21:00:00Z") });
    const again = await handleFollowUp(req({ action: "send", offer: offer() }), "w-thread1", later);
    expect(again.status).toBe(409);
    expect((await handleUnsubscribe(new Request("https://speedxrental.com/api/followup/unsubscribe?token=bad", { method: "POST" }), () => new FollowUpStore(kv))).status).toBe(400);
  });

  it("only works for website customers with a priced estimate, and for signed-in staff", async () => {
    const { kv, conversations } = await seeded();
    expect((await handleFollowUp(req({ action: "draft" }), "w-thread1", deps(kv, conversations, { user: async () => null }))).status).toBe(401);
    await conversations.append("cplain01", "kevin@x.com", [{ id: newTurnId(), role: "user", text: "hi", author: "kevin@x.com", at: 1, quotes: [] }]);
    expect((await handleFollowUp(req({ action: "draft" }), "cplain01", deps(kv, conversations))).status).toBe(404);
  });
});

describe("follow-up review fixes", () => {
  it("won't email twice within ten minutes, after six months, or to a list of addresses", async () => {
    const { kv, conversations } = await seeded();
    const d = deps(kv, conversations);
    await handleFollowUp(req({ action: "send", offer: offer() }), "w-thread1", d);
    expect((await handleFollowUp(req({ action: "send", offer: offer() }), "w-thread1", d)).status).toBe(409);
    expect(d.sent).toHaveLength(1);
    const old = deps(kv, conversations, { now: () => new Date("2027-08-01T20:00:00Z") });
    const stale = (await (await handleFollowUp(req({ action: "send", offer: offer({ expiresOn: "2027-08-30" }) }), "w-thread1", old)).json()) as { message: string };
    expect(stale.message).toMatch(/6 个月/);
    const two = await seeded({ email: "a@x.com,victim@y.com" });
    expect((await handleFollowUp(req({ action: "send", offer: offer() }), "w-thread1", deps(two.kv, two.conversations))).status).toBe(400);
  });

  it("explains a Gmail sign-in failure, and doesn't report failure once the email is out", async () => {
    const { kv, conversations } = await seeded();
    const authFail = deps(kv, conversations, { mailer: () => async () => Promise.reject(Object.assign(new Error("Invalid login"), { code: "EAUTH", responseCode: 535 })) });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = (await (await handleFollowUp(req({ action: "send", offer: offer() }), "w-thread1", authFail)).json()) as { message: string };
    expect(res.message).toMatch(/应用专用密码/);
    const flaky = deps(kv, conversations);
    vi.spyOn(conversations, "addFollowUp").mockRejectedValueOnce(new Error("KV down"));
    const sent = await handleFollowUp(req({ action: "send", offer: offer() }), "w-thread1", flaky);
    expect(sent.status).toBe(200);
    expect(((await sent.json()) as { warning?: string }).warning).toMatch(/已发出/);
  });

  it("strips line breaks from the subject", async () => {
    const { conversations } = await seeded();
    const c = (await conversations.get("w-thread1"))!;
    expect((readOffer(offer({ subject: "a\nBcc: x@y.com" }), c, "2026-11-14") as FollowUpOffer).subject).toBe("a Bcc: x@y.com");
  });
});

describe("FollowUpPanel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads the draft and the preview, and says when the mailbox isn't set up", async () => {
    const { conversations } = await seeded();
    const c = (await conversations.get("w-thread1"))!;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { action: string };
        if (body.action === "draft") return Response.json({ offer: offer(), estimates: [card()], mailerReady: false });
        return Response.json({ subject: "您的维修报价单", html: "<p>preview</p>" });
      }),
    );
    render(<FollowUpPanel conversation={c} onClose={() => {}} onChanged={() => {}} />);
    expect(await screen.findByDisplayValue("您的维修报价单（已加 $30 优惠）")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTitle("邮件预览")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /发邮件给 lin@example.com/ })).toBeDisabled();
    expect(screen.getByText(/FOLLOWUP_SMTP_USER/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Google Messages/ })).toHaveAttribute("href", expect.stringMatching(/^sms:\+16045550182\?body=/));
  });
});
