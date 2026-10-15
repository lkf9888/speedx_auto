import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { handleChat, handleFinish, handleLead, isConfigured, isEvalRequest, parseBody, type RouteDeps } from "@/lib/repair-chat/http";
import { SessionStore, type ChatSession, type FinishReason } from "@/lib/repair-chat/session";
import { createLeadNotifier, parseLead, type LeadEvent } from "@/lib/repair-chat/lead";
import { RateLimiter } from "@/lib/repair-chat/rate-limit";

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://speedxrental.com/api/repair-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "https://speedxrental.com", ...headers },
    body: JSON.stringify(body),
  });
}

const lead = { name: "Kevin Liu", phone: "604-555-0182" };
const validBody = { locale: "en", history: [], message: "brake noise", vehicleKey: null, lead, sessionId: null };

function recordingSessions() {
  const finished: Array<[ChatSession, FinishReason]> = [];
  const sessions = new SessionStore(async (s, r) => void finished.push([s, r]));
  return { sessions, finished };
}

function deps(overrides: Partial<RouteDeps> = {}): RouteDeps {
  return {
    configured: () => true,
    limiter: new RateLimiter(),
    notify: async () => {},
    sessions: new SessionStore(async () => {}),
    catalog: () => ({ get: async () => ({}) as never, post: async () => ({}) as never }),
    client: () => ({
      beta: {
        messages: {
          create: async () =>
            ({ stop_reason: "end_turn", content: [{ type: "text", text: "Hello" }] }) as never,
        },
      },
    }),
    ...overrides,
  };
}

describe("parseBody", () => {
  it("accepts a well-formed request", () => {
    expect(parseBody(validBody)).toEqual({ ...validBody, photos: [] });
  });

  it("rejects unknown locales, oversized messages, and bad history", () => {
    expect(parseBody({ ...validBody, locale: "fr" })).toBeNull();
    expect(parseBody({ ...validBody, message: "x".repeat(1501) })).toBeNull();
    expect(parseBody({ ...validBody, history: [{ role: "system", text: "x" }] })).toBeNull();
    expect(parseBody({ ...validBody, history: [{ role: "assistant", text: "first" }] })).toBeNull();
  });

  it("accepts no contact details yet, but rejects malformed ones", () => {
    expect(parseBody({ ...validBody, lead: undefined })).toEqual({ ...validBody, lead: null, photos: [] });
    expect(parseBody({ ...validBody, lead: null })).toEqual({ ...validBody, lead: null, photos: [] });
    expect(parseBody({ ...validBody, lead: { name: "", phone: "7789170710" } })).toBeNull();
    expect(parseBody({ ...validBody, lead: { name: "K", phone: "917-0710" } })).toBeNull();
    expect(parseLead({ name: "  Kevin   Liu ", phone: "+1 (778) 917-0710" })).toEqual({ name: "Kevin Liu", phone: "+1 (778) 917-0710" });
    expect(parseLead({ name: "<script>", phone: "7789170710" })).toBeNull();
  });
});

describe("isConfigured", () => {
  it("needs the API key and both WorldPac secrets", () => {
    const env = { ANTHROPIC_API_KEY: "k", WORLDPAC_USERNAME: "u", WORLDPAC_PASSWORD: "p" } as unknown as NodeJS.ProcessEnv;
    expect(isConfigured(env)).toBe(true);
    expect(isConfigured({ ...env, WORLDPAC_PASSWORD: "" })).toBe(false);
    expect(isConfigured({ ...env, REPAIR_CHAT_ENABLED: "false" })).toBe(false);
  });
});

describe("handleChat", () => {
  it("streams NDJSON events ending with the reply and done", async () => {
    const response = await handleChat(request(validBody), deps());
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    const lines = (await response.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => l.type)).toEqual(["session", "message", "done"]);
    expect(lines[1]).toEqual({ type: "message", text: "Hello" });
  });

  it("refuses other origins, unconfigured deployments, and bad bodies", async () => {
    expect((await handleChat(request(validBody, { origin: "https://evil.example" }), deps())).status).toBe(403);
    expect((await handleChat(request(validBody), deps({ configured: () => false }))).status).toBe(503);
    expect((await handleChat(request({ nope: true }), deps())).status).toBe(400);
  });

  it("rate-limits by client IP", async () => {
    const limiter = new RateLimiter({ perIpWindowMs: 60_000, perIpWindowMax: 1, perIpDailyMax: 10, globalDailyMax: 100 });
    const d = deps({ limiter });
    const headers = { "cf-connecting-ip": "1.2.3.4" };
    expect((await handleChat(request(validBody, headers), d)).status).toBe(200);
    expect((await handleChat(request(validBody, headers), d)).status).toBe(429);
    expect((await handleChat(request(validBody, { "cf-connecting-ip": "5.6.7.8" }), d)).status).toBe(200);
  });

  it("reports an upstream failure as an error event", async () => {
    const response = await handleChat(
      request(validBody),
      deps({ client: () => ({ beta: { messages: { create: async () => { throw new Error("boom"); } } } }) }),
    );
    const lines = (await response.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.slice(1)).toEqual([{ type: "error", code: "unavailable" }, { type: "done" }]);
  });
});

describe("RateLimiter", () => {
  it("enforces the global daily cap and resets the next day", () => {
    const limiter = new RateLimiter({ perIpWindowMs: 1000, perIpWindowMax: 100, perIpDailyMax: 100, globalDailyMax: 2 });
    const day = 24 * 60 * 60 * 1000;
    expect(limiter.check("a", 0)).toBeNull();
    expect(limiter.check("b", 1)).toBeNull();
    expect(limiter.check("c", 2)).toBe("global");
    expect(limiter.check("c", day + 1)).toBeNull();
  });
});

describe("lead delivery", () => {
  it("records a lead when the assistant is opened", async () => {
    const events: LeadEvent[] = [];
    const response = await handleLead(request({ locale: "zh-CN", lead }), {
      configured: () => true,
      limiter: new RateLimiter(),
      notify: async (e) => void events.push(e),
      sessions: new SessionStore(async () => {}),
    });
    expect(response.status).toBe(200);
    expect(events).toMatchObject([{ type: "lead_started", lead, locale: "zh-CN" }]);
    const bad = await handleLead(request({ locale: "zh-CN", lead: { name: "x", phone: "1" } }), {
      configured: () => true,
      limiter: new RateLimiter(),
      notify: async () => {},
      sessions: new SessionStore(async () => {}),
    });
    expect(bad.status).toBe(400);
  });

  it("forwards each estimate with the lead but never sends the lead to the model", async () => {
    const events: LeadEvent[] = [];
    const prompts: string[] = [];
    const key = Buffer.from(JSON.stringify({ b: 1, l: "2019 Toyota Camry", a: [] })).toString("base64url");
    const responses = [
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t", name: "get_estimate", input: { vehicle_key: key, service_id: 5, position: null } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Done" }] },
    ];
    const response = await handleChat(
      request(validBody),
      deps({
        notify: async (e) => void events.push(e),
        catalog: () => ({
          get: async () => ({}) as never,
          post: async (path: string) =>
            ({
              "labor-ops-list": { laborOperations: [{ applicationID: 1, assetName: "a", positionID: -1 }] },
              "labor-ops-details": { laborOperation: { estimateTimeHour: 1, laborCategoryName: "Alternator R&R", applications: [] } },
            })[path] as never,
        }),
        client: () => ({
          beta: {
            messages: {
              create: async (params) => {
                prompts.push(JSON.stringify(params));
                return responses.shift() as never;
              },
            },
          },
        }),
      }),
    );
    await response.text();
    expect(events).toMatchObject([
      { type: "estimate_shown", lead, estimate: { service: "Alternator R&R", totalLow: 120, totalHigh: 120 } },
    ]);
    expect(prompts.join("")).not.toContain("Kevin");
    expect(prompts.join("")).not.toContain("555-0182");
  });

  it("holds an estimate until the visitor gives name and phone, then releases it once", async () => {
    const events: LeadEvent[] = [];
    const { sessions } = recordingSessions();
    const key = Buffer.from(JSON.stringify({ b: 1, l: "2019 Toyota Camry", a: [] })).toString("base64url");
    const responses = [
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t", name: "get_estimate", input: { vehicle_key: key, service_id: 5, position: null } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "About $120 before tax." }] },
    ];
    const chatDeps = deps({
      sessions,
      notify: async (e) => void events.push(e),
      catalog: () => ({
        get: async () => ({}) as never,
        post: async (path: string) =>
          ({
            "labor-ops-list": { laborOperations: [{ applicationID: 1, assetName: "a", positionID: -1 }] },
            "labor-ops-details": { laborOperation: { estimateTimeHour: 1, laborCategoryName: "Alternator R&R", applications: [] } },
          })[path] as never,
      }),
      client: () => ({ beta: { messages: { create: async () => responses.shift() as never } } }),
    });
    const chat = await handleChat(request({ ...validBody, lead: null }), chatDeps);
    const text = await chat.text();
    const lines = text.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => l.type)).toEqual(["session", "status", "lead_required", "done"]);
    expect(text).not.toContain("$120");
    expect(text).not.toContain("Alternator");
    expect(events).toEqual([]);

    const sessionId = lines[0].id as string;
    const unlock = () =>
      handleLead(request({ locale: "en", lead, sessionId }), { ...chatDeps, limiter: new RateLimiter() }).then((r) => r.json());
    const released = (await unlock()) as { sessionId: string; pending: { text: string; estimates: Array<{ service: string }> } };
    expect(released.sessionId).toBe(sessionId);
    expect(released.pending.text).toBe("About $120 before tax.");
    expect(released.pending.estimates[0].service).toBe("Alternator R&R");
    expect(events).toMatchObject([
      { type: "lead_started", lead },
      { type: "estimate_shown", lead, estimate: { service: "Alternator R&R" } },
    ]);
    expect(sessions.get(sessionId)?.lead).toEqual(lead);
    expect(((await unlock()) as { pending: unknown }).pending).toBeNull();
    expect(events).toHaveLength(2);
  });

  it("sends no follow-up email for a visitor who never left contact details", async () => {
    const sent: unknown[] = [];
    const { createFollowUpHandler } = await import("@/lib/repair-chat/followup");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const store = new SessionStore(createFollowUpHandler(() => null, async (email) => void sent.push(email)));
    const anonymous = store.create(null, "en");
    store.record(anonymous.id, { role: "user", text: "brake noise" });
    await store.finish(anonymous.id, "idle");
    expect(sent).toEqual([]);
    info.mockRestore();
  });

  it("posts to the webhook and falls back to the log when delivery fails", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const ok = createLeadNotifier("https://hooks.example/lead", (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) });
      return new Response("ok");
    }) as typeof fetch);
    await ok({ type: "lead_started", lead, locale: "en", at: "t" });
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].body)).toMatchObject({ type: "lead_started", lead });

    const failing = createLeadNotifier("https://hooks.example/lead", (async () => new Response("no", { status: 500 })) as typeof fetch);
    await expect(failing({ type: "lead_started", lead, locale: "en", at: "t" })).resolves.toBeUndefined();
  });
});

describe("follow-up sessions", () => {
  it("opens a session for the lead, records the chat, and finishes when the visitor leaves", async () => {
    const { sessions, finished } = recordingSessions();
    const opened = await handleLead(request({ locale: "en", lead }), {
      configured: () => true,
      limiter: new RateLimiter(),
      notify: async () => {},
      sessions,
    });
    const { sessionId } = (await opened.json()) as { sessionId: string };
    expect(sessionId).toMatch(/^[a-f0-9]{32}$/);

    const chat = await handleChat(request({ ...validBody, sessionId }), deps({ sessions }));
    const lines = (await chat.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.some((l) => l.type === "session")).toBe(false);

    const left = await handleFinish(request({ sessionId }), { sessions });
    expect(left.status).toBe(204);
    await new Promise((r) => setTimeout(r, 0));
    expect(finished).toHaveLength(1);
    expect(finished[0][1]).toBe("left_page");
    expect(finished[0][0].lead).toEqual(lead);
    expect(finished[0][0].transcript.map((t) => [t.role, t.text])).toEqual([
      ["user", "brake noise"],
      ["assistant", "Hello"],
    ]);
  });

  it("ignores finish requests for unknown or malformed sessions", async () => {
    const { sessions, finished } = recordingSessions();
    expect((await handleFinish(request({ sessionId: "nope" }), { sessions })).status).toBe(204);
    expect((await handleFinish(request({ sessionId: "b".repeat(32) }), { sessions })).status).toBe(204);
    expect(finished).toHaveLength(0);
  });
});

describe("evaluation mode", () => {
  const token = "test-eval-token";
  const sha = createHash("sha256").update(token).digest("hex");

  it("recognizes only the configured token", () => {
    const withToken = request(validBody, { "x-repair-eval": token });
    expect(isEvalRequest(withToken, sha)).toBe(true);
    expect(isEvalRequest(request(validBody, { "x-repair-eval": "wrong" }), sha)).toBe(false);
    expect(isEvalRequest(request(validBody), sha)).toBe(false);
  });

  it("does not treat a normal chat as evaluation or finish its session early", async () => {
    const { sessions, finished } = recordingSessions();
    const response = await handleChat(request(validBody), deps({ sessions }));
    await response.text();
    expect(sessions.size).toBe(1);
    expect(finished).toHaveLength(0);
  });
});

describe("photos from customers", () => {
  const photo = { name: "vin.jpg", mediaType: "image/jpeg", data: "AQID" };

  it("takes up to two photos, alone or with text, and nothing but photos", () => {
    expect(parseBody({ ...validBody, message: "", photos: [photo] })).toMatchObject({ message: "Please look at my photo.", photos: [photo] });
    expect(parseBody({ ...validBody, locale: "zh-CN", message: "", photos: [photo] })!.message).toBe("请看照片。");
    expect(parseBody({ ...validBody, photos: [photo, photo, photo] })).toBeNull();
    expect(parseBody({ ...validBody, photos: [{ ...photo, mediaType: "application/pdf" }] })).toBeNull();
    expect(parseBody({ ...validBody, photos: [{ ...photo, data: "not base64!" }] })).toBeNull();
  });

  it("shows the photos to the model, and the shop's record only says a photo was sent", async () => {
    const { sessions } = recordingSessions();
    let content: unknown = null;
    const create = vi.fn(async (params: { messages: Array<{ role: string; content: unknown }> }) => {
      content = params.messages;
      return { stop_reason: "end_turn", content: [{ type: "text", text: "That's VIN …1234" }] } as never;
    });
    const response = await handleChat(request({ ...validBody, message: "", photos: [photo] }), deps({ sessions, client: () => ({ beta: { messages: { create } } }) }));
    const events = (await response.text()).trim().split("\n").map((l) => JSON.parse(l) as { type: string; id?: string });
    expect(JSON.stringify(content)).toContain('"type":"image"');
    expect(JSON.stringify(content)).toContain("Please look at my photo.");
    const recorded = JSON.stringify(sessions.get(events.find((e) => e.type === "session")!.id)!.transcript);
    expect(recorded).toContain("[photo ×1]");
    expect(recorded).not.toContain("AQID");
  });
});
