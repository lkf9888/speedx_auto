import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HouseRulesPanel } from "@/components/workbench/HouseRulesPanel";
import { publicProfile, runChat } from "@/lib/repair-chat/agent";
import {
  applyDiscounts,
  cleanRule,
  discountLabel,
  houseNotesPrompt,
  phoneKey,
  rulesFor,
  type HouseRule,
} from "@/lib/repair-chat/house-rules";
import { handleChat, handleLead, type RouteDeps } from "@/lib/repair-chat/http";
import { buildEstimate, buildFlatEstimate, buildTireEstimate, buildTeamQuoteCard, summarizeEstimateForModel, type EstimateCard } from "@/lib/repair-chat/pricing";
import { RateLimiter } from "@/lib/repair-chat/rate-limit";
import { SessionStore } from "@/lib/repair-chat/session";
import { askRulesAssistant } from "@/lib/workbench/house-rules-agent";
import { handleHouseRules, handleHouseRulesChat, type HouseRulesDeps } from "@/lib/workbench/house-rules-http";
import { canEditHouseRules, HOUSE_RULES_KEY, HouseRulesStore } from "@/lib/workbench/house-rules-store";
import { memoryKv } from "@/lib/workbench/kv";

const who = { email: "owner@example.com", at: "2026-11-14T20:00:00.000Z", id: "R-1" };

function rule(fields: Partial<HouseRule>): HouseRule {
  return cleanRule({ kind: "discount", title: "测试", labelEn: "Test offer", labelZh: "测试优惠", ...fields }, { ...who, id: fields.id ?? "R-1" });
}

const laborCard = (hours = 1, service = "Brake Pads R&R") =>
  buildEstimate("2019 Toyota Camry", { status: "ok", serviceName: service, position: "Front", laborHours: hours, laborNote: "", primaryPartName: "", partOptions: [], otherPartNames: [], partsNote: "" }, "E-1");
const oilCard = () =>
  buildFlatEstimate("2019 Toyota Camry", { status: "ok", service: "oil_change", size: null, perWheel: false, options: [{ code: "oil_standard", unitPrice: 95, quantity: 1 }, { code: "oil_premium", unitPrice: 120, quantity: 1 }] } as never, "zh-CN", "E-2");
const tireCard = () => buildTireEstimate("2019 Toyota Camry", "New tires 225/65R17", [{ brand: "A", pattern: "B", size: "225/65R17", load: "", season: "winter", perTire: 150, count: 4, total: 600 }] as never, "", "E-3");

describe("cleanRule", () => {
  it("keeps a note's instruction and drops discount fields", () => {
    const note = cleanRule({ kind: "note", title: "当天修", text: "Say same-day is usually possible.", percent: 10 }, who);
    expect(note).toMatchObject({ kind: "note", text: "Say same-day is usually possible.", percent: 0, labelEn: "" });
  });

  it("refuses rules staff couldn't mean", () => {
    expect(() => cleanRule({ kind: "note", title: "x", text: "" }, who)).toThrow(/怎么做/);
    expect(() => rule({ percent: 10, amount: 5 })).toThrow(/二选一/);
    expect(() => rule({ percent: 0, amount: 0 })).toThrow(/二选一/);
    expect(() => rule({ percent: 120 })).toThrow(/0–100/);
    expect(() => rule({ amount: 10, startDate: "2026-11-30", endDate: "2026-11-01" })).toThrow(/早于/);
    expect(() => rule({ amount: 10, endDate: "2026-02-30" })).toThrow(/YYYY-MM-DD/);
    expect(() => rule({ amount: 10, appliesTo: "oil_change", on: "labor" })).toThrow(/工时/);
    expect(() => rule({ amount: 10, labelEn: "", labelZh: "" })).toThrow(/名字/);
  });

  it("keeps phone numbers out of anything the AI reads, and only in the customer field", () => {
    expect(() => cleanRule({ kind: "note", title: "VIP", text: "Customer 604-555-0182 gets priority" }, who)).toThrow(/电话/);
    expect(() => rule({ amount: 10, labelZh: "7789170710 专享" })).toThrow(/电话/);
    expect(rule({ amount: 10, customerPhone: "+1 (604) 555-0182" }).customerPhone).toBe("6045550182");
    expect(cleanRule({ kind: "note", title: "车型", text: "2019-2022 Camry brake pads are usually in stock" }, who).text).toContain("2019-2022");
  });

  it("normalises phone numbers to their last 10 digits", () => {
    expect(phoneKey("1-604-555-0182")).toBe("6045550182");
    expect(phoneKey("604 555 0182")).toBe("6045550182");
    expect(phoneKey("123")).toBe("");
  });
});

describe("which rules apply", () => {
  const rules = [
    rule({ id: "R-A", amount: 10, startDate: "2026-11-01", endDate: "2026-11-30" }),
    rule({ id: "R-B", amount: 20, startDate: "2026-12-01" }),
    rule({ id: "R-C", amount: 30, customerPhone: "604-555-0182" }),
  ];

  it("runs between its dates, inclusive", () => {
    expect(rulesFor(rules, "2026-11-30", null).map((r) => r.id)).toEqual(["R-A"]);
    expect(rulesFor(rules, "2026-12-01", null).map((r) => r.id)).toEqual(["R-B"]);
  });

  it("gives a customer-only rule to that customer once their phone is known", () => {
    expect(rulesFor(rules, "2026-11-14", "(604) 555-0182").map((r) => r.id)).toEqual(["R-A", "R-C"]);
    expect(rulesFor(rules, "2026-11-14", "604-555-9999").map((r) => r.id)).toEqual(["R-A"]);
  });
});

describe("applyDiscounts", () => {
  const label = (r: HouseRule) => discountLabel(r, "en");

  it("takes a percentage off the labor of a labor-guide job", () => {
    const card = applyDiscounts(laborCard(1), [rule({ percent: 10, appliesTo: "labor_jobs", on: "labor" })], label);
    expect(card.discount).toEqual({ label: "Test offer", low: 12, high: 12 });
    expect([card.totalLow, card.totalHigh]).toEqual([108, 108]);
    expect(card.laborWalkIn).toBe(120);
  });

  it("takes a fixed amount off a flat-price service, only the one it names", () => {
    const rules = [rule({ amount: 16, appliesTo: "oil_change" })];
    const oil = applyDiscounts(oilCard(), rules, label);
    expect([oil.totalLow, oil.totalHigh]).toEqual([79, 104]);
    expect(applyDiscounts(tireCard(), rules, label).discount).toBeUndefined();
  });

  it("uses the best single discount, matches service keywords, and never touches a team quote", () => {
    const rules = [rule({ id: "R-1", percent: 5 }), rule({ id: "R-2", amount: 50, serviceKeyword: "brake", labelEn: "Brake week" })];
    expect(applyDiscounts(laborCard(1), rules, label).discount?.label).toBe("Brake week");
    expect(applyDiscounts(laborCard(1, "Alternator R&R"), rules, label).discount?.label).toBe("Test offer");
    expect(applyDiscounts(tireCard(), rules, label).discount).toMatchObject({ low: 30, high: 30 });
    const team = buildTeamQuoteCard("Car", "Body work", "x", "E-9");
    expect(applyDiscounts(team, rules, label)).toBe(team);
  });

  it("never takes off more than the estimate", () => {
    const card = applyDiscounts(laborCard(0.2), [rule({ amount: 500 })], label);
    expect([card.totalLow, card.totalHigh]).toEqual([0, 0]);
  });

  it("tells the model the discount is already in the total", () => {
    const card = applyDiscounts(laborCard(1), [rule({ amount: 20 })], label);
    const summary = summarizeEstimateForModel(card);
    expect(summary).toContain('Discount shown on the card: "Test offer", $20 off');
    expect(summary).toContain("$90–$110");
  });
});

describe("houseNotesPrompt", () => {
  it("gives the running notes without phone numbers, and keeps the fixed rules above them", () => {
    const rules = [
      cleanRule({ kind: "note", title: "当天", text: "Say same-day brake work is usually possible.", endDate: "2026-11-30" }, who),
      cleanRule({ kind: "note", title: "VIP", text: "Offer a courtesy call when the car is ready.", customerPhone: "604-555-0182" }, { ...who, id: "R-2" }),
      rule({ id: "R-3", amount: 10, labelEn: "November offer" }),
    ];
    const prompt = houseNotesPrompt(rules);
    expect(prompt).toContain("Say same-day brake work is usually possible. (until 2026-11-30)");
    expect(prompt).toContain("For this customer: Offer a courtesy call");
    expect(prompt).toContain("November offer");
    expect(prompt).toMatch(/never state or hint at an hourly labor rate/);
    expect(prompt).not.toMatch(/604|555|0182/);
    expect(houseNotesPrompt([])).toBe("");
  });
});

describe("the website assistant with the owner's rules", () => {
  const key = Buffer.from(JSON.stringify({ b: 1, l: "2019 Toyota Camry", a: [] })).toString("base64url");
  const catalog = {
    get: async () => ({}) as never,
    post: async (path: string) =>
      ({
        "labor-ops-list": { laborOperations: [{ applicationID: 1, assetName: "a", positionID: -1 }] },
        "labor-ops-details": { laborOperation: { estimateTimeHour: 1, laborCategoryName: "Brake Pads R&R", applications: [] } },
      })[path] as never,
  };

  function client(requests: string[]) {
    const replies = [
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t", name: "get_estimate", input: { vehicle_key: key, service_id: 5, position: null, done_with_service_id: 0, done_with_position: "", both_sides: false } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "About $97–$119 with the November offer." }] },
    ];
    return {
      beta: {
        messages: {
          create: async (params: unknown) => {
            requests.push(JSON.stringify(params));
            return replies.shift() as never;
          },
        },
      },
    };
  }

  const rules = [
    rule({ id: "R-1", amount: 12, labelEn: "November offer", labelZh: "十一月优惠" }),
    cleanRule({ kind: "note", title: "VIP", text: "Thank them for coming back.", customerPhone: "604-555-0182" }, { ...who, id: "R-2" }),
  ];

  it("puts the discount on the card before the model sees it, and the notes in its instructions", async () => {
    const requests: string[] = [];
    const events: Array<{ type: string; estimate?: EstimateCard }> = [];
    await runChat(
      client(requests),
      catalog,
      { history: [], message: "front brakes", locale: "en", vehicleKey: null },
      (e) => void events.push(e),
      () => "E-1",
      publicProfile({ rules, customerPhone: "6045550182", now: new Date("2026-11-14T20:00:00Z") }),
    );
    const card = events.find((e) => e.type === "estimate")?.estimate;
    expect(card?.discount).toMatchObject({ label: "November offer", low: 12 });
    expect(card?.totalLow).toBe(108);
    expect(requests[1]).toContain("November offer");
    expect(requests[0]).toContain("For this customer: Thank them for coming back.");
    expect(requests.join("")).not.toMatch(/604|0182/);
  });

  it("labels the discount in Traditional Chinese for a Traditional Chinese customer", async () => {
    const events: Array<{ type: string; estimate?: EstimateCard }> = [];
    await runChat(client([]), catalog, { history: [], message: "前輪煞車片要換", locale: "zh-TW", vehicleKey: null }, (e) => void events.push(e), () => "E-1", publicProfile({ rules, customerPhone: null }));
    expect(events.find((e) => e.type === "estimate")?.estimate?.discount?.label).toBe("十一月優惠");
  });

  it("is the plain assistant when no rule runs today", () => {
    const profile = publicProfile({ rules: [rule({ amount: 5, endDate: "2026-01-01" })], customerPhone: null, now: new Date("2026-11-14T20:00:00Z") });
    expect(profile).toBe(publicProfile(null));
  });

  it("applies a customer's rule through the website chat once they've given their phone, and survives a rules outage", async () => {
    const make = (houseRules: RouteDeps["houseRules"], requests: string[]): RouteDeps => ({
      configured: () => true,
      limiter: new RateLimiter(),
      notify: async () => {},
      sessions: new SessionStore(async () => {}),
      catalog: () => catalog,
      client: () => client(requests),
      houseRules,
    });
    const body = { locale: "en", history: [], message: "front brakes", vehicleKey: null, lead: { name: "Test", phone: "604-555-0182" }, sessionId: null };
    const post = (deps: RouteDeps) =>
      handleChat(new Request("https://speedxrental.com/api/repair-chat", { method: "POST", headers: { "Content-Type": "application/json", origin: "https://speedxrental.com" }, body: JSON.stringify(body) }), deps).then((r) => r.text());

    const requests: string[] = [];
    const text = await post(make(async () => rules, requests));
    expect(requests[0]).toContain("Thank them for coming back.");
    const streamed = text.trim().split("\n").map((l) => JSON.parse(l)).find((l) => l.type === "estimate");
    expect(streamed.estimate.discount.label).toBe("November offer");

    const quiet: string[] = [];
    const fallback = await post(make(async () => { throw new Error("KV down"); }, quiet));
    expect(fallback).toContain('"type":"message"');
    expect(quiet[0]).not.toContain("Thank them");
  });
});

describe("review fixes", () => {
  const label = (r: HouseRule) => discountLabel(r, "en");

  it("takes a labor discount only off labor-guide jobs, never off tires or flat prices", () => {
    const rules = [rule({ percent: 10, appliesTo: "all", on: "labor" })];
    expect(applyDiscounts(tireCard(), rules, label).discount).toBeUndefined();
    expect(applyDiscounts(oilCard(), rules, label).discount).toBeUndefined();
    expect(applyDiscounts(laborCard(1), rules, label).discount).toMatchObject({ low: 12 });
  });

  it("keeps a customer's rule for that customer when an update leaves the phone empty; everyone opens it up", () => {
    const base = rule({ amount: 10, customerPhone: "604-555-0182" });
    expect(cleanRule({ amount: 15, customerPhone: "" }, who, base)).toMatchObject({ amount: 15, customerPhone: "6045550182" });
    expect(cleanRule({ customerPhone: "everyone" }, who, base).customerPhone).toBe("");
    expect(cleanRule({ customerPhone: "778-555-0100" }, who, base).customerPhone).toBe("7785550100");
  });

  it("re-prices estimates held for a phone number with that customer's discount", async () => {
    const rules = [rule({ id: "R-1", percent: 10, labelEn: "Returning customer", labelZh: "老客人优惠", customerPhone: "604-555-0182" })];
    const key = Buffer.from(JSON.stringify({ b: 1, l: "2019 Toyota Camry", a: [] })).toString("base64url");
    const replies = [
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t", name: "get_estimate", input: { vehicle_key: key, service_id: 5, position: null, done_with_service_id: 0, done_with_position: "", both_sides: false } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "About $108–$132." }] },
    ];
    const sessions = new SessionStore(async () => {});
    const deps: RouteDeps = {
      configured: () => true,
      limiter: new RateLimiter(),
      notify: async () => {},
      sessions,
      catalog: () => ({
        get: async () => ({}) as never,
        post: async (path: string) =>
          ({
            "labor-ops-list": { laborOperations: [{ applicationID: 1, assetName: "a", positionID: -1 }] },
            "labor-ops-details": { laborOperation: { estimateTimeHour: 1, laborCategoryName: "Brake Pads R&R", applications: [] } },
          })[path] as never,
      }),
      client: () => ({ beta: { messages: { create: async () => replies.shift() as never } } }),
      houseRules: async () => rules,
    };
    const post = (path: string, body: unknown) =>
      new Request(`https://speedxrental.com${path}`, { method: "POST", headers: { "Content-Type": "application/json", origin: "https://speedxrental.com" }, body: JSON.stringify(body) });
    const chat = await (await handleChat(post("/api/repair-chat", { locale: "en", history: [], message: "front brakes", vehicleKey: null, lead: null, sessionId: null }), deps)).text();
    const sessionId = JSON.parse(chat.trim().split("\n")[0]).id as string;
    const released = (await (await handleLead(post("/api/repair-lead", { locale: "en", lead: { name: "Test", phone: "(604) 555-0182" }, sessionId }), { ...deps, limiter: new RateLimiter() })).json()) as {
      pending: { text: string; estimates: EstimateCard[] };
    };
    expect(released.pending.estimates[0].discount).toMatchObject({ label: "Returning customer", low: 12 });
    expect(released.pending.estimates[0].totalLow).toBe(108);
    expect(released.pending.text).toContain("now includes your discount");
  });

  it("doesn't keep the website chat waiting when the rules are slow", async () => {
    const started = Date.now();
    const deps: RouteDeps = {
      configured: () => true,
      limiter: new RateLimiter(),
      notify: async () => {},
      sessions: new SessionStore(async () => {}),
      catalog: () => ({ get: async () => ({}) as never, post: async () => ({}) as never }),
      client: () => ({ beta: { messages: { create: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "Hi" }] }) as never } } }),
      houseRules: () => new Promise(() => {}),
    };
    const text = await (
      await handleChat(
        new Request("https://speedxrental.com/api/repair-chat", { method: "POST", headers: { "Content-Type": "application/json", origin: "https://speedxrental.com" }, body: JSON.stringify({ locale: "en", history: [], message: "hi", vehicleKey: null, lead: null, sessionId: null }) }),
        deps,
      )
    ).text();
    expect(text).toContain('"text":"Hi"');
    expect(Date.now() - started).toBeLessThan(4_000);
  });
});

describe("HouseRulesStore", () => {
  it("keeps the last rules for the website when KV fails, and reads once at a time", async () => {
    let now = 0;
    const kv = memoryKv({ [HOUSE_RULES_KEY]: JSON.stringify({ rules: [rule({ id: "R-1", amount: 5 })] }) });
    const store = new HouseRulesStore(kv, () => now);
    expect(await store.list()).toHaveLength(1);
    now = 61_000;
    const get = vi.spyOn(kv, "get").mockRejectedValue(new Error("KV down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const [a, b] = await Promise.all([store.list(), store.list()]);
    expect(a).toHaveLength(1);
    expect(b).toBe(a);
    expect(get).toHaveBeenCalledTimes(1);
    // The failure is remembered for a minute, so the next chats don't wait on KV.
    await store.list();
    expect(get).toHaveBeenCalledTimes(1);
    await expect(store.list(true)).rejects.toThrow(/KV down/);
  });

  it("adds, updates and deletes all at once, and checks without saving", async () => {
    const kv = memoryKv();
    const store = new HouseRulesStore(kv);
    const added = await store.apply([{ action: "add", rule: { kind: "note", title: "当天", text: "Same day is usually fine." } }], "owner@example.com");
    expect(added).toHaveLength(1);
    const id = added[0].id;
    expect(id).toMatch(/^R-[0-9A-F]{6}$/);
    const updated = await store.apply([{ action: "update", id, rule: { text: "Same day if parts are in stock." } }], "staff@example.com");
    expect(updated[0]).toMatchObject({ text: "Same day if parts are in stock.", createdBy: "owner@example.com", updatedBy: "staff@example.com" });

    const writes = kv.writes;
    await expect(store.check([{ action: "add", rule: { kind: "discount", title: "x", percent: 10, amount: 10, labelEn: "x" } }])).rejects.toThrow(/二选一/);
    await store.check([{ action: "delete", id }]);
    expect(kv.writes).toBe(writes);

    // One bad change means nothing is saved.
    await expect(store.apply([{ action: "delete", id }, { action: "delete", id: "R-NOPE" }], "owner@example.com")).rejects.toThrow(/找不到/);
    expect(JSON.parse(kv.data.get(HOUSE_RULES_KEY)!).rules).toHaveLength(1);
    expect(await store.apply([{ action: "delete", id }], "owner@example.com")).toEqual([]);
  });

  it("serves the public chat from a one-minute cache", async () => {
    let now = 0;
    const kv = memoryKv({ [HOUSE_RULES_KEY]: JSON.stringify({ rules: [] }) });
    const reads = vi.spyOn(kv, "get");
    const store = new HouseRulesStore(kv, () => now);
    await store.list();
    await store.list();
    expect(reads).toHaveBeenCalledTimes(1);
    now = 61_000;
    await store.list();
    expect(reads).toHaveBeenCalledTimes(2);
  });

  it("lets everyone edit until WEBSITE_RULES_ADMINS is set, then only those emails", () => {
    expect(canEditHouseRules("a@x.com", {} as NodeJS.ProcessEnv)).toBe(true);
    const env = { WEBSITE_RULES_ADMINS: "Owner@X.com, b@x.com" } as unknown as NodeJS.ProcessEnv;
    expect(canEditHouseRules("owner@x.com", env)).toBe(true);
    expect(canEditHouseRules("c@x.com", env)).toBe(false);
  });
});

describe("/api/workbench/house-rules", () => {
  function deps(email: string | null, overrides: Partial<HouseRulesDeps> = {}): HouseRulesDeps & { saved: HouseRulesStore } {
    const store = new HouseRulesStore(memoryKv());
    return {
      saved: store,
      user: async () => (email ? { email } : null),
      store: () => store,
      canEdit: (e) => e === "owner@x.com",
      log: () => {},
      configured: () => true,
      now: () => new Date("2026-11-14T20:00:00Z"),
      ...overrides,
    };
  }
  const req = (method: string, body?: unknown, path = "/api/workbench/house-rules") =>
    new Request(`https://repair.speedxrental.com${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const note = { action: "add", rule: { kind: "note", title: "当天", text: "Same day is usually fine." } };

  it("needs a signed-in staff member, and only the owner can change rules", async () => {
    expect((await handleHouseRules(req("GET"), deps(null))).status).toBe(401);
    const staff = deps("staff@x.com");
    expect(await (await handleHouseRules(req("GET"), staff)).json()).toEqual({ rules: [], canEdit: false, today: "2026-11-14" });
    expect((await handleHouseRules(req("POST", { changes: [note] }), staff)).status).toBe(403);
    expect((await handleHouseRulesChat(req("POST", { message: "hi" }), staff)).status).toBe(403);
    const owner = deps("owner@x.com");
    const saved = (await (await handleHouseRules(req("POST", { changes: [note] }), owner)).json()) as { rules: HouseRule[] };
    expect(saved.rules).toHaveLength(1);
    const left = (await (await handleHouseRules(req("DELETE", { id: saved.rules[0].id }), owner)).json()) as { rules: HouseRule[] };
    expect(left.rules).toEqual([]);
    expect((await handleHouseRules(req("POST", { changes: [{ action: "add", rule: { kind: "note", title: "x" } }] }), owner)).status).toBe(400);
  });

  it("returns the AI's proposal without applying it, or explains why it can't work", async () => {
    const ask = vi.fn<HouseRulesDeps["ask"] & {}>(async () => ({ text: "好的，十一月换胎减 $5。", proposal: { summary: "新增折扣", changes: [{ action: "add" as const, rule: { kind: "discount" as const, title: "换胎", amount: 5, appliesTo: "tire_change" as const, labelZh: "换胎优惠" } }] } }));
    const owner = deps("owner@x.com", { ask });
    const reply = (await (await handleHouseRulesChat(req("POST", { message: "这个月换胎减五块", history: [{ role: "assistant", text: "skip" }, { role: "user", text: "早" }, { role: "assistant", text: "早上好" }] }, "/api/workbench/house-rules/chat"), owner)).json()) as { proposal: unknown };
    expect(reply.proposal).toMatchObject({ summary: "新增折扣" });
    expect(ask.mock.calls[0][1]).toEqual([{ role: "user", text: "早" }, { role: "assistant", text: "早上好" }]);
    expect(await owner.saved.list(true)).toEqual([]);

    const bad = deps("owner@x.com", { ask: async () => ({ text: "好的。", proposal: { summary: "x", changes: [{ action: "add" as const, rule: { kind: "discount" as const, title: "x", percent: 10, amount: 5, labelZh: "x" } }] } }) });
    const refused = (await (await handleHouseRulesChat(req("POST", { message: "打折" }, "/api/workbench/house-rules/chat"), bad)).json()) as { text: string; proposal: unknown };
    expect(refused.proposal).toBeNull();
    expect(refused.text).toContain("二选一");
  });
});

describe("askRulesAssistant", () => {
  it("turns the AI's tool call into a proposal and gives it the current rules and today's date", async () => {
    const seen: string[] = [];
    const client = {
      beta: {
        messages: {
          create: async (params: unknown) => {
            seen.push(JSON.stringify(params));
            return {
              stop_reason: "tool_use",
              content: [
                {
                  type: "tool_use",
                  id: "t",
                  name: "propose_rule_changes",
                  input: {
                    summary: "删除旧规则，新增九折",
                    changes: [
                      { action: "delete", id: "R-1", kind: "note", title: "", text: "", applies_to: "all", service_keyword: "", percent: 0, amount: 0, discount_on: "total", label_en: "", label_zh: "", start_date: "", end_date: "", customer_phone: "" },
                      { action: "add", id: "", kind: "discount", title: "刹车九折", text: "", applies_to: "labor_jobs", service_keyword: "brake", percent: 10, amount: 0, discount_on: "total", label_en: "Brake offer", label_zh: "刹车优惠", start_date: "", end_date: "2026-11-30", customer_phone: "" },
                    ],
                  },
                },
              ],
            } as never;
          },
        },
      },
    };
    const reply = await askRulesAssistant(client, [rule({ id: "R-1", amount: 5 })], [], "刹车打九折到月底", "2026-11-14");
    expect(reply.text).toBe("删除旧规则，新增九折");
    expect(reply.proposal?.changes).toEqual([
      { action: "delete", id: "R-1" },
      { action: "add", rule: expect.objectContaining({ kind: "discount", serviceKeyword: "brake", percent: 10, endDate: "2026-11-30", appliesTo: "labor_jobs" }) },
    ]);
    expect(seen[0]).toContain("Today at the shop (Vancouver time): 2026-11-14");
    expect(seen[0]).toContain("R-1 [discount]");
  });
});

describe("HouseRulesPanel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the rules, asks the AI, and applies a proposal only when the owner confirms", async () => {
    const existing = rule({ id: "R-1", amount: 5, appliesTo: "tire_change", title: "换胎优惠", labelZh: "换胎减五", endDate: "2026-11-30" });
    const proposal = { summary: "删掉换胎优惠", changes: [{ action: "delete", id: "R-1" }] };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/chat")) return Response.json({ text: "好的，我把换胎优惠删掉。", proposal });
      if (init?.method === "POST") return Response.json({ rules: [], canEdit: true, today: "2026-11-14" });
      return Response.json({ rules: [existing], canEdit: true, today: "2026-11-14" });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<HouseRulesPanel onClose={() => {}} />);
    expect(await screen.findByText("换胎优惠")).toBeInTheDocument();
    expect(screen.getByText(/换胎（客人自带轮胎）总价减 \$5/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("对 AI 说"), "把换胎优惠删了");
    await userEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(await screen.findByTestId("rules-proposal")).toHaveTextContent("删除 换胎优惠");
    // Nothing is saved until the owner confirms.
    expect(fetchMock.mock.calls.filter(([url, init]) => url === "/api/workbench/house-rules" && init?.method === "POST")).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "确认生效" }));
    await waitFor(() => expect(screen.getByText("✓ 已生效")).toBeInTheDocument());
    const applied = fetchMock.mock.calls.find(([url, init]) => url === "/api/workbench/house-rules" && init?.method === "POST");
    expect(JSON.parse(String(applied?.[1]?.body))).toEqual({ changes: proposal.changes });
    expect(screen.queryByTestId("house-rule")).toBeNull();
  });

  it("is read-only for staff who aren't the owner", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ rules: [], canEdit: false, today: "2026-11-14" })));
    render(<HouseRulesPanel onClose={() => {}} />);
    expect(await screen.findByText("只有店主能改这些规则。")).toBeInTheDocument();
    expect(screen.queryByLabelText("对 AI 说")).toBeNull();
  });
});
