import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { cappedReply, handleChat, type RouteDeps } from "@/lib/repair-chat/http";
import { RateLimiter } from "@/lib/repair-chat/rate-limit";
import { SessionStore, type ChatSession, type FinishReason } from "@/lib/repair-chat/session";
import { registerShutdownFlush } from "@/lib/repair-chat/shutdown";
import { DailyOpenCounter, isAllowlisted, parseAllowlist } from "@/lib/repair-chat/visitor";

const lead = { name: "Kevin Liu", phone: "604-555-0182" };

function request(path: string, body: unknown, ip = "198.51.100.7") {
  return new Request(`https://speedxrental.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "https://speedxrental.com", "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  });
}

describe("DailyOpenCounter", () => {
  it("counts per IP and resets at midnight Vancouver time", () => {
    const counter = new DailyOpenCounter();
    const evening = new Date("2026-10-13T06:30:00Z"); // 23:30 PDT on Oct 12
    expect(counter.record("a", evening)).toBe(1);
    expect(counter.record("a", evening)).toBe(2);
    expect(counter.record("b", evening)).toBe(1);
    const nextMorning = new Date("2026-10-13T07:30:00Z"); // 00:30 PDT on Oct 13
    expect(counter.today("a", nextMorning)).toBe(0);
    expect(counter.record("a", nextMorning)).toBe(1);
  });
});

describe("IP allowlist", () => {
  it("matches addresses and ranges, IPv4 and IPv6, and skips bad entries", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const list = parseAllowlist("203.0.113.7, 192.0.2.0/24  2001:db8:1:2::/64, not-an-ip");
    expect(isAllowlisted(list, "203.0.113.7")).toBe(true);
    expect(isAllowlisted(list, "192.0.2.200")).toBe(true);
    expect(isAllowlisted(list, "2001:db8:1:2:abcd::9")).toBe(true);
    expect(isAllowlisted(list, "2001:db8:1:3::9")).toBe(false);
    expect(isAllowlisted(list, "203.0.113.8")).toBe(false);
    expect(isAllowlisted(list, "unknown")).toBe(false);
    expect(isAllowlisted(parseAllowlist(undefined), "203.0.113.7")).toBe(false);
    expect(errors).toHaveBeenCalledOnce();
    errors.mockRestore();
  });
});

function setup(allowlist = "") {
  const finished: Array<[ChatSession, FinishReason]> = [];
  const sessions = new SessionStore(async (s, r) => void finished.push([s, r]));
  const model = vi.fn(async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "AI reply" }] }) as never);
  const deps: RouteDeps = {
    configured: () => true,
    limiter: new RateLimiter(),
    notify: async () => {},
    sessions,
    opens: new DailyOpenCounter(),
    allowlist: parseAllowlist(allowlist),
    catalog: () => ({ get: async () => ({}) as never, post: async () => ({}) as never }),
    client: () => ({ beta: { messages: { create: model } } }),
  };
  /** One chat message; sessionId null starts a new conversation. */
  const chat = async (sessionId: string | null, ip?: string, history: unknown[] = []) => {
    const response = await handleChat(
      request("/api/repair-chat", { locale: "zh-CN", history, message: "刹车响", vehicleKey: null, sessionId }, ip),
      deps,
    );
    const lines = (await response.text()).trim().split("\n").map((l) => JSON.parse(l));
    return {
      text: lines.find((l) => l.type === "message")?.text as string,
      capped: lines.some((l) => l.type === "capped"),
      sessionId: (lines.find((l) => l.type === "session")?.id as string | undefined) ?? sessionId,
    };
  };
  return { deps, sessions, finished, model, chat };
}

describe("daily conversation limit", () => {
  it("answers the 4th conversation of the day with the call-us reply, without the AI", async () => {
    const { chat, model, sessions } = setup();
    const first = await chat(null);
    await chat(null);
    await chat(null);
    expect(model).toHaveBeenCalledTimes(3);
    const fourth = await chat(null);
    expect(fourth.capped).toBe(true);
    expect(fourth.text).toBe(cappedReply("zh-CN"));
    expect(fourth.text).toContain("+1 (778) 917-0710");
    expect(model).toHaveBeenCalledTimes(3);
    expect(sessions.get(fourth.sessionId)).toMatchObject({ capped: true, opensToday: 4 });

    // Messages in an earlier conversation still reach the AI; the capped one stays capped.
    expect((await chat(first.sessionId)).text).toBe("AI reply");
    expect((await chat(fourth.sessionId)).capped).toBe(true);
    expect(model).toHaveBeenCalledTimes(4);
  });

  it("never caps allowlisted IPs, and other IPs are counted separately", async () => {
    const { chat, model } = setup("198.51.100.7");
    for (let i = 0; i < 6; i += 1) expect((await chat(null)).capped).toBe(false);
    for (let i = 0; i < 3; i += 1) await chat(null, "192.0.2.1");
    expect((await chat(null, "192.0.2.1")).capped).toBe(true);
    expect(model).toHaveBeenCalledTimes(9);
  });

  it("names the daily count in the shop's email", async () => {
    const { chat, sessions, finished } = setup();
    for (let i = 0; i < 4; i += 1) {
      const { sessionId } = await chat(null);
      sessions.attachLead(sessionId!, lead);
    }
    await sessions.finishAll("idle");
    const { composeFollowUpEmail } = await import("@/lib/repair-chat/followup");
    const capped = finished.find(([s]) => s.capped)!;
    expect(composeFollowUpEmail(capped[0], "idle", null).text).toContain("该 IP 今天第 4 次");
  });
});

describe("restarts", () => {
  it("rebuilds a lost session from the browser's history", async () => {
    const { chat, sessions, finished } = setup();
    await chat("d".repeat(32), undefined, [
      { role: "user", text: "2019 凯美瑞" },
      { role: "assistant", text: "什么问题？" },
    ]);
    await sessions.finishAll("idle");
    expect(finished[0][0].transcript.map((t) => t.text)).toEqual(["2019 凯美瑞", "什么问题？", "刹车响", "AI reply"]);
  });

  it("finishes every open session before the process exits", async () => {
    const finished: FinishReason[] = [];
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    const store = new SessionStore(async (_s, reason) => {
      finished.push(reason);
      await slow;
    });
    store.create(lead, "en");
    store.create(lead, "en");

    const proc = Object.assign(new EventEmitter(), { env: {}, exit: vi.fn() }) as unknown as NodeJS.Process;
    const realExit = proc.exit;
    const holder = globalThis as Record<symbol, unknown>;
    delete holder[Symbol.for("speedx.repairChat.shutdownFlush")];
    registerShutdownFlush(store, proc);

    proc.emit("SIGTERM");
    proc.exit(143); // what Next.js does once in-flight requests are done
    await new Promise((r) => setTimeout(r, 0));
    expect(finished).toEqual(["server_restart", "server_restart"]);
    expect(realExit).not.toHaveBeenCalled();

    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(realExit).toHaveBeenCalledWith(143);
    delete holder[Symbol.for("speedx.repairChat.shutdownFlush")];
  });
});
