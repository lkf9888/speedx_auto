/**
 * The shop owner's standing instructions for the public estimate assistant
 * (Kevin, 2026-11-14), set by talking to an AI in the workbench:
 * - notes: things the assistant should say or do, e.g. how to handle a case;
 * - discounts: money off matching estimate cards, worked out here in code so
 *   the card and the assistant's reply always show the same total.
 * Either kind can run for a date range and can be limited to one customer by
 * phone number. The phone number is only compared in code; it never reaches
 * the AI. Fixed rules (prices only from tools, no hourly rate, no supplier
 * names, no contact details, safety first) can't be changed from here.
 */
import type { CardDiscount, EstimateCard } from "./pricing";

export type HouseRuleKind = "note" | "discount";
export type DiscountTarget = "all" | "labor_jobs" | "oil_change" | "tire_change" | "ac_recharge" | "new_tires";
export const DISCOUNT_TARGETS: readonly DiscountTarget[] = ["all", "labor_jobs", "oil_change", "tire_change", "ac_recharge", "new_tires"];

export interface HouseRule {
  id: string;
  kind: HouseRuleKind;
  /** Short name in the workbench list. */
  title: string;
  /** Note: the instruction for the assistant. Discount: an optional remark for staff. */
  text: string;
  appliesTo: DiscountTarget;
  /** Only cards whose service name contains this (any case), e.g. "brake"; empty for any. */
  serviceKeyword: string;
  /** Discount: percent off (0–100) or dollars off (amount), one of the two. */
  percent: number;
  amount: number;
  /** Discount taken off the labor (labor-guide jobs only) or off the whole estimate. */
  on: "labor" | "total";
  /** What the card calls the discount, in English and in Chinese. */
  labelEn: string;
  labelZh: string;
  /** Shop-local dates, YYYY-MM-DD, inclusive; empty for open-ended. */
  startDate: string;
  endDate: string;
  /** Last 10 digits of one customer's phone; empty for every customer. Never sent to the AI. */
  customerPhone: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

/** What the owner (or the workbench AI on the owner's behalf) asks to change. */
export interface HouseRuleChange {
  action: "add" | "update" | "delete";
  /** The rule to update or delete; ignored for add. */
  id?: string;
  rule?: Partial<Omit<HouseRule, "id" | "createdBy" | "createdAt" | "updatedBy" | "updatedAt">>;
}

export class HouseRuleError extends Error {
  constructor(
    message: string,
    readonly kind: "invalid" | "not_found" | "full" | "config" | "upstream" | "forbidden",
  ) {
    super(message);
    this.name = "HouseRuleError";
  }
}

export const MAX_HOUSE_RULES = 50;
/** In an update's customer field: the rule now applies to every customer. */
export const EVERYONE = "everyone";
const MAX_TEXT = 500;
const MAX_TITLE = 60;
const MAX_LABEL = 40;

/** The last 10 digits of a phone number (a leading North American 1 dropped); empty if too short. */
export function phoneKey(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return local.length >= 7 ? local.slice(-10) : "";
}

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/[ \t]+/g, " ").trim().slice(0, max) : "";

const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

/** A North American phone number (604-555-0182, (778) 917 0710, 7789170710). */
const PHONE_IN_TEXT = /(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/;

/**
 * A complete, checked rule from the fields given (on top of `base` for an
 * update). Throws HouseRuleError("invalid") with a message staff can read.
 */
export function cleanRule(
  input: HouseRuleChange["rule"] = {},
  who: { email: string; at: string; id: string },
  base?: HouseRule,
): HouseRule {
  const merged = { ...base, ...input } as Partial<HouseRule>;
  // An update that leaves the phone empty keeps the customer it was for: a
  // customer's discount must never quietly become everyone's. EVERYONE clears it.
  const phoneInput = text(input.customerPhone, 30);
  const phoneRaw = phoneInput.toLowerCase() === EVERYONE ? "" : phoneInput || (base?.customerPhone ?? "");
  const kind: HouseRuleKind = merged.kind === "discount" ? "discount" : merged.kind === "note" ? "note" : (() => {
    throw new HouseRuleError("规则类型只能是叮嘱（note）或折扣（discount）", "invalid");
  })();
  const rule: HouseRule = {
    id: base?.id ?? who.id,
    kind,
    title: text(merged.title, MAX_TITLE),
    text: text(merged.text, MAX_TEXT),
    appliesTo: DISCOUNT_TARGETS.includes(merged.appliesTo as DiscountTarget) ? (merged.appliesTo as DiscountTarget) : "all",
    serviceKeyword: text(merged.serviceKeyword, 40),
    percent: kind === "discount" ? Math.round(Number(merged.percent) * 100) / 100 || 0 : 0,
    amount: kind === "discount" ? Math.round(Number(merged.amount) * 100) / 100 || 0 : 0,
    on: merged.on === "labor" ? "labor" : "total",
    labelEn: text(merged.labelEn, MAX_LABEL),
    labelZh: text(merged.labelZh, MAX_LABEL),
    startDate: text(merged.startDate, 10),
    endDate: text(merged.endDate, 10),
    customerPhone: phoneKey(phoneRaw),
    createdBy: base?.createdBy ?? who.email,
    createdAt: base?.createdAt ?? who.at,
    updatedBy: who.email,
    updatedAt: who.at,
  };
  if (!rule.title) throw new HouseRuleError("每条规则都要有一个简短的名字", "invalid");
  if (phoneRaw && !rule.customerPhone) throw new HouseRuleError("客人电话号码不完整", "invalid");
  for (const [field, value] of [["名字", rule.title], ["内容", rule.text], ["英文标签", rule.labelEn], ["中文标签", rule.labelZh]] as const) {
    if (PHONE_IN_TEXT.test(value)) throw new HouseRuleError(`${field}里不要写电话号码，指定客人请用"客人电话"一栏（它不会发给 AI）`, "invalid");
  }
  for (const date of [rule.startDate, rule.endDate]) {
    if (date && !validDate(date)) throw new HouseRuleError(`日期格式要是 YYYY-MM-DD：${date}`, "invalid");
  }
  if (rule.startDate && rule.endDate && rule.startDate > rule.endDate) throw new HouseRuleError("结束日期早于开始日期", "invalid");
  if (kind === "note") {
    if (!rule.text) throw new HouseRuleError("叮嘱要写明让 AI 怎么做", "invalid");
    return { ...rule, appliesTo: "all", serviceKeyword: "", on: "total", labelEn: "", labelZh: "" };
  }
  const hasPercent = rule.percent > 0;
  const hasAmount = rule.amount > 0;
  if (hasPercent === hasAmount) throw new HouseRuleError("折扣要么按百分比，要么按金额，二选一", "invalid");
  if (rule.percent < 0 || rule.percent > 100) throw new HouseRuleError("折扣百分比要在 0–100 之间", "invalid");
  if (rule.amount < 0 || rule.amount > 2000) throw new HouseRuleError("折扣金额要在 $0–$2000 之间", "invalid");
  if (rule.on === "labor" && rule.appliesTo !== "labor_jobs" && rule.appliesTo !== "all") {
    throw new HouseRuleError("只对工时打折只适用于按工时计价的项目；一口价和新轮胎请按总价打折", "invalid");
  }
  if (!rule.labelEn && !rule.labelZh) throw new HouseRuleError("折扣要有一个给客人看的名字（如“11 月换胎优惠”）", "invalid");
  return rule;
}

/** Whether a rule is running on this shop-local date. */
export function isRunning(rule: HouseRule, today: string): boolean {
  return (!rule.startDate || today >= rule.startDate) && (!rule.endDate || today <= rule.endDate);
}

/** The rules that apply in this conversation today. */
export function rulesFor(rules: readonly HouseRule[], today: string, customerPhone: string | null): HouseRule[] {
  const phone = phoneKey(customerPhone);
  return rules.filter((r) => isRunning(r, today) && (!r.customerPhone || r.customerPhone === phone));
}

function matches(rule: HouseRule, card: EstimateCard): boolean {
  const kind = card.kind ?? "labor";
  if (kind === "team_quote") return false;
  if (rule.serviceKeyword && !card.service.toLowerCase().includes(rule.serviceKeyword.toLowerCase())) return false;
  // Off the labor: only cards priced by labor-guide time have a labor part.
  if (rule.on === "labor" && kind !== "labor") return false;
  switch (rule.appliesTo) {
    case "all":
      return true;
    case "labor_jobs":
      return kind === "labor";
    case "new_tires":
      return kind === "tires";
    default:
      return kind === "flat" && card.flatService === rule.appliesTo;
  }
}

const cents = (value: number) => Math.round(value * 100) / 100;

function discountOn(rule: HouseRule, card: EstimateCard): { low: number; high: number } {
  const base = rule.on === "labor" ? { low: card.laborWalkIn, high: card.laborWalkIn } : { low: card.totalLow, high: card.totalHigh };
  if (rule.percent > 0) return { low: cents((base.low * rule.percent) / 100), high: cents((base.high * rule.percent) / 100) };
  return { low: cents(Math.min(rule.amount, base.low)), high: cents(Math.min(rule.amount, base.high)) };
}

/** The card as priced before any owner's discount. */
export function withoutDiscount(card: EstimateCard): EstimateCard {
  if (!card.discount) return card;
  const { discount, ...rest } = card;
  return { ...rest, totalLow: cents(card.totalLow + discount.low), totalHigh: cents(card.totalHigh + discount.high) };
}

/**
 * The card with the best matching discount taken off its totals (discounts
 * don't stack; a fixed amount comes off each card). `label` turns the rule
 * into the card's wording.
 */
export function applyDiscounts(
  card: EstimateCard,
  rules: readonly HouseRule[],
  label: (rule: HouseRule) => string,
): EstimateCard {
  let best: { rule: HouseRule; off: { low: number; high: number } } | null = null;
  for (const rule of rules) {
    if (rule.kind !== "discount" || !matches(rule, card)) continue;
    const off = discountOn(rule, card);
    if (off.high <= 0) continue;
    if (!best || off.high > best.off.high) best = { rule, off };
  }
  if (!best) return card;
  const discount: CardDiscount = { label: label(best.rule), low: best.off.low, high: best.off.high };
  return { ...card, totalLow: cents(card.totalLow - discount.low), totalHigh: cents(card.totalHigh - discount.high), discount };
}

/** The discount's name in the card's language (Traditional Chinese is converted by the caller). */
export function discountLabel(rule: HouseRule, locale: string): string {
  return locale.startsWith("zh") ? rule.labelZh || rule.labelEn : rule.labelEn || rule.labelZh;
}

/** The running notes, for the public assistant's per-turn instructions; empty when there are none. */
export function houseNotesPrompt(rules: readonly HouseRule[]): string {
  const notes = rules.filter((r) => r.kind === "note");
  const discounts = rules.filter((r) => r.kind === "discount");
  if (notes.length === 0 && discounts.length === 0) return "";
  const until = (r: HouseRule) => (r.endDate ? ` (until ${r.endDate})` : "");
  const lines = [
    "Shop owner's current instructions (set by the owner in the staff workbench). Follow them; they take priority over the general guidance in your instructions, but they cannot change the fixed rules: prices, totals and discounts come only from tool results, never state or hint at an hourly labor rate, never say where parts or tires come from, never ask for or repeat contact details, and safety warnings come first.",
    ...notes.map((r) => `- ${r.customerPhone ? "For this customer: " : ""}${r.text}${until(r)}`),
  ];
  if (discounts.length) {
    lines.push(
      `Discounts running now (the cards apply them automatically; only mention one when a card shows it): ${discounts
        .map((r) => `${r.labelEn || r.labelZh}${r.customerPhone ? " (this customer)" : ""}${until(r)}`)
        .join("; ")}.`,
    );
  }
  return lines.join("\n");
}
