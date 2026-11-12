"use client";

import { estimateRanges, type EstimateCard } from "@/lib/repair-chat/pricing";
import type { WebsiteVisitor } from "@/lib/workbench/conversation-types";

const LANGUAGE: Record<string, string> = { en: "英文", "zh-CN": "简体中文", "zh-TW": "繁体中文" };

const range = (low: number, high: number) => (low === high ? `$${low}` : `$${low} – $${high}`);

/** Who the website customer is and how to reach them; staff follow up by phone or WhatsApp. */
export function WebsiteVisitorBar({ visitor }: { visitor: WebsiteVisitor }) {
  const digits = visitor.phone.replace(/\D/g, "");
  const whatsapp = digits.length === 10 ? `1${digits}` : digits;
  return (
    <div data-testid="website-visitor" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[color:var(--wb-border)] bg-[color:var(--wb-notice)] px-4 py-2 text-xs text-[color:var(--wb-icon)]">
      <span className="font-semibold text-[color:var(--wb-text)]">🌐 网站咨询</span>
      {visitor.callbackAt && (
        <span data-testid="callback-badge" className="rounded-full bg-red-600 px-2 py-0.5 font-semibold text-white">
          🔔 客人要求回电
        </span>
      )}
      {visitor.name ? (
        <>
          <span>{visitor.name}</span>
          <a href={`tel:${visitor.phone}`} className="text-[#008069] underline">
            {visitor.phone}
          </a>
          {whatsapp && (
            <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="text-[#008069] underline">
              WhatsApp
            </a>
          )}
          {visitor.wechat && <span>微信 {visitor.wechat}</span>}
          {visitor.email && (
            <a href={`mailto:${visitor.email}`} className="text-[#008069] underline">
              {visitor.email}
            </a>
          )}
        </>
      ) : (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">客人没有留联系方式，无法回访</span>
      )}
      <span>客人用{LANGUAGE[visitor.locale] ?? visitor.locale}</span>
      {visitor.booking && (
        <span className="font-semibold text-[#008069]">
          想预约 {visitor.booking.date} {visitor.booking.time}
        </span>
      )}
      <span className="basis-full text-[color:var(--wb-muted)]">客人看不到这里的消息。可以在下面问 AI 内部明细（进价、毛利），回复客人请打电话或发 WhatsApp。</span>
    </div>
  );
}

/** An estimate card as the website customer saw it: customer prices only. */
export function WebsiteEstimateCard({ card }: { card: EstimateCard }) {
  const { totalLow, totalHigh } = estimateRanges(card);
  const labor = (card.kind ?? "labor") === "labor";
  return (
    <article data-testid="website-estimate" className="max-w-xl rounded-lg border border-[color:var(--wb-line)] bg-white px-4 py-3 text-sm shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
      <p className="text-xs font-semibold text-[color:var(--wb-muted)]">客人看到的报价卡 · {card.id}</p>
      <p className="mt-1 font-medium text-[color:var(--wb-text)]">{[card.service, card.position].filter(Boolean).join(" · ")}</p>
      {card.vehicle && card.vehicle !== "—" && <p className="text-xs text-[color:var(--wb-muted)]">{card.vehicle}</p>}
      <p className="mt-1 text-base font-semibold text-[#008069]">{range(totalLow, totalHigh)}</p>
      {labor && card.laborHours > 0 && (
        <p className="text-xs text-[color:var(--wb-icon)]">
          工时 {card.laborHours} h × ${card.laborRate} = ${Math.round(card.laborWalkIn)}
        </p>
      )}
      {card.partOptions.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-[color:var(--wb-text2)]">
          {card.partOptions.map((option, index) => (
            <li key={index}>
              {option.description} — ${Math.round(option.unitListPrice)}
              {option.quantity > 1 ? ` × ${option.quantity} = $${Math.round(option.total)}` : ""}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
