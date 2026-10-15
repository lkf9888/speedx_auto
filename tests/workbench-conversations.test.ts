import { describe, expect, it, vi } from "vitest";
import { RateLimiter } from "@/lib/repair-chat/rate-limit";
import type { Turn } from "@/lib/workbench/conversation-types";
import { ConversationStore, MAX_CONVERSATIONS, newTurnId } from "@/lib/workbench/conversations";
import { handleConversation, handleConversationList } from "@/lib/workbench/conversations-http";
import { handleWorkbenchChat } from "@/lib/workbench/http";
import { memoryKv } from "@/lib/workbench/kv";
import type { CatalogApi } from "@/lib/worldpac/catalog";

const turn = (role: "user" | "assistant", text: string, author: string): Turn => ({ id: newTurnId(), role, text, author, at: Date.now(), quotes: [] });

describe("conversation store", () => {
  it("writes each change once and reads everything back after a restart", async () => {
    const kv = memoryKv();
    const store = new ConversationStore(kv);
    await store.append("cabc1234", "a@x", [turn("user", "2019 Camry 前刹车片", "a@x")], undefined, "2019 Camry 前刹车片");
    await store.append("cabc1234", "a@x", [turn("assistant", "答复", "assistant")], { key: "k", label: "2019 Camry" });
    expect(kv.writes).toBe(2);

    const restarted = new ConversationStore(kv);
    const [summary] = await restarted.list();
    expect(summary).toMatchObject({ id: "cabc1234", title: "2019 Camry 前刹车片", vehicle: "2019 Camry", last: "答复", lastAuthor: "assistant", turns: 2 });
    expect((await restarted.get("cabc1234"))!.updatedBy).toBe("a@x");
  });

  it("keeps both messages when two staff write to one conversation at once", async () => {
    const store = new ConversationStore(memoryKv());
    await Promise.all([store.append("cabc1234", "a@x", [turn("user", "one", "a@x")]), store.append("cabc1234", "b@x", [turn("user", "two", "b@x")])]);
    expect((await store.get("cabc1234"))!.turns.map((t) => t.text).sort()).toEqual(["one", "two"]);
  });

  it("renames, records card state, deletes, and drops the oldest past the limit", async () => {
    const kv = memoryKv();
    let clock = 1;
    const store = new ConversationStore(kv, () => (clock += 1));
    await store.append("cabc1234", "a@x", [{ ...turn("assistant", "草稿", "assistant"), drafts: [{ id: "D-1" } as never], memories: [{ id: "M-1", text: "x", replacesId: null }] }]);
    await store.rename("cabc1234", "b@x", "  张先生   Camry ");
    await store.markCard("cabc1234", "b@x", { kind: "draft", itemId: "D-1", created: { documentId: 1, estimateNumber: 9, customerAttached: true } });
    await store.markCard("cabc1234", "b@x", { kind: "memory", itemId: "M-1" });
    const c = (await store.get("cabc1234"))!;
    expect(c.title).toBe("张先生 Camry");
    expect(c.turns[0].drafts![0]).toMatchObject({ created: { estimateNumber: 9 } });
    expect(c.turns[0].memories![0].saved).toBe(true);
    await store.remove("cabc1234");
    expect(await store.list()).toEqual([]);

    for (let i = 0; i <= MAX_CONVERSATIONS; i += 1) await store.append(`cbulk${String(i).padStart(4, "0")}`, "a@x", [turn("user", `q${i}`, "a@x")]);
    const list = await store.list();
    expect(list).toHaveLength(MAX_CONVERSATIONS);
    expect(list.some((s) => s.id === "cbulk0000")).toBe(false);
  });
});

describe("conversation endpoints", () => {
  const deps = (email: string | null, store = new ConversationStore(memoryKv())) => ({ user: async () => (email ? { email } : null), store: () => store, log: vi.fn() });
  const req = (method: string, body?: unknown) => new Request("https://repair.speedxrental.com/api/workbench/conversations", { method, body: body ? JSON.stringify(body) : undefined });

  it("needs a signed-in staff member, and says when the cloud isn't set up", async () => {
    expect((await handleConversationList(req("GET"), deps(null))).status).toBe(401);
    expect((await handleConversationList(req("GET"), { ...deps("a@x"), store: () => null })).status).toBe(503);
  });

  it("lists, opens, renames and deletes, with 404 for a conversation that's gone", async () => {
    const store = new ConversationStore(memoryKv());
    await store.append("cabc1234", "a@x", [turn("user", "hi", "a@x")], undefined, "hi");
    const d = deps("b@x", store);
    expect(((await (await handleConversationList(req("GET"), d)).json()) as { conversations: unknown[] }).conversations).toHaveLength(1);
    expect((await handleConversation(req("GET"), "cabc1234", d)).status).toBe(200);
    expect((await handleConversation(req("PATCH", { title: "新名字" }), "cabc1234", d)).status).toBe(200);
    expect((await store.get("cabc1234"))!.updatedBy).toBe("b@x");
    expect((await handleConversation(req("DELETE"), "cabc1234", d)).status).toBe(200);
    expect((await handleConversation(req("GET"), "cabc1234", d)).status).toBe(404);
    expect((await handleConversation(req("GET"), "../etc", d)).status).toBe(400);
  });
});

describe("chat with a shared conversation", () => {
  it("answers from the stored history, saves the question and the answer with their authors, and shows who is waiting", async () => {
    const store = new ConversationStore(memoryKv());
    await store.append("cabc1234", "kevin@x", [turn("user", "2019 Camry 前刹车片", "kevin@x"), turn("assistant", "前刹车片 $291", "assistant")], { key: "k-camry", label: "2019 Camry" }, "2019 Camry");
    let seen: { messages: Array<{ role: string; content: unknown }> } | null = null;
    let pendingDuring: unknown = null;
    const create = vi.fn(async (params: { messages: Array<{ role: string; content: unknown }> }) => {
      seen = params;
      pendingDuring = store.pending.get("cabc1234");
      return { stop_reason: "end_turn", content: [{ type: "text", text: "后刹车片 $243" }] };
    });
    const response = await handleWorkbenchChat(
      new Request("https://repair.speedxrental.com/api/workbench/chat", {
        method: "POST",
        body: JSON.stringify({ conversationId: "cabc1234", message: "后刹车片呢", vehicleKey: null }),
      }),
      {
        user: async () => ({ email: "amy@x" }),
        configured: () => true,
        limiter: new RateLimiter(),
        log: () => {},
        catalog: () => ({}) as CatalogApi,
        client: () => ({ beta: { messages: { create: create as never } } }),
        conversations: () => store,
      },
    );
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { type: string; turns?: Turn[] });
    // The earlier exchange (Kevin's) is the model's history; the page sent none.
    expect(JSON.stringify(seen!.messages)).toContain("2019 Camry 前刹车片");
    expect(pendingDuring).toMatchObject({ by: "amy@x" });
    expect(store.pending.has("cabc1234")).toBe(false);
    const saved = (await store.get("cabc1234"))!;
    expect(saved.turns.map((t) => [t.author, t.text])).toEqual([
      ["kevin@x", "2019 Camry 前刹车片"],
      ["assistant", "前刹车片 $291"],
      ["amy@x", "后刹车片呢"],
      ["assistant", "后刹车片 $243"],
    ]);
    expect(saved.vehicle).toEqual({ key: "k-camry", label: "2019 Camry" });
    expect(events.find((e) => e.type === "saved")!.turns!.map((t) => t.text)).toEqual(["后刹车片呢", "后刹车片 $243"]);
  });
});
