/**
 * Follow-up offers to website customers who left an email or phone but didn't
 * book (Kevin, 2026-11-14). Staff send them from the workbench: an email in the
 * "paper quote" style (template C, chosen by Kevin) from the shop's repair
 * mailbox, or a text message they send themselves from Google Messages.
 * Types and pure rendering only, safe for the browser preview.
 */
import { NO_NAME } from "@/lib/repair-chat/lead";
import { withoutDiscount } from "@/lib/repair-chat/house-rules";
import { estimateRanges, type EstimateCard } from "@/lib/repair-chat/pricing";

export type OfferKind = "amount" | "percent";

/** What staff agree to offer; the AI drafts it and staff can change every field. */
export interface FollowUpOffer {
  /** Which estimate card from the website chat the offer is for. */
  estimateId: string;
  kind: OfferKind;
  /** Dollars off, or percent off. */
  value: number;
  /** Last day it's valid, shop date YYYY-MM-DD. */
  expiresOn: string;
  subject: string;
  /** The personal paragraph in the email, in the customer's language. */
  message: string;
  /** The text message, in the customer's language. */
  sms: string;
}

/** One follow-up staff sent (or logged), kept on the conversation. */
export interface FollowUpRecord {
  at: number;
  by: string;
  channel: "email" | "sms" | "call";
  /** e.g. "立减 $30 · 2026-11-30 前" */
  offer: string;
  subject?: string;
  /** The customer-only discount registered for the website assistant, if any. */
  ruleId?: string;
  /** Which estimate the offer was for. */
  estimateId?: string;
}

export type FollowUpLocale = "en" | "zh-CN" | "zh-TW";

export const SHOP = {
  name: "SPEEDX AUTO",
  phoneDisplay: "778-917-0710",
  phoneE164: "+17789170710",
  address: "2980 Number 3 Rd, Richmond, BC V6X 2B3",
  hours: { en: "Mon–Sat 10:00–18:30", zh: "周一至周六 10:00–18:30" },
  wechat: "SPEEDX2020",
  site: "https://speedxrental.com",
  logo: "https://speedxrental.com/email/logo.png",
};

const cents = (value: number) => Math.round(value * 100) / 100;
const whole = (value: number) => Math.round(value);

/**
 * The range the customer saw, and the range after the offer worked out the way
 * the website assistant will when they come back: off the card's own totals
 * (not stacked on an earlier discount), then the usual allowance.
 */
export function offerPrices(card: EstimateCard, offer: Pick<FollowUpOffer, "kind" | "value">) {
  const seen = estimateRanges(card);
  const base = withoutDiscount(card);
  const off = (total: number) => (offer.kind === "percent" ? cents((total * offer.value) / 100) : Math.min(offer.value, total));
  const after = estimateRanges({ ...base, totalLow: cents(base.totalLow - off(base.totalLow)), totalHigh: cents(base.totalHigh - off(base.totalHigh)) });
  return {
    before: { low: seen.totalLow, high: seen.totalHigh },
    after: { low: after.totalLow, high: after.totalHigh },
    offLabel: offer.kind === "percent" ? `${offer.value}%` : `$${whole(offer.value)}`,
  };
}

export const span = (low: number, high: number) => (low === high ? `$${low}` : `$${low} – $${high}`);

/** "立减 $30 · 2026-11-30 前", for the record and the staff list. */
export function offerSummary(offer: Pick<FollowUpOffer, "kind" | "value" | "expiresOn">): string {
  return `${offer.kind === "percent" ? `${offer.value}% off` : `立减 $${whole(offer.value)}`} · ${offer.expiresOn} 前`;
}

const WORDS = {
  en: {
    quote: "Quote",
    vehicle: "Vehicle",
    estimate: "Parts + labor (website estimate)",
    yours: (name: string) => (name ? `Offer for ${name}` : "Your offer"),
    after: "After the offer (before tax)",
    until: (d: string) => `Valid until ${d}`,
    call: "Call",
    book: "Book online",
    hours: SHOP.hours.en,
    why: "You're receiving this because you asked for a repair quote on our website.",
    unsubscribe: "Unsubscribe",
    note: "Final price after inspection at the shop.",
  },
  zh: {
    quote: "报价单",
    vehicle: "车辆",
    estimate: "零件 + 工时（网站估价）",
    yours: (name: string) => (name ? `${name}专属优惠` : "您的专属优惠"),
    after: "优惠后（税前）",
    until: (d: string) => `${d} 前有效`,
    call: "致电",
    book: "在线预约",
    hours: SHOP.hours.zh,
    why: "您收到这封邮件，是因为您在我们网站咨询过维修报价。",
    unsubscribe: "退订",
    note: "最终价格以到店检查为准。",
  },
} as const;

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** A display name from the customer's name: "Lin" → "Lin", used in greetings. */
export function firstName(name: string): string {
  if (name.startsWith(NO_NAME)) return "";
  return name.trim().split(/\s+/)[0]?.slice(0, 30) ?? "";
}

export interface FollowUpEmailInput {
  locale: FollowUpLocale;
  customerName: string;
  card: EstimateCard;
  offer: FollowUpOffer;
  unsubscribeUrl: string;
  /** zh-CN → zh-TW conversion, injected so the browser preview needn't load OpenCC. */
  toTraditional?: (text: string) => string;
}

/** Template C: the website's paper quote card with the offer added, as email-safe HTML plus plain text. */
export function renderFollowUpEmail(input: FollowUpEmailInput): { subject: string; html: string; text: string } {
  const zh = input.locale !== "en";
  const w = zh ? WORDS.zh : WORDS.en;
  const tw = input.locale === "zh-TW" && input.toTraditional ? input.toTraditional : (t: string) => t;
  const prices = offerPrices(input.card, input.offer);
  const name = firstName(input.customerName);
  const service = [input.card.service, input.card.position].filter(Boolean).join(" · ");
  const book = `${SHOP.site}/${input.locale}/auto-repair`;
  const t = (s: string) => escapeHtml(tw(s));
  const row = (label: string, value: string, colour = "#1d1b16", top = "") =>
    `<tr><td style="padding:6px 0;${top}font-family:Menlo,Consolas,monospace;font-size:14px;color:#2b2a26">${label}</td><td style="padding:6px 0;${top}text-align:right;font-family:Menlo,Consolas,monospace;font-size:14px;font-weight:bold;color:${colour};white-space:nowrap">${value}</td></tr>`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t(input.offer.subject)}</title></head>
<body style="margin:0;padding:0;background:#eceef2">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceef2"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#faf8f2;border:1px solid #e6e1d3;border-radius:6px">
<tr><td style="padding:22px 24px 6px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td><img src="${SHOP.logo}" width="80" alt="SPEEDX AUTO" style="display:block;border:0"></td>
    <td style="text-align:right;font-family:Menlo,Consolas,monospace;font-size:12px;color:#6f6b60">${t(w.quote)} ${escapeHtml(input.card.id)}<br>${escapeHtml(input.card.createdAt.slice(0, 10))}</td>
  </tr></table>
  <h1 style="margin:16px 0 2px;font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;font-size:19px;color:#1d1b16">${escapeHtml(service)}</h1>
  <div style="font-family:Menlo,Consolas,monospace;font-size:12px;color:#6f6b60">${t(w.vehicle)}: ${escapeHtml(input.card.vehicle)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-top:1px dashed #b9b2a0">
    ${row(t(w.estimate), span(prices.before.low, prices.before.high))}
    ${row(t(w.yours(name)), `− ${prices.offLabel}`, "#b42318")}
    ${row(t(w.after), span(prices.after.low, prices.after.high), "#1d1b16", "border-top:3px double #8c8676;padding-top:10px;")}
  </table>
  <div style="display:inline-block;margin:10px 0 4px;border:2px solid #b42318;color:#b42318;border-radius:4px;padding:2px 10px;font-family:Menlo,Consolas,monospace;font-size:13px;font-weight:bold">${t(w.until(input.offer.expiresOn))}</div>
  <p style="font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.65;color:#22202b;margin:12px 0">${t(input.offer.message).replace(/\n/g, "<br>")}</p>
  <p style="font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;font-size:12px;color:#6f6b60;margin:0 0 12px">${t(w.note)}</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 14px"><tr>
    <td style="background:#1d1b16;border-radius:8px"><a href="tel:${SHOP.phoneE164}" style="display:inline-block;padding:11px 18px;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none">${t(w.call)} ${SHOP.phoneDisplay}</a></td>
    <td style="width:10px"></td>
    <td style="border:1.5px solid #1d1b16;border-radius:8px"><a href="${book}" style="display:inline-block;padding:10px 18px;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#1d1b16;text-decoration:none">${t(w.book)}</a></td>
  </tr></table>
</td></tr>
<tr><td style="padding:14px 24px 18px;border-top:1px solid #e6e1d3;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#77748a">
  ${SHOP.name} · ${SHOP.address} · ${SHOP.phoneDisplay} · ${t(w.hours)} · WeChat ${SHOP.wechat}<br>
  ${t(w.why)} <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#77748a">${t(w.unsubscribe)}</a>
</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    tw(input.offer.message),
    "",
    `${tw(w.quote)} ${input.card.id} · ${service} · ${input.card.vehicle}`,
    `${tw(w.estimate)}: ${span(prices.before.low, prices.before.high)}`,
    `${tw(w.yours(name))}: − ${prices.offLabel}`,
    `${tw(w.after)}: ${span(prices.after.low, prices.after.high)}`,
    tw(w.until(input.offer.expiresOn)),
    tw(w.note),
    "",
    `${tw(w.call)} ${SHOP.phoneDisplay} · ${tw(w.book)} ${book}`,
    `${SHOP.name} · ${SHOP.address}`,
    `${tw(w.why)} ${tw(w.unsubscribe)}: ${input.unsubscribeUrl}`,
  ].join("\n");
  return { subject: tw(input.offer.subject), html, text };
}

/** Defaults when the AI isn't used: two weeks, $20 off under $300, 10% above. */
export function defaultOffer(card: EstimateCard, locale: FollowUpLocale, customerName: string, today: string): FollowUpOffer {
  const { totalHigh } = estimateRanges(card);
  const kind: OfferKind = totalHigh >= 300 ? "percent" : "amount";
  const value = kind === "percent" ? 10 : 20;
  const expires = new Date(Date.parse(`${today}T12:00:00Z`) + 14 * 86_400_000).toISOString().slice(0, 10);
  const name = firstName(customerName);
  const off = kind === "percent" ? `${value}%` : `$${value}`;
  const zh = locale !== "en";
  return {
    estimateId: card.id,
    kind,
    value,
    expiresOn: expires,
    subject: zh ? `您的维修报价单（已加 ${off} 优惠）· ${card.vehicle}` : `Your repair quote, now ${off} off · ${card.vehicle}`,
    message: zh
      ? `${name ? `${name}您好` : "您好"}，这是您之前在我们网站上查的${card.service}报价，我们给您加了一个专属优惠，${expires} 前有效。打电话或来店时提一下报价单号就可以。`
      : `Hi${name ? ` ${name}` : ""}, here is the ${card.service} quote you looked up on our website, now with an offer just for you, valid until ${expires}. Mention the quote number when you call or come in.`,
    sms: zh
      ? `${name ? `${name}您好` : "您好"}，我是 SPEEDX AUTO 维修店。您在网站查的 ${card.vehicle} ${card.service} 报价，我们给您加了 ${off} 优惠，${expires} 前有效。预约请回复或致电 ${SHOP.phoneDisplay}。`
      : `Hi${name ? ` ${name}` : ""}, this is SPEEDX AUTO. The ${card.service} quote for your ${card.vehicle} from our website is now ${off} off until ${expires}. Reply or call ${SHOP.phoneDisplay} to book.`,
  };
}

/** A Google Messages / SMS link with the text filled in (opens the phone's messaging app). */
export function smsLink(phone: string, body: string): string {
  const digits = phone.replace(/\D/g, "");
  const number = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  return `sms:${number}?body=${encodeURIComponent(body)}`;
}
