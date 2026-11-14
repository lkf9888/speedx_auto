/**
 * Where the owner's rules for the public assistant live: one JSON value in the
 * workbench's Cloudflare KV namespace. The public chat reads it through a
 * one-minute cache, so a change shows on the website within a minute (at once
 * on this server, which is the only one).
 */
import { randomBytes } from "node:crypto";
import { cleanRule, HouseRuleError, MAX_HOUSE_RULES, type HouseRule, type HouseRuleChange } from "@/lib/repair-chat/house-rules";
import { cloudflareKv, type KvClient } from "./kv";

export const HOUSE_RULES_KEY = "website-assistant-rules-v1";
const CACHE_MS = 60_000;

export class HouseRulesStore {
  private cache: { rules: HouseRule[]; at: number } | null = null;

  constructor(
    private readonly kv: KvClient,
    private readonly now: () => number = Date.now,
  ) {}

  private async read(): Promise<HouseRule[]> {
    let raw: string | null;
    try {
      raw = await this.kv.get(HOUSE_RULES_KEY);
    } catch (error) {
      throw new HouseRuleError((error as Error).message, "upstream");
    }
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as { rules?: HouseRule[] };
      return Array.isArray(parsed.rules) ? parsed.rules : [];
    } catch {
      return [];
    }
  }

  /** Every rule, running or not; read from KV at most once a minute unless `fresh`. */
  async list(fresh = false): Promise<HouseRule[]> {
    if (!fresh && this.cache && this.now() - this.cache.at < CACHE_MS) return this.cache.rules;
    const rules = await this.read();
    this.cache = { rules, at: this.now() };
    return rules;
  }

  /** Applies every change or none (each one checked first); returns the new list. */
  async apply(changes: HouseRuleChange[], email: string): Promise<HouseRule[]> {
    if (!Array.isArray(changes) || changes.length === 0) throw new HouseRuleError("没有要改的内容", "invalid");
    if (changes.length > 20) throw new HouseRuleError("一次最多改 20 条", "invalid");
    const rules = [...(await this.list(true))];
    const at = new Date(this.now()).toISOString();
    for (const change of changes) {
      const index = change.id ? rules.findIndex((r) => r.id === change.id) : -1;
      if (change.action === "add") {
        rules.push(cleanRule(change.rule, { email, at, id: `R-${randomBytes(3).toString("hex").toUpperCase()}` }));
      } else if (change.action === "update" || change.action === "delete") {
        if (index < 0) throw new HouseRuleError(`找不到规则 ${change.id ?? ""}，可能已经被删掉了`, "not_found");
        if (change.action === "delete") rules.splice(index, 1);
        else rules[index] = cleanRule(change.rule, { email, at, id: rules[index].id }, rules[index]);
      } else {
        throw new HouseRuleError("不认识的操作", "invalid");
      }
    }
    if (rules.length > MAX_HOUSE_RULES) throw new HouseRuleError(`规则最多 ${MAX_HOUSE_RULES} 条，请先删掉过期的`, "full");
    try {
      await this.kv.put(HOUSE_RULES_KEY, JSON.stringify({ rules }));
    } catch (error) {
      throw new HouseRuleError((error as Error).message, "upstream");
    }
    this.cache = { rules, at: this.now() };
    return rules;
  }

  /** Checks the changes against the current rules without saving (for the AI's proposal card). */
  async check(changes: HouseRuleChange[]): Promise<void> {
    const dry = new HouseRulesStore({ ...this.kv, put: async () => {} }, this.now);
    await dry.apply(changes, "check");
  }
}

let shared: HouseRulesStore | null | undefined;

/** The process-wide store, or null when KV isn't configured. */
export function getHouseRulesStore(): HouseRulesStore | null {
  if (shared === undefined) {
    const kv = cloudflareKv();
    shared = kv ? new HouseRulesStore(kv) : null;
  }
  return shared;
}

/** Who may change the rules: WEBSITE_RULES_ADMINS (comma-separated emails), or every signed-in staff member when unset. */
export function canEditHouseRules(email: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const admins = (env.WEBSITE_RULES_ADMINS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.length === 0 || admins.includes(email.trim().toLowerCase());
}
