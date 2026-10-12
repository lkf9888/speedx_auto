import { describe, expect, it } from "vitest";
import { handleChat, handleLead, isConfigured, parseBody, type RouteDeps } from "@/lib/repair-chat/http";
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
const validBody = { locale: "en", history: [], message: "brake noise", vehicleKey: null, lead };

function deps(overrides: Partial<RouteDeps> = {}): RouteDeps {
  return {
    configured: () => true,
    limiter: new RateLimiter(),
    notify: async () => {},
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
    expect(parseBody(validBody)).toEqual(validBody);
  });

  it("rejects unknown locales, oversized messages, and bad history", () => {
    expect(parseBody({ ...validBody, locale: "fr" })).toBeNull();
    expect(parseBody({ ...validBody, message: "x".repeat(1501) })).toBeNull();
    expect(parseBody({ ...validBody, history: [{ role: "system", text: "x" }] })).toBeNull();
    expect(parseBody({ ...validBody, history: [{ role: "assistant", text: "first" }] })).toBeNull();
  });

  it("requires a name and a phone number with at least 10 digits", () => {
    expect(parseBody({ ...validBody, lead: undefined })).toBeNull();
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
    expect(lines).toEqual([{ type: "message", text: "Hello" }, { type: "done" }]);
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
    expect(lines).toEqual([{ type: "error", code: "unavailable" }, { type: "done" }]);
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
    });
    expect(response.status).toBe(200);
    expect(events).toMatchObject([{ type: "lead_started", lead, locale: "zh-CN" }]);
    const bad = await handleLead(request({ locale: "zh-CN", lead: { name: "x", phone: "1" } }), {
      configured: () => true,
      limiter: new RateLimiter(),
      notify: async () => {},
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
