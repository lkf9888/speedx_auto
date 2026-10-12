import { describe, expect, it } from "vitest";
import { handleChat, isConfigured, parseBody, type RouteDeps } from "@/lib/repair-chat/http";
import { RateLimiter } from "@/lib/repair-chat/rate-limit";

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://speedxrental.com/api/repair-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "https://speedxrental.com", ...headers },
    body: JSON.stringify(body),
  });
}

const validBody = { locale: "en", history: [], message: "brake noise", vehicleKey: null };

function deps(overrides: Partial<RouteDeps> = {}): RouteDeps {
  return {
    configured: () => true,
    limiter: new RateLimiter(),
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
