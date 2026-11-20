import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FollowFilterBar, FollowStatusControl, FollowSummaryPanel } from "@/components/workbench/FollowStatus";
import { Workbench } from "@/components/workbench/Workbench";
import { ConversationStore, summarize } from "@/lib/workbench/conversations";
import { handleConversation, type ConversationDeps } from "@/lib/workbench/conversations-http";
import type { Conversation, ConversationSummary } from "@/lib/workbench/conversation-types";
import { followStats, isOverdue, parseFollowInput, OVERDUE_MS } from "@/lib/workbench/follow-status";
import { memoryKv } from "@/lib/workbench/kv";
import { snapshot } from "@/lib/workbench/shares";
import { WebsiteInbox, websiteConversationId } from "@/lib/workbench/website-inbox";

// Kevin, 2026-11-20: a follow-up status on website customers (called, booked, came in, bought) with who and when, an
// optional sale amount, a filter and a summary in the list, and a warning on contacts left more than a day ago.

const DAY = OVERDUE_MS;
const NOW = Date.UTC(2026, 10, 20, 20);

describe("reading a status change", () => {
  it("accepts the six states and cleans what comes with them", () => {
    expect(parseFollowInput({ state: "contacted" })).toEqual({ state: "contacted" });
    expect(parseFollowInput({ state: "won", amount: "1234.567" })).toEqual({ state: "won", amount: 1234.57 });
    expect(parseFollowInput({ state: "won" })).toEqual({ state: "won" });
    expect(parseFollowInput({ state: "won", amount: "" })).toEqual({ state: "won" });
    expect(parseFollowInput({ state: "lost", reason: "  价格   太高 " })).toEqual({ state: "lost", reason: "价格 太高" });
    // An amount only goes with a sale, a reason only with a lost one.
    expect(parseFollowInput({ state: "contacted", amount: 50, reason: "x" })).toEqual({ state: "contacted" });
  });

  it("refuses an unknown state or a bad amount", () => {
    expect(parseFollowInput({ state: "dead" })).toBeNull();
    expect(parseFollowInput(null)).toBeNull();
    expect(parseFollowInput({ state: "won", amount: -5 })).toBeNull();
    expect(parseFollowInput({ state: "won", amount: "abc" })).toBeNull();
    expect(parseFollowInput({ state: "won", amount: 5_000_000 })).toBeNull();
    // What a typo turns into on the wire (NaN becomes null), and other odd types, are refused rather than read as "no amount".
    expect(parseFollowInput({ state: "won", amount: null })).toBeNull();
    expect(parseFollowInput({ state: "won", amount: true })).toBeNull();
    expect(parseFollowInput({ state: "won", amount: [5] })).toBeNull();
  });
});

describe("the counts", () => {
  const chat = (over: Partial<ConversationSummary>): ConversationSummary => ({ id: Math.random().toString(36), title: "", vehicle: "", updatedAt: NOW, last: "", lastAuthor: "", turns: 2, website: "", createdAt: NOW - 2 * DAY, ...over });
  const list: ConversationSummary[] = [
    chat({}), // asked, left nothing
    chat({ contactAt: NOW - DAY }), // left contact, not followed
    chat({ contactAt: NOW - DAY, follow: "contacted", stage: 1 }),
    chat({ contactAt: NOW - DAY, follow: "booked", stage: 2 }),
    chat({ contactAt: NOW - DAY, follow: "arrived", stage: 3 }),
    chat({ contactAt: NOW - DAY, follow: "won", stage: 4, followAmount: 400 }),
    chat({ contactAt: NOW - DAY, follow: "won", stage: 4, followAmount: 250.5 }),
    chat({ contactAt: NOW - DAY, follow: "won" }), // sold, no amount filled in
    chat({ contactAt: NOW - DAY, follow: "lost", stage: 3, followReason: "价格太高" }), // came in, then went elsewhere
    chat({ contactAt: NOW - DAY, follow: "lost", followReason: "测试单" }), // our own test
    chat({ createdAt: NOW - 40 * DAY, contactAt: NOW - 40 * DAY, follow: "won", followAmount: 999 }), // too old for 30 days
    { id: "staff", title: "", vehicle: "", updatedAt: NOW, last: "", lastAuthor: "", turns: 2 }, // not a website chat
  ];

  it("counts how far each website chat got, with later stages included, and the money", () => {
    const stats = followStats(list, NOW - 30 * DAY, NOW);
    expect(stats).toMatchObject({ consultations: 9, leftContact: 8, contacted: 7, booked: 6, arrived: 5, won: 3, wonAmount: 650.5, wonNoAmount: 1, lost: 1, tests: 1 });
  });

  it("covers everything when no start date is given", () => {
    const stats = followStats(list, null, NOW);
    expect(stats.consultations).toBe(10);
    expect(stats.wonAmount).toBe(1649.5);
  });

  it("flags contact left over a day ago with no follow-up, and nothing else", () => {
    expect(isOverdue({ contactAt: NOW - DAY - 1000 }, NOW)).toBe(true);
    expect(isOverdue({ contactAt: NOW - DAY + 60_000 }, NOW)).toBe(false);
    expect(isOverdue({ contactAt: undefined }, NOW)).toBe(false);
    expect(isOverdue({ contactAt: NOW - 3 * DAY, follow: "contacted" }, NOW)).toBe(false);
    expect(isOverdue({ contactAt: NOW - 3 * DAY, follow: "new" }, NOW)).toBe(true);
    expect(isOverdue({ contactAt: NOW - 3 * DAY, archived: true }, NOW)).toBe(false);
  });
});

describe("saving a status", () => {
  async function websiteChat(store: ConversationStore, thread = "1".repeat(32), contact = true) {
    const inbox = new WebsiteInbox(store);
    await inbox.exchange({ thread, contact: { name: "", phone: "", locale: "zh-CN" }, question: "前刹车片多少钱", photos: [], reply: "大约 $240", estimates: [], held: contact });
    if (contact) await inbox.contact(thread, { name: "未留姓名", phone: "604-555-0182", locale: "zh-CN" });
    return websiteConversationId(thread);
  }

  it("records who and when, keeps the history, and shows up in the list summary", async () => {
    let at = NOW;
    const store = new ConversationStore(memoryKv(), () => at);
    const id = await websiteChat(store);
    await store.setFollowStatus(id, "kevin@x.ca", { state: "contacted" });
    at += 3_600_000;
    const saved = await store.setFollowStatus(id, "lee@x.ca", { state: "won", amount: 480 });
    expect(saved.followStatus).toEqual({ state: "won", amount: 480, by: "lee@x.ca", at });
    expect(saved.followLog?.map((h) => [h.state, h.by])).toEqual([["contacted", "kevin@x.ca"], ["won", "lee@x.ca"]]);
    const summary = summarize(saved);
    expect(summary).toMatchObject({ follow: "won", followBy: "lee@x.ca", followAmount: 480, stage: 4 });
    expect(summary.contactAt).toBeTypeOf("number");
  });

  it("keeps the furthest stage after a customer is marked lost", async () => {
    const store = new ConversationStore(memoryKv());
    const id = await websiteChat(store);
    await store.setFollowStatus(id, "kevin@x.ca", { state: "arrived" });
    const lost = await store.setFollowStatus(id, "kevin@x.ca", { state: "lost", reason: "选了别家" });
    expect(summarize(lost)).toMatchObject({ follow: "lost", followReason: "选了别家", stage: 3 });
  });

  it("only a website customer's chat has a status", async () => {
    const store = new ConversationStore(memoryKv());
    await store.append("cstaff1234", "kevin@x.ca", [{ id: "1", role: "user", text: "q", author: "kevin@x.ca", at: 1, quotes: [] }], undefined, "q");
    await expect(store.setFollowStatus("cstaff1234", "kevin@x.ca", { state: "contacted" })).rejects.toThrow(/website/);
  });

  it("the history is capped, but the furthest stage reached is kept apart from it", async () => {
    const store = new ConversationStore(memoryKv());
    const id = await websiteChat(store);
    await store.setFollowStatus(id, "kevin@x.ca", { state: "arrived" });
    for (let i = 0; i < 60; i += 1) await store.setFollowStatus(id, "kevin@x.ca", { state: i % 2 ? "contacted" : "new" });
    const c = (await store.get(id))!;
    expect(c.followLog).toHaveLength(50);
    expect(summarize(c).stage).toBe(3);
  });

  it("a chat from before contact times were recorded keeps its overdue clock when the customer writes again", async () => {
    let at = NOW;
    const store = new ConversationStore(memoryKv(), () => at);
    const inbox = new WebsiteInbox(store, () => at);
    const thread = "5".repeat(32);
    await inbox.exchange({ thread, contact: { name: "", phone: "", locale: "zh-CN" }, question: "q", photos: [], reply: "a", estimates: [], held: false });
    const id = websiteConversationId(thread);
    // An old chat: phone known, but no leftContactAt (only the consent time).
    await store.change(id, "website", (c) => {
      c.website = { name: "Amy", phone: "604-555-0182", locale: "zh-CN", consentAt: NOW - 3 * DAY };
    });
    at = NOW + 1000;
    await inbox.exchange({ thread, contact: { name: "Amy", phone: "604-555-0182", locale: "zh-CN" }, question: "还有问题", photos: [], reply: "好的", estimates: [], held: false });
    const c = (await store.get(id))!;
    expect(c.website!.leftContactAt).toBe(NOW - 3 * DAY);
    expect(isOverdue(summarize(c), at)).toBe(true);
  });

  it("notes when contact details were first left, and keeps that time", async () => {
    let at = NOW;
    const store = new ConversationStore(memoryKv(), () => at);
    const inbox = new WebsiteInbox(store, () => at);
    const thread = "3".repeat(32);
    await inbox.exchange({ thread, contact: { name: "", phone: "", locale: "en" }, question: "q", photos: [], reply: "a", estimates: [], held: true });
    expect((await store.get(websiteConversationId(thread)))!.website?.leftContactAt).toBeUndefined();
    await inbox.contact(thread, { name: "", phone: "", email: "amy@example.com", locale: "en" });
    const first = (await store.get(websiteConversationId(thread)))!.website!.leftContactAt;
    expect(first).toBe(at);
    at += DAY;
    await inbox.contact(thread, { name: "", phone: "604-555-0182", email: "amy@example.com", locale: "en" });
    expect((await store.get(websiteConversationId(thread)))!.website!.leftContactAt).toBe(first);
  });
});

describe("staff only", () => {
  it("a share link carries neither the status nor its history", async () => {
    const store = new ConversationStore(memoryKv());
    const inbox = new WebsiteInbox(store);
    const thread = "2".repeat(32);
    await inbox.exchange({ thread, contact: { name: "", phone: "", locale: "en" }, question: "q", photos: [], reply: "a", estimates: [], held: false });
    const id = websiteConversationId(thread);
    const saved = await store.setFollowStatus(id, "kevin@x.ca", { state: "won", amount: 500 });
    expect(saved.followStatus).toBeDefined();
    const shared = snapshot(saved);
    expect(shared.followStatus).toBeUndefined();
    expect(shared.followLog).toBeUndefined();
    expect(JSON.stringify(shared)).not.toContain("500");
  });

  it("the assistant's view of a conversation is its turns, which hold no status", async () => {
    const { historyFromTurns } = await import("@/lib/workbench/http");
    const store = new ConversationStore(memoryKv());
    const inbox = new WebsiteInbox(store);
    const thread = "a".repeat(32);
    await inbox.exchange({ thread, contact: { name: "", phone: "", locale: "en" }, question: "brake pads", photos: [], reply: "about $240", estimates: [], held: false });
    const saved = await store.setFollowStatus(websiteConversationId(thread), "kevin@x.ca", { state: "won", amount: 777 });
    const text = JSON.stringify(historyFromTurns(saved.turns));
    expect(text).not.toContain("777");
    expect(text).not.toContain("won");
  });
});

describe("the conversation route", () => {
  const setup = () => {
    const store = new ConversationStore(memoryKv());
    const logs: Array<Record<string, unknown>> = [];
    const deps: ConversationDeps = { user: async () => ({ email: "lee@x.ca" }), store: () => store, log: (e: Record<string, unknown>) => logs.push(e) } as never;
    const patch = (id: string, body: unknown) => handleConversation(new Request(`https://repair.speedxrental.com/api/workbench/conversations/${id}`, { method: "PATCH", body: JSON.stringify(body) }), id, deps);
    return { store, logs, patch };
  };

  it("sets the status for the signed-in staff member and logs it without the customer's details", async () => {
    const { store, logs, patch } = setup();
    const inbox = new WebsiteInbox(store);
    const thread = "4".repeat(32);
    await inbox.exchange({ thread, contact: { name: "", phone: "", locale: "en" }, question: "q", photos: [], reply: "a", estimates: [], held: false });
    const id = websiteConversationId(thread);
    const response = await patch(id, { follow: { state: "won", amount: 300 } });
    expect(response.status).toBe(200);
    expect((await store.get(id))!.followStatus).toMatchObject({ state: "won", amount: 300, by: "lee@x.ca" });
    expect(logs.at(-1)).toEqual({ action: "follow_status", email: "lee@x.ca", id, state: "won", amount: 300 });
  });

  it("refuses a bad status and a chat that isn't a website customer's", async () => {
    const { store, patch } = setup();
    await store.append("cstaff1234", "kevin@x.ca", [{ id: "1", role: "user", text: "q", author: "kevin@x.ca", at: 1, quotes: [] }], undefined, "q");
    expect((await patch("cstaff1234", { follow: { state: "nope" } })).status).toBe(400);
    expect((await patch("cstaff1234", { follow: { state: "contacted" } })).status).toBe(400);
  });
});

describe("the status control", () => {
  afterEach(() => vi.unstubAllGlobals());
  const chat = (over: Partial<Conversation> = {}) => ({ id: "cabc1234", title: "", turns: [], website: { name: "", phone: "604", locale: "zh-CN" }, ...over }) as unknown as Conversation;

  it("saves a sale with its amount, and shows who changed it and when", async () => {
    const saved = chat({ followStatus: { state: "won", amount: 480, by: "lee@x.ca", at: NOW }, followLog: [{ state: "won", amount: 480, by: "lee@x.ca", at: NOW }] });
    const fetchMock = vi.fn(async () => Response.json({ conversation: saved }));
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();
    render(<FollowStatusControl conversation={chat()} onSaved={onSaved} />);
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    expect(screen.queryByLabelText("成交金额（税前，选填）")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("跟进状态"), "won");
    await userEvent.type(screen.getByLabelText("成交金额（税前，选填）"), "480");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    const [url, init] = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0];
    expect(url).toBe("/api/workbench/conversations/cabc1234");
    expect(JSON.parse(init.body as string)).toEqual({ follow: { state: "won", amount: 480 } });
  });

  it("a sale can be saved without an amount, and a lost one with a reason", async () => {
    const fetchMock = vi.fn(async () => Response.json({ conversation: chat() }));
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(<FollowStatusControl conversation={chat()} onSaved={() => {}} />);
    await userEvent.selectOptions(screen.getByLabelText("跟进状态"), "won");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ follow: { state: "won" } });
    unmount();
    render(<FollowStatusControl conversation={chat()} onSaved={() => {}} />);
    await userEvent.selectOptions(screen.getByLabelText("跟进状态"), "lost");
    await userEvent.selectOptions(screen.getByLabelText("没成的原因"), "价格太高");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)).toEqual({ follow: { state: "lost", reason: "价格太高" } });
  });

  it("refuses a mistyped amount before sending anything", async () => {
    const fetchMock = vi.fn(async () => Response.json({ conversation: chat() }));
    vi.stubGlobal("fetch", fetchMock);
    render(<FollowStatusControl conversation={chat()} onSaved={() => {}} />);
    await userEvent.selectOptions(screen.getByLabelText("跟进状态"), "won");
    await userEvent.type(screen.getByLabelText("成交金额（税前，选填）"), "12..3");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("金额格式不对");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says plainly when saving fails, and lists the history", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const log = [{ state: "contacted" as const, by: "kevin@x.ca", at: NOW - 3_600_000 }, { state: "booked" as const, by: "lee@x.ca", at: NOW }];
    render(<FollowStatusControl conversation={chat({ followStatus: log[1], followLog: log })} onSaved={() => {}} />);
    expect(screen.getByTestId("follow-last")).toHaveTextContent("lee 在");
    expect(screen.getByTestId("follow-last")).toHaveTextContent("改为「已约时间」");
    await userEvent.click(screen.getByRole("button", { name: /历史（2）/ }));
    expect(within(screen.getByTestId("follow-log")).getAllByRole("listitem")).toHaveLength(2);
    await userEvent.selectOptions(screen.getByLabelText("跟进状态"), "arrived");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("没保存成功");
  });
});

describe("the list filter and the summary", () => {
  const row = (over: Partial<ConversationSummary>): ConversationSummary => ({ id: Math.random().toString(36), title: "", vehicle: "", updatedAt: NOW, last: "", lastAuthor: "", turns: 2, website: "", createdAt: NOW - DAY, ...over });
  const list = [row({ contactAt: NOW - 3 * DAY }), row({ contactAt: NOW - 3 * DAY, follow: "contacted", stage: 1 }), row({ follow: "won", stage: 4, followAmount: 200, contactAt: NOW - DAY }), { id: "x", title: "", vehicle: "", updatedAt: NOW, last: "", lastAuthor: "", turns: 1 } as ConversationSummary];

  it("shows a count per status and the overdue ones, and filters on a click", async () => {
    const onChange = vi.fn();
    render(<FollowFilterBar list={list} filter="all" onChange={onChange} now={NOW} onSummary={() => {}} />);
    expect(screen.getByRole("button", { name: "⏰ 超期 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "未跟进 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "已成交 1" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "已联系 1" }));
    expect(onChange).toHaveBeenCalledWith("contacted");
  });

  it("is not shown when there are no website chats", () => {
    const { container } = render(<FollowFilterBar list={[list[3]]} filter="all" onChange={() => {}} now={NOW} onSummary={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sums a period: consultations, contact left, funnel and the amount", async () => {
    render(<FollowSummaryPanel list={list} now={NOW} onClose={() => {}} />);
    expect(screen.getByTestId("stat-网站咨询")).toHaveTextContent("3");
    expect(screen.getByTestId("stat-留了联系方式")).toHaveTextContent("3");
    expect(screen.getByTestId("stat-已联系")).toHaveTextContent("2");
    expect(screen.getByTestId("stat-已成交")).toHaveTextContent("1");
    expect(screen.getByTestId("stat-amount")).toHaveTextContent("$200.00");
    await userEvent.click(screen.getByRole("button", { name: "最近 7 天" }));
    expect(screen.getByTestId("stat-网站咨询")).toHaveTextContent("3");
  });
});

describe("in the workbench", () => {
  afterEach(() => vi.unstubAllGlobals());
  const website = (id: string, name: string, extra: object = {}) => ({ id, title: `${name} 的咨询`, vehicle: { key: "k", label: "2018 Honda Civic" }, createdBy: "website", createdAt: NOW - DAY, updatedBy: "website", updatedAt: NOW, turns: [{ id: `${id}-t`, role: "user", text: "刹车片多少钱", author: "website", at: NOW - DAY, quotes: [], source: "website" }], website: { name, phone: "604-555-0100", locale: "zh-CN", leftContactAt: NOW - 3 * DAY }, ...extra });
  const one = website("cwaaaaaaaa", "Amy");
  const two = website("cwbbbbbbbb", "Tom", { followStatus: { state: "won", amount: 300, by: "kevin@x.ca", at: NOW }, followLog: [{ state: "won", amount: 300, by: "kevin@x.ca", at: NOW }] });
  const summary = (c: ReturnType<typeof website>, extra: object = {}) => ({ id: c.id, title: c.title, vehicle: "2018 Honda Civic", updatedAt: NOW, last: "大约 $240", lastAuthor: "assistant", turns: 1, website: c.website.name, createdAt: c.createdAt, contactAt: NOW - 3 * DAY, ...extra });

  it("shows one status control for the open chat, and the right status after switching, plus the overdue tag and the filter", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/workbench/conversations") return Response.json({ conversations: [summary(one), summary(two, { follow: "won", followAmount: 300, stage: 4 })], pending: {} });
      if (url.endsWith(one.id)) return Response.json({ conversation: one, pending: null });
      if (url.endsWith(two.id)) return Response.json({ conversation: two, pending: null });
      return Response.json({});
    }));
    window.localStorage.clear();
    render(<Workbench email="kevin@x.ca" />);
    expect(await screen.findByTestId("follow-control")).toBeInTheDocument();
    // The first chat (Amy): left contact three days ago, never followed: flagged in the list.
    expect(screen.getAllByTestId("overdue-tag")).toHaveLength(1);
    expect(screen.getByLabelText("跟进状态")).toHaveValue("new");
    await userEvent.click(screen.getAllByTestId("conversation")[1]);
    await waitFor(() => expect(screen.getByLabelText("跟进状态")).toHaveValue("won"));
    expect(screen.getAllByTestId("follow-control")).toHaveLength(1);
    expect(screen.getByTestId("follow-last")).toHaveTextContent("成交 $300.00（税前）");
    // Filtering on 已成交 leaves Tom's chat only.
    await userEvent.click(screen.getByRole("button", { name: "已成交 1" }));
    expect(screen.getAllByTestId("conversation")).toHaveLength(1);
    expect(screen.getByTestId("conversation")).toHaveTextContent("Tom");
  });

  it("saving a status brings in a message that arrived at the same time", async () => {
    const newer = { ...one, turns: [...one.turns, { id: "late", role: "user", text: "客人又问了一句", author: "website", at: NOW, quotes: [], source: "website" }], followStatus: { state: "contacted", by: "kevin@x.ca", at: NOW }, followLog: [{ state: "contacted", by: "kevin@x.ca", at: NOW }] };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/workbench/conversations") return Response.json({ conversations: [summary(one)], pending: {} });
      if (url.endsWith(one.id)) return Response.json({ conversation: init?.method === "PATCH" ? newer : one, pending: null });
      return Response.json({});
    }));
    window.localStorage.clear();
    render(<Workbench email="kevin@x.ca" />);
    await screen.findByTestId("follow-control");
    await userEvent.selectOptions(screen.getByLabelText("跟进状态"), "contacted");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByText("客人又问了一句")).toBeInTheDocument();
  });
});
