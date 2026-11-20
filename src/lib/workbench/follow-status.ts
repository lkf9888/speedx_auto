/**
 * Follow-up status of a website customer (Kevin, 2026-11-20): who called back, who came to the shop, who bought.
 * Staff only: never in the customer chat, a share link, the PDF or the customer text, and never sent to the AI.
 * Pure types and arithmetic, safe for the browser.
 */
import type { ConversationSummary } from "./conversation-types";

export const FOLLOW_STATES = ["new", "contacted", "booked", "arrived", "won", "lost"] as const;
export type FollowState = (typeof FOLLOW_STATES)[number];

export const FOLLOW_LABEL: Record<FollowState, string> = {
  new: "未跟进",
  contacted: "已联系",
  booked: "已约时间",
  arrived: "已到店",
  won: "已成交",
  lost: "没成",
};

/** Why a customer didn't go ahead. "测试单" marks our own test chats: they are left out of the counts. */
export const LOST_REASONS = ["价格太高", "没接电话", "选了别家", "不在本地", "不需要了", "测试单", "其他"] as const;
export const TEST_REASON = "测试单";

/** The stage reached in the funnel (contacted, booked, arrived, won); a "lost" customer keeps the stage they got to. */
export const STAGE: Partial<Record<FollowState, number>> = { contacted: 1, booked: 2, arrived: 3, won: 4 };

/** One change of status: who made it and when. */
export interface FollowStatus {
  state: FollowState;
  /** Why it didn't work out ("lost" only). */
  reason?: string;
  /** What the customer paid before tax, in dollars ("won" only, optional). */
  amount?: number;
  by: string;
  at: number;
}

export const MAX_FOLLOW_LOG = 50;
export const OVERDUE_MS = 24 * 60 * 60 * 1000;

export interface FollowInput {
  state: FollowState;
  reason?: string;
  amount?: number;
}

const isState = (value: unknown): value is FollowState => typeof value === "string" && (FOLLOW_STATES as readonly string[]).includes(value);

/** A status change from anywhere (a request body), cleaned up; null when it isn't one. */
export function parseFollowInput(raw: unknown): FollowInput | null {
  if (!raw || typeof raw !== "object") return null;
  const { state, reason, amount } = raw as Record<string, unknown>;
  if (!isState(state)) return null;
  const out: FollowInput = { state };
  if (state === "lost" && typeof reason === "string") {
    const text = reason.replace(/\s+/g, " ").trim().slice(0, 40);
    if (text) out.reason = text;
  }
  if (state === "won" && amount !== undefined && amount !== null && amount !== "") {
    const value = typeof amount === "number" ? amount : Number(amount);
    if (!Number.isFinite(value) || value < 0 || value > 1_000_000) return null;
    out.amount = Math.round(value * 100) / 100;
  }
  return out;
}

/** The highest funnel stage a customer reached, from every status they have had. */
export function stageOf(history: ReadonlyArray<Pick<FollowStatus, "state">>): number {
  return history.reduce((best, h) => Math.max(best, STAGE[h.state] ?? 0), 0);
}

/** When a website customer left their contact details (or, for older chats, the best guess), or undefined when they never did. */
export function leftContactAt(visitor: { phone: string; email?: string; wechat?: string; leftContactAt?: number; consentAt?: number; callbackAt?: number } | undefined, createdAt: number): number | undefined {
  if (!visitor) return undefined;
  const has = Boolean(visitor.phone || visitor.email || visitor.wechat);
  if (!has) return undefined;
  return visitor.leftContactAt ?? visitor.consentAt ?? visitor.callbackAt ?? createdAt;
}

/** Left contact details more than a day ago and still marked 未跟进. */
export function isOverdue(c: Pick<ConversationSummary, "follow" | "contactAt" | "archived">, now: number): boolean {
  return !c.archived && c.contactAt !== undefined && (c.follow ?? "new") === "new" && now - c.contactAt > OVERDUE_MS;
}

export interface FollowStats {
  consultations: number;
  leftContact: number;
  contacted: number;
  booked: number;
  arrived: number;
  won: number;
  wonAmount: number;
  /** Won chats with no amount filled in. */
  wonNoAmount: number;
  lost: number;
  /** Our own test chats, left out of everything above. */
  tests: number;
}

/** Website chats started in the period, counted by how far they got. Funnel counts include later stages. */
export function followStats(list: ReadonlyArray<ConversationSummary>, from: number | null, to: number): FollowStats {
  const stats: FollowStats = { consultations: 0, leftContact: 0, contacted: 0, booked: 0, arrived: 0, won: 0, wonAmount: 0, wonNoAmount: 0, lost: 0, tests: 0 };
  for (const c of list) {
    if (c.website === undefined) continue;
    const at = c.createdAt ?? c.updatedAt;
    if ((from !== null && at < from) || at > to) continue;
    if (c.follow === "lost" && c.followReason === TEST_REASON) {
      stats.tests += 1;
      continue;
    }
    stats.consultations += 1;
    if (c.contactAt !== undefined) stats.leftContact += 1;
    const stage = c.stage ?? STAGE[c.follow ?? "new"] ?? 0;
    if (stage >= 1) stats.contacted += 1;
    if (stage >= 2) stats.booked += 1;
    if (stage >= 3) stats.arrived += 1;
    if (c.follow === "won") {
      stats.won += 1;
      if (typeof c.followAmount === "number") stats.wonAmount += c.followAmount;
      else stats.wonNoAmount += 1;
    }
    if (c.follow === "lost") stats.lost += 1;
  }
  stats.wonAmount = Math.round(stats.wonAmount * 100) / 100;
  return stats;
}
