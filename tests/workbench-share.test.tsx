import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import { SharedConversationView } from "@/components/workbench/SharedConversationView";
import { SharePanel } from "@/components/workbench/SharePanel";
import proxy from "@/proxy";
import type { Conversation, Turn } from "@/lib/workbench/conversation-types";
import { ConversationStore, newTurnId } from "@/lib/workbench/conversations";
import { memoryKv } from "@/lib/workbench/kv";
import { buildLaborQuote } from "@/lib/workbench/quote";
import { handleShare, shareUrl, type ShareDeps } from "@/lib/workbench/shares-http";
import { MAX_SHARES, SHARE_MS, ShareStore, snapshot } from "@/lib/workbench/shares";

// Kevin, 2026-11-14: a share button on each conversation; anyone with the link
// can read it without signing in, for three days.

const turn = (role: "user" | "assistant", text: string, author: string): Turn => ({ id: newTurnId(), role, text, author, at: 1_763_100_000_000, quotes: [] });
const quote = () =>
  buildLaborQuote(
    "2019 Toyota Camry",
    {
      serviceName: "Brake Rotor R&R",
      position: "Front",
      laborHours: 1,
      laborNote: "",
      primaryPartName: "Rotor",
      otherPartNames: [],
      partsNote: "",
      partOptions: [{ description: "Rotor", series: "", listPrice: 150, quantity: 1, inStockLocally: true, note: "", prices: { unitPrice: 70 }, partNumber: "R-1", brand: "ACME", availability: "tomorrow-local", qtyAvailable: 3, fields: {} }],
    },
    "W-1",
    {} as NodeJS.ProcessEnv,
  );

async function seeded() {
  const kv = memoryKv();
  const conversations = new ConversationStore(kv);
  const answer = { ...turn("assistant", "前刹车盘 $270", "assistant"), quotes: [quote()] };
  await conversations.append("cabc1234", "kevin@x.com", [turn("user", "2019 Camry 前刹车盘", "kevin@x.com"), answer], { key: "k", label: "2019 Toyota Camry" }, "2019 Camry");
  return { kv, conversations };
}

describe("ShareStore", () => {
  it("makes a long random link that lasts three days, then stops", async () => {
    let now = 1_000_000;
    const kv = memoryKv();
    const put = vi.spyOn(kv, "put");
    const store = new ShareStore(kv, () => now);
    const { conversations } = await seeded();
    const conversation = (await conversations.get("cabc1234"))!;
    const link = await store.create(conversation, "kevin@x.com");
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(link.expiresAt - link.createdAt).toBe(SHARE_MS);
    expect(put.mock.calls[0][2]).toEqual({ ttlSeconds: 3 * 24 * 3600 });
    expect((await store.get(link.token))?.conversation.turns).toHaveLength(2);
    now += SHARE_MS + 1;
    expect(await store.get(link.token)).toBeNull();
    expect(await store.get("../../etc/passwd")).toBeNull();
  });

  it("can be cancelled, and limits active links per conversation", async () => {
    const store = new ShareStore(memoryKv());
    const { conversations } = await seeded();
    const conversation = (await conversations.get("cabc1234"))!;
    const link = await store.create(conversation, "kevin@x.com");
    await store.revoke(link.token);
    expect(await store.get(link.token)).toBeNull();
    const full: Conversation = { ...conversation, shares: Array.from({ length: MAX_SHARES }, (_, i) => ({ token: `t${i}`, createdBy: "a", createdAt: 0, expiresAt: Date.now() + 1000 })) };
    await expect(store.create(full, "kevin@x.com")).rejects.toThrow(/10 个/);
  });
});

describe("/api/workbench/conversations/[id]/share", () => {
  async function deps(email: string | null): Promise<ShareDeps & { conversations: () => ConversationStore }> {
    const { kv, conversations } = await seeded();
    const shares = new ShareStore(kv);
    return { user: async () => (email ? { email } : null), conversations: () => conversations, shares: () => shares, log: () => {} };
  }
  const req = (method: string, query = "", origin = "https://repair.speedxrental.com") =>
    new Request(`${origin}/api/workbench/conversations/cabc1234/share${query}`, { method });

  it("needs a signed-in staff member", async () => {
    expect((await handleShare(req("POST"), "cabc1234", await deps(null))).status).toBe(401);
  });

  it("makes a link on the main site, records it on the conversation, and cancels it", async () => {
    const d = await deps("amy@x.com");
    const made = await handleShare(req("POST"), "cabc1234", d);
    expect(made.status).toBe(201);
    const body = (await made.json()) as { url: string; link: { token: string }; conversation: Conversation };
    expect(body.url).toBe(`https://speedxrental.com/share/${body.link.token}`);
    expect(body.conversation.shares?.map((s) => s.token)).toEqual([body.link.token]);
    expect(await d.shares()!.get(body.link.token)).not.toBeNull();
    const gone = await handleShare(req("DELETE", `?token=${body.link.token}`), "cabc1234", d);
    expect(gone.status).toBe(200);
    expect(await d.shares()!.get(body.link.token)).toBeNull();
    expect((await d.conversations()!.get("cabc1234"))?.shares).toBeUndefined();
  });

  it("says when the conversation is gone, and points local links at this computer", async () => {
    expect((await handleShare(req("POST"), "cnope000", await deps("amy@x.com"))).status).toBe(404);
    expect(shareUrl("abc", "http://localhost:3110/api/x")).toBe("http://localhost:3110/share/abc");
  });
});

describe("the share page route", () => {
  it("is served on the main site without a locale redirect, never indexed or cached", () => {
    const response = proxy(new NextRequest("https://speedxrental.com/share/abcdefghijklmnopqrstuv"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(robots().rules).toEqual([expect.objectContaining({ disallow: ["/share/", "/unsubscribe/"] })]);
  });

  it("isn't served on the workbench subdomain", () => {
    const url = "https://repair.speedxrental.com/share/abcdefghijklmnopqrstuv";
    expect(proxy(new NextRequest(url, { headers: { host: "repair.speedxrental.com" } })).status).toBe(404);
    expect(proxy(new NextRequest(url, { headers: { "x-speedx-workbench": "1" } })).status).toBe(404);
  });
});

describe("SharedConversationView", () => {
  it("shows the messages and quote cards read-only, with the expiry date", async () => {
    const { conversations } = await seeded();
    const conversation = (await conversations.get("cabc1234"))!;
    render(<SharedConversationView shared={{ token: "x".repeat(22), createdBy: "kevin@x.com", createdAt: Date.UTC(2026, 10, 14, 20), expiresAt: Date.UTC(2026, 10, 17, 20), conversation }} />);
    expect(screen.getByText("2019 Camry 前刹车盘")).toBeInTheDocument();
    expect(screen.getByTestId("staff-quote")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "✎ 改价" })).toBeNull();
    expect(screen.getAllByText(/11\/17 12:00 到期|11\/17 12:00 自动失效/).length).toBeGreaterThan(0);
  });
});

describe("SharePanel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("makes a link, copies it, and can cancel it", async () => {
    const writeText = vi.fn(async (text: string) => void text);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const base: Conversation = { id: "cabc1234", title: "t", vehicle: null, createdBy: "a", createdAt: 0, updatedBy: "a", updatedAt: 0, turns: [] };
    const link = { token: "abcdefghijklmnopqrstuv", createdBy: "amy@x.com", createdAt: Date.now(), expiresAt: Date.now() + SHARE_MS };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST" ? Response.json({ link, conversation: { ...base, shares: [link] } }, { status: 201 }) : Response.json({ conversation: base }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onChanged = vi.fn();
    const { rerender } = render(<SharePanel conversation={base} onClose={() => {}} onChanged={onChanged} />);
    expect(screen.getByText(/进价、加价和客人联系方式/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "生成分享链接（3 天有效）" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("http://localhost:3000/share/abcdefghijklmnopqrstuv"));
    rerender(<SharePanel conversation={{ ...base, shares: [link] }} onClose={() => {}} onChanged={onChanged} />);
    await userEvent.click(screen.getByRole("button", { name: "取消分享" }));
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/workbench/conversations/cabc1234/share?token=abcdefghijklmnopqrstuv");
  });
});

describe("share review fixes", () => {
  it("drops a deleted conversation's links", async () => {
    const { kv, conversations } = await seeded();
    const shares = new ShareStore(kv);
    const link = await shares.create((await conversations.get("cabc1234"))!, "kevin@x.com");
    await conversations.setShares("cabc1234", "kevin@x.com", () => [link]);
    await conversations.remove("cabc1234");
    expect(await shares.get(link.token)).toBeNull();
  });

  it("sends only what the page shows", () => {
    const base: Conversation = {
      id: "c1",
      title: "t",
      vehicle: null,
      createdBy: "a",
      createdAt: 0,
      updatedBy: "a",
      updatedAt: 0,
      turns: [
        { ...turn("assistant", "暂时无法查询", "assistant"), localOnly: true },
        { ...turn("assistant", "ok", "assistant"), memories: [{ id: "M-1", text: "secret note", replacesId: null }], drafts: [{ id: "D-1", note: "shop-only note", lines: [] } as never] },
      ],
      shares: [{ token: "t", createdBy: "a", createdAt: 0, expiresAt: 1 }],
    };
    const shown = snapshot(base);
    expect(shown.turns).toHaveLength(1);
    expect(JSON.stringify(shown)).not.toMatch(/secret note|shop-only note|暂时无法查询/);
    expect(shown.shares).toBeUndefined();
  });

  it("refuses a cancelled link at once, even if KV still has it", async () => {
    const kv = memoryKv();
    const store = new ShareStore(kv);
    const { conversations } = await seeded();
    const link = await store.create((await conversations.get("cabc1234"))!, "kevin@x.com");
    const value = kv.data.get(`workbench-share-v1:${link.token}`)!;
    await store.revoke(link.token);
    kv.data.set(`workbench-share-v1:${link.token}`, value);
    expect(await store.get(link.token)).toBeNull();
  });
});
