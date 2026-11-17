import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SharedConversationView } from "@/components/workbench/SharedConversationView";
import { WebsiteEstimateCard } from "@/components/workbench/WebsiteCards";
import { toPlainText } from "@/lib/repair-chat/agent";
import { estimateRanges } from "@/lib/repair-chat/pricing";
import { ConversationStore, summarize } from "@/lib/workbench/conversations";
import { WEBSITE_CUSTOMER, type Conversation } from "@/lib/workbench/conversation-types";
import { historyFromTurns } from "@/lib/workbench/http";
import { memoryKv } from "@/lib/workbench/kv";
import { WebsiteInbox, websiteConversationId } from "@/lib/workbench/website-inbox";

// Kevin, 2026-11-17 (a shared Civic chat): the log showed a price the customer never saw (held behind the contact form),
// the staff version of the card, and a stray line of styled letters. The log now says what the customer saw and did.

const card = {
  id: "E-1",
  kind: "labor",
  service: "Brake Pads R&R",
  position: "Front",
  vehicle: "2018 Honda Civic LX",
  partOptions: [{ description: "Brake Pad Set, Ceramic", unitListPrice: 175, quantity: 1, total: 175 }],
  totalLow: 216,
  totalHigh: 311,
  partsLow: 132,
  partsHigh: 175,
  laborHours: 0.9,
  laborRate: 120,
  laborWalkIn: 108,
  laborReferral: 86.4,
  referralTotalLow: 200,
  referralTotalHigh: 280,
  laborNote: "internal",
  partsNote: "",
} as never;

describe("review fixes", () => {
  it("a name in styled letters inside a normal line stays, and a reply is never emptied", () => {
    expect(toPlainText("𝐌𝐢𝐜𝐡𝐚𝐞𝐥, 您的报价 $216–$311。")).toBe("𝐌𝐢𝐜𝐡𝐚𝐞𝐥, 您的报价 $216–$311。");
    const onlyStyled = "𝑩𝒐𝒏𝒏𝒆 𝒇𝒐𝒓𝒎𝒂𝒕 𝒂𝒃𝒐𝒗𝒆 𝒊𝒔 𝒏𝒐𝒕 𝒖𝒔𝒆𝒅.";
    expect(toPlainText(onlyStyled)).toBe(onlyStyled);
  });

  it("the link's snapshot keeps the log lines and still drops error turns", async () => {
    const { snapshot } = await import("@/lib/workbench/shares");
    const turn = (id: string, extra: object) => ({ id, role: "assistant", text: id, author: "assistant", at: 1, quotes: [], ...extra });
    const copy = snapshot({ id: "w", title: "", updatedAt: 1, createdAt: 1, turns: [turn("event", { event: true, localOnly: true }), turn("error", { localOnly: true }), turn("reply", {})] } as unknown as Conversation);
    expect(copy.turns.map((t) => t.id)).toEqual(["event", "reply"]);
  });

  it("after a restart the held reply was lost: the marker stays and the log says so, once", async () => {
    const store = new ConversationStore(memoryKv());
    const inbox = new WebsiteInbox(store);
    const thread = "r".repeat(32);
    await inbox.exchange({ thread, contact: { name: "", phone: "", locale: "zh-CN" }, question: "q", photos: [], reply: "a", estimates: [], held: true });
    await inbox.contact(thread, { name: "", phone: "604-555-0182", locale: "zh-CN" }, false);
    await inbox.contact(thread, { name: "", phone: "604-555-0182", locale: "zh-CN" }, false);
    const c = (await store.get(websiteConversationId(thread)))!;
    expect(c.turns.some((t) => t.held)).toBe(true);
    expect(c.turns.filter((t) => t.event).map((t) => t.text)).toEqual(["客人留了联系方式，但被扣住的回复在服务重启时丢了，客人没有看到"]);
  });
});

describe("the plain-text reply", () => {
  it("drops a stray line written in styled letters, and nothing else", () => {
    const stray = "𝑩𝒐𝒏𝒏𝒆 𝒇𝒐𝒓𝒎𝒂𝒕 𝒂𝒃𝒐𝒗𝒆 𝒊𝒔 𝒏𝒐𝒕 𝒖𝒔𝒆𝒅; 𝒘𝒓𝒊𝒕𝒊𝒏𝒈 𝒑𝒍𝒂𝒊𝒏 𝒕𝒆𝒙𝒕 𝒃𝒆𝒍𝒐𝒘.";
    expect(toPlainText(`${stray}\n您的 2018 款本田思域 LX 更换前刹车片大约需要 $216–$311。`)).toBe("您的 2018 款本田思域 LX 更换前刹车片大约需要 $216–$311。");
    expect(toPlainText("**Hello** there\n• one\n• two")).toBe("Hello there\n• one\n• two");
    // A short styled word inside a normal line is left alone.
    expect(toPlainText("Price: 𝐀𝐁 is fine")).toBe("Price: 𝐀𝐁 is fine");
  });
});

describe("the card in the log", () => {
  it("is the customer's version: no hours or rate, but the price and the parts", () => {
    render(<WebsiteEstimateCard card={card} />);
    const article = screen.getByTestId("website-estimate");
    expect(article).toHaveTextContent("客人看到的报价卡");
    const { totalLow, totalHigh } = estimateRanges(card);
    expect(article).toHaveTextContent(`$${totalLow} – $${totalHigh}`);
    expect(article).toHaveTextContent("Brake Pad Set, Ceramic");
    expect(article).not.toHaveTextContent("× $");
    expect(article).not.toHaveTextContent("$120");
  });

  it("says plainly when the customer hasn't been shown it yet", () => {
    render(<WebsiteEstimateCard card={card} held />);
    expect(screen.getByTestId("website-estimate")).toHaveTextContent("客人留了联系方式才会看到");
  });
});

describe("the shared page", () => {
  const conversation = {
    id: "w-1",
    title: "2018 本田思域",
    updatedAt: 1,
    createdAt: 1,
    turns: [
      { id: "1", role: "user", text: "2018 本田思域 LX 换前刹车片多少钱？", author: WEBSITE_CUSTOMER, at: 1, quotes: [], source: "website" },
      { id: "2", role: "assistant", text: "大约 $216–$311。", author: "assistant", at: 2, quotes: [], source: "website", held: true, estimates: [card] },
      { id: "3", role: "assistant", text: "已向客人弹出留联系方式的表单（这单暂时没有价格，要店里报价）", author: "assistant", at: 3, quotes: [], source: "website", event: true, localOnly: true },
      { id: "4", role: "assistant", text: "网站 AI 出错", author: "assistant", at: 4, quotes: [], source: "website", localOnly: true },
    ],
    website: { name: "", phone: "", locale: "zh-CN" },
  } as unknown as Conversation;

  it("marks the reply the customer didn't see, shows the log line and still hides plain errors", () => {
    render(<SharedConversationView shared={{ token: "x".repeat(22), createdBy: "kevin@x.com", createdAt: 1, expiresAt: Date.now() + 1e9, conversation }} />);
    expect(screen.getByTestId("held-notice")).toHaveTextContent("客人没看到这条回复和报价");
    expect(screen.getByTestId("log-event")).toHaveTextContent("已向客人弹出留联系方式的表单");
    expect(screen.queryByText("网站 AI 出错")).not.toBeInTheDocument();
  });
});

describe("what the log records", () => {
  const base = { thread: "t".repeat(32), contact: { name: "", phone: "", locale: "zh-CN" }, question: "paint scratches", photos: [], reply: "The team will confirm the price.", estimates: [], held: false };

  it("notes the contact form that opened under a reply, and keeps it out of the assistant's history and the list preview", async () => {
    const store = new ConversationStore(memoryKv());
    const inbox = new WebsiteInbox(store);
    await inbox.exchange({ ...base, contactOffered: true });
    const c = (await store.get(websiteConversationId(base.thread)))!;
    const event = c.turns.find((t) => t.event)!;
    expect(event.text).toContain("弹出留联系方式的表单");
    expect(event.localOnly).toBe(true);
    expect(historyFromTurns(c.turns).map((t) => t.text).join("|")).not.toContain("弹出留联系方式");
    expect(summarize(c).last).toBe("The team will confirm the price.");
  });

  it("notes when held replies are released by contact details, and only then", async () => {
    const store = new ConversationStore(memoryKv());
    const inbox = new WebsiteInbox(store);
    await inbox.exchange({ ...base, held: true });
    expect((await store.get(websiteConversationId(base.thread)))!.turns.some((t) => t.event)).toBe(false);
    await inbox.contact(base.thread, { name: "", phone: "604-555-0182", locale: "zh-CN" });
    const c = (await store.get(websiteConversationId(base.thread)))!;
    expect(c.turns.some((t) => t.held)).toBe(false);
    expect(c.turns.filter((t) => t.event).map((t) => t.text)).toEqual(["客人留了联系方式，上面被扣住的回复和报价客人现在已经看到"]);
    // A second contact (no held reply left) adds nothing.
    await inbox.contact(base.thread, { name: "", phone: "604-555-0182", locale: "zh-CN" });
    expect((await store.get(websiteConversationId(base.thread)))!.turns.filter((t) => t.event)).toHaveLength(1);
  });
});
