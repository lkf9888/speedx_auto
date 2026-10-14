import { describe, expect, it, vi } from "vitest";
import { RateLimiter } from "@/lib/repair-chat/rate-limit";
import { runWorkbenchTool } from "@/lib/workbench/assistant";
import { handleWorkbenchChat } from "@/lib/workbench/http";
import { cloudflareKvBackend, MAX_NOTES, MemoryError, MemoryStore, memoryPrompt, type MemoryBackend } from "@/lib/workbench/memory";
import { handleMemory, type MemoryDeps } from "@/lib/workbench/memory-http";
import type { CatalogApi } from "@/lib/worldpac/catalog";

function memoryBackend(initial: string | null = null) {
  const backend = { value: initial, reads: 0, writes: 0 } as { value: string | null; reads: number; writes: number } & MemoryBackend;
  backend.read = async () => {
    backend.reads += 1;
    return backend.value;
  };
  backend.write = async (value: string) => {
    backend.writes += 1;
    backend.value = value;
  };
  return backend;
}

let ids = 0;
const store = (backend: MemoryBackend, clock = { t: Date.parse("2026-10-14T20:00:00Z") }) =>
  new MemoryStore(backend, () => new Date(clock.t), () => `m${(ids += 1)}`);

describe("workbench memory store", () => {
  it("adds, edits and deletes notes, recording who and when", async () => {
    const backend = memoryBackend();
    const memory = store(backend);
    const first = await memory.add("  米其林冬季胎先问客人  能不能接受带钉胎 ", "a@speedx.ca");
    expect(first).toMatchObject({ text: "米其林冬季胎先问客人 能不能接受带钉胎", createdBy: "a@speedx.ca", updatedBy: "a@speedx.ca" });
    const edited = await memory.update(first.id, "米其林冬季胎先确认带不带钉", "b@speedx.ca");
    expect(edited).toMatchObject({ createdBy: "a@speedx.ca", updatedBy: "b@speedx.ca" });
    await memory.add("Toyota 先查 VIN", "a@speedx.ca");
    await memory.remove(first.id);
    expect((await memory.list()).map((n) => n.text)).toEqual(["Toyota 先查 VIN"]);
    expect(JSON.parse(backend.value!).notes).toHaveLength(1);
  });

  it("keeps both notes when two staff save at the same moment", async () => {
    const memory = store(memoryBackend());
    await Promise.all([memory.add("one", "a@x"), memory.add("two", "b@x")]);
    expect((await memory.list()).map((n) => n.text).sort()).toEqual(["one", "two"]);
  });

  it("serves its own last write instead of a stale KV read", async () => {
    const backend = memoryBackend();
    const memory = store(backend);
    await memory.add("fresh", "a@x");
    backend.value = JSON.stringify({ notes: [] }); // what a lagging KV edge might still return
    expect((await memory.list()).map((n) => n.text)).toEqual(["fresh"]);
  });

  it("rejects empty, overlong and too many notes, and unknown ids", async () => {
    const memory = store(memoryBackend());
    await expect(memory.add("   ", "a@x")).rejects.toMatchObject({ kind: "invalid" });
    await expect(memory.add("x".repeat(301), "a@x")).rejects.toMatchObject({ kind: "invalid" });
    await expect(memory.update("nope", "x", "a@x")).rejects.toMatchObject({ kind: "not_found" });
    const full = store(memoryBackend(JSON.stringify({ notes: Array.from({ length: MAX_NOTES }, (_, i) => ({ id: `n${i}`, text: "x" })) })));
    await expect(full.add("one more", "a@x")).rejects.toBeInstanceOf(MemoryError);
  });

  it("puts the notes after the rules, with ids the assistant can refer to", () => {
    expect(memoryPrompt([])).toBe("");
    const prompt = memoryPrompt([{ id: "m1", text: "Toyota 先查 VIN", createdBy: "", createdAt: "", updatedBy: "", updatedAt: "" }]);
    expect(prompt).toContain("never override");
    expect(prompt).toContain("- [m1] Toyota 先查 VIN");
  });
});

describe("Cloudflare KV backend", () => {
  const env = { NODE_ENV: "test", WORKBENCH_KV_ACCOUNT_ID: "acct", WORKBENCH_KV_NAMESPACE_ID: "ns", WORKBENCH_KV_API_TOKEN: "tok" } as NodeJS.ProcessEnv;

  it("is off until all three settings are present", () => {
    expect(cloudflareKvBackend({ ...env, WORKBENCH_KV_API_TOKEN: "" })).toBeNull();
  });

  it("reads and writes one key with the API token", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return init.method === "GET" ? new Response("missing", { status: 404 }) : Response.json({ success: true });
    }) as unknown as typeof fetch;
    const kv = cloudflareKvBackend(env, fetchImpl)!;
    expect(await kv.read()).toBeNull();
    await kv.write('{"notes":[]}');
    expect(calls[0].url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/storage/kv/namespaces/ns/values/workbench-memory-v1");
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(calls[1].init).toMatchObject({ method: "PUT", body: '{"notes":[]}' });
  });

  it("reports Cloudflare errors without the token", async () => {
    const kv = cloudflareKvBackend(env, (async () => new Response("no", { status: 403 })) as unknown as typeof fetch)!;
    const error = await kv.read().catch((e) => e);
    expect(error).toMatchObject({ kind: "upstream" });
    expect(String(error.message)).not.toContain("tok");
  });
});

describe("memory endpoint", () => {
  const deps = (user: { email: string } | null, memory: MemoryStore | null, log = vi.fn()): MemoryDeps => ({ user: async () => user, store: () => memory, log });
  const call = (method: string, body?: unknown) =>
    new Request("https://repair.speedxrental.com/api/workbench/memory", {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

  it("needs a signed-in staff member and a configured store", async () => {
    expect((await handleMemory(call("GET"), deps(null, store(memoryBackend())))).status).toBe(401);
    expect((await handleMemory(call("GET"), deps({ email: "a@x" }, null))).status).toBe(503);
  });

  it("lets any staff member add, edit and delete, and logs who did it", async () => {
    const memory = store(memoryBackend());
    const log = vi.fn();
    const added = await handleMemory(call("POST", { text: "Toyota 先查 VIN" }), deps({ email: "a@x" }, memory, log));
    expect(added.status).toBe(201);
    const { note } = (await added.json()) as { note: { id: string } };
    const edited = await handleMemory(call("PATCH", { id: note.id, text: "Toyota 先查 VIN 再报价" }), deps({ email: "b@x" }, memory, log));
    expect(((await edited.json()) as { notes: Array<{ text: string }> }).notes[0].text).toBe("Toyota 先查 VIN 再报价");
    const removed = await handleMemory(call("DELETE", { id: note.id }), deps({ email: "c@x" }, memory, log));
    expect(await removed.json()).toEqual({ notes: [] });
    expect(log.mock.calls.map(([entry]) => `${entry.action}:${entry.email}`)).toEqual(["add:a@x", "edit:b@x", "delete:c@x"]);
    expect((await handleMemory(call("DELETE", { id: note.id }), deps({ email: "c@x" }, memory))).status).toBe(404);
    expect((await handleMemory(call("POST", { text: "" }), deps({ email: "c@x" }, memory))).status).toBe(400);
  });
});

describe("memory in the chat", () => {
  const catalog = {} as CatalogApi;

  it("adds the shared notes to the assistant's instructions", async () => {
    const memory = store(memoryBackend());
    await memory.add("米其林冬季胎先问客人能不能接受带钉胎", "a@x");
    const create = vi.fn(async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "OK" }] }));
    const response = await handleWorkbenchChat(
      new Request("https://repair.speedxrental.com/api/workbench/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: [], message: "225/65R17 米其林冬季胎", vehicleKey: null }),
      }),
      {
        user: async () => ({ email: "a@x" }),
        configured: () => true,
        limiter: new RateLimiter(),
        log: () => {},
        catalog: () => catalog,
        client: () => ({ beta: { messages: { create: create as never } } }),
        memory: () => memory,
      },
    );
    await response.text();
    const system = (create.mock.calls[0] as unknown as [{ system: Array<{ text: string }> }])[0].system[0].text;
    expect(system).toContain("# Shop memory");
    expect(system).toContain("米其林冬季胎先问客人能不能接受带钉胎");
  });

  it("still answers when the memory store is down", async () => {
    const broken = new MemoryStore({ read: async () => Promise.reject(new MemoryError("down", "upstream")), write: async () => {} });
    const response = await handleWorkbenchChat(
      new Request("https://repair.speedxrental.com/api/workbench/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: [], message: "hi", vehicleKey: null }),
      }),
      {
        user: async () => ({ email: "a@x" }),
        configured: () => true,
        limiter: new RateLimiter(),
        log: () => {},
        catalog: () => catalog,
        client: () => ({ beta: { messages: { create: (async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "OK" }] })) as never } } }),
        memory: () => broken,
      },
    );
    expect(await response.text()).toContain('"text":"OK"');
  });

  it("only proposes notes; saving is up to staff", async () => {
    const out = await runWorkbenchTool(catalog, "propose_memory", { text: "Toyota 先查 VIN", replaces_id: "m7" }, () => "W-AB12", null);
    expect(out.events).toEqual([{ type: "memory_proposal", proposal: { id: "M-AB12", text: "Toyota 先查 VIN", replacesId: "m7" } }]);
    expect(JSON.parse(out.content).note).toContain("saved only if they press save");
    expect((await runWorkbenchTool(catalog, "propose_memory", { text: " ", replaces_id: null }, () => "W-1", null)).isError).toBe(true);
  });
});
