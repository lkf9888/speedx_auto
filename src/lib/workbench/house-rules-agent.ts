/**
 * The AI the owner talks to in the workbench to change how the website's
 * estimate assistant behaves. It never changes anything itself: it proposes
 * rule changes on a card, and they take effect only when the owner confirms.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { fallbackOptions, type MessagesClient } from "@/lib/repair-chat/agent";
import { DISCOUNT_TARGETS, type HouseRule, type HouseRuleChange } from "@/lib/repair-chat/house-rules";
import { WORKBENCH_MODEL } from "./assistant";

export interface RulesTurn {
  role: "user" | "assistant";
  text: string;
}

export interface RulesProposal {
  summary: string;
  changes: HouseRuleChange[];
}

export interface RulesReply {
  text: string;
  proposal: RulesProposal | null;
}

const TOOL: Anthropic.Beta.BetaTool = {
  name: "propose_rule_changes",
  description:
    "Show the owner a card with rule changes for the website estimate assistant. Nothing changes until the owner presses confirm on the card. For update, give every field of the rule (copy the ones that stay the same).",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "One or two sentences in Chinese: what will change and from when." },
      changes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["add", "update", "delete"] },
            id: { type: "string", description: "The rule id for update or delete (e.g. R-1A2B3C); empty for add." },
            kind: { type: "string", enum: ["note", "discount"] },
            title: { type: "string", description: "Short Chinese name for the list, e.g. 11 月换胎优惠." },
            text: { type: "string", description: "note: the instruction for the website assistant, in English, clear and specific. discount: an optional remark for staff, or empty." },
            applies_to: { type: "string", enum: [...DISCOUNT_TARGETS], description: "discount: which estimates. all; labor_jobs (labor-guide repairs); oil_change; tire_change (mounting the customer's tires); ac_recharge; new_tires. note: all." },
            service_keyword: { type: "string", description: "discount: only services whose English name contains this, e.g. brake; empty for any." },
            percent: { type: "number", description: "discount: percent off (e.g. 10); 0 when the discount is a dollar amount." },
            amount: { type: "number", description: "discount: dollars off per estimate (e.g. 20); 0 when it's a percentage." },
            discount_on: { type: "string", enum: ["labor", "total"], description: "discount: labor (labor-guide jobs only: off the labor part) or total." },
            label_en: { type: "string", description: "discount: what the customer's card calls it in English, e.g. November tire change offer; empty for a note." },
            label_zh: { type: "string", description: "discount: the same in Simplified Chinese; empty for a note." },
            start_date: { type: "string", description: "YYYY-MM-DD shop date it starts, or empty for now." },
            end_date: { type: "string", description: "YYYY-MM-DD last shop date it applies (inclusive), or empty for no end." },
            customer_phone: { type: "string", description: "Only for a rule for one customer: their phone number. Empty for everyone." },
          },
          required: ["action", "id", "kind", "title", "text", "applies_to", "service_keyword", "percent", "amount", "discount_on", "label_en", "label_zh", "start_date", "end_date", "customer_phone"],
          additionalProperties: false,
        },
      },
    },
    required: ["summary", "changes"],
    additionalProperties: false,
  },
};

const SYSTEM = `You help the owner of SPEEDX AUTO (an auto repair shop in Richmond, BC) adjust the estimate assistant on the shop's website: the AI that talks to customers on the repair page, prices jobs from the labor guide and parts catalog, and shows estimate cards. The owner talks to you in Chinese, in plain language. Reply in Simplified Chinese, short and clear.

You can't change anything yourself. When the owner wants something changed, call propose_rule_changes once with all the changes; the owner sees a card and presses confirm. Then tell them in one or two sentences what the card will do. If what they want is unclear (which service, how much, from when to when, which customer), ask first instead of guessing. For a question about the current rules, just answer.

There are two kinds of rules:
- note: an instruction the website assistant follows in every conversation (or for one customer), for wording and special handling, e.g. "If the customer mentions they are an Uber driver, say the shop sees many rideshare cars and can usually do same-day brake work." Write the note in English as a clear instruction to the assistant. A note can't set or change a price: the assistant only repeats prices from its tools.
- discount: money off matching estimate cards, worked out in code so the card and the reply match. Percent or dollar amount (one of the two), off the labor part (labor-guide repairs only) or the whole estimate, for all estimates, labor-guide repairs, oil changes, tire changes (mounting the customer's tires), A/C recharges or new tires, optionally only services whose English name contains a keyword (e.g. "brake", "alternator"). To set a lower price for a flat-price service, use a dollar amount off: oil change for a car is $95 (premium oil $120); if the owner wants $79, that's $16 off — say which option it applies to, since a fixed amount comes off whichever option the customer picks. Discounts don't stack: a card gets the largest one that matches.

Both kinds can run between dates (shop dates, inclusive; work out real dates from today) and can be for one customer only: put their phone number in customer_phone and nowhere else (never in the title, note, or labels). The phone number is matched in code and never shown to the website AI. A customer-only rule applies once that customer has given their phone number in the chat.

These fixed rules can't be changed by any rule, and you should say so if asked: prices and totals only from the tools; never tell customers the hourly labor rate; never say where parts or tires come from or show cost prices; never ask the AI to collect or repeat contact details; safety warnings first; the shop doesn't do transmission repair, auto glass, wheel alignments, or exhaust and muffler repair. Changing those, or the posted prices themselves, needs a code change: tell the owner to ask the estimate-assistant session.

Keep the list tidy: when a new rule replaces an old one, update or delete the old one in the same proposal. Mention when a rule has already ended (end date before today).`;

function rulesForPrompt(rules: readonly HouseRule[], today: string): string {
  if (rules.length === 0) return "There are no rules yet.";
  return rules
    .map((r) => {
      const when = r.startDate || r.endDate ? ` dates ${r.startDate || "now"}→${r.endDate || "no end"}` : "";
      const who = r.customerPhone ? ` customer_phone ${r.customerPhone}` : "";
      const ended = r.endDate && r.endDate < today ? " (ended)" : "";
      const money =
        r.kind === "discount"
          ? ` ${r.percent ? `${r.percent}%` : `$${r.amount}`} off ${r.on} for ${r.appliesTo}${r.serviceKeyword ? ` matching "${r.serviceKeyword}"` : ""}, label "${r.labelEn}" / "${r.labelZh}"`
          : "";
      return `- ${r.id} [${r.kind}] ${r.title}${money}${r.text ? ` text: ${r.text}` : ""}${when}${who}${ended}`;
    })
    .join("\n");
}

type ToolChange = {
  action: "add" | "update" | "delete";
  id: string;
  kind: "note" | "discount";
  title: string;
  text: string;
  applies_to: string;
  service_keyword: string;
  percent: number;
  amount: number;
  discount_on: "labor" | "total";
  label_en: string;
  label_zh: string;
  start_date: string;
  end_date: string;
  customer_phone: string;
};

export function toChange(c: ToolChange): HouseRuleChange {
  if (c.action === "delete") return { action: "delete", id: c.id };
  return {
    action: c.action,
    ...(c.action === "update" ? { id: c.id } : {}),
    rule: {
      kind: c.kind,
      title: c.title,
      text: c.text,
      appliesTo: c.applies_to as HouseRule["appliesTo"],
      serviceKeyword: c.service_keyword,
      percent: c.percent,
      amount: c.amount,
      on: c.discount_on,
      labelEn: c.label_en,
      labelZh: c.label_zh,
      startDate: c.start_date,
      endDate: c.end_date,
      customerPhone: c.customer_phone,
    },
  };
}

export async function askRulesAssistant(
  client: MessagesClient,
  rules: readonly HouseRule[],
  history: RulesTurn[],
  message: string,
  today: string,
): Promise<RulesReply> {
  const response = await client.beta.messages.create({
    model: WORKBENCH_MODEL,
    max_tokens: 4000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    tools: [TOOL],
    messages: [
      ...history.map((turn) => ({ role: turn.role, content: turn.text })),
      { role: "user", content: message },
      { role: "system", content: `Today at the shop (Vancouver time): ${today}.\nCurrent rules:\n${rulesForPrompt(rules, today)}` },
    ],
    output_config: { effort: "medium" },
    ...fallbackOptions(WORKBENCH_MODEL),
  });
  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  const use = response.content.find(
    (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use" && block.name === TOOL.name,
  );
  if (!use) return { text: text || "（没有回复，请换个说法再试一次）", proposal: null };
  const input = use.input as { summary?: string; changes?: ToolChange[] };
  const changes = (input.changes ?? []).map(toChange);
  const summary = String(input.summary ?? "").trim();
  return { text: text || summary || "请看下面的卡片。", proposal: changes.length ? { summary, changes } : null };
}
