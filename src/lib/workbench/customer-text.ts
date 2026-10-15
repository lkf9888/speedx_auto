/**
 * The customer's version of a staff quote: customer prices only, never cost or
 * margin. Kept apart from quote.ts so the quote card can rebuild it in the
 * browser for just the options staff tick.
 */
import type { StaffQuote } from "./quote";

const dollars = (value: number) => `$${value.toFixed(2)}`;

/** Text a staff member can paste into WhatsApp/WeChat: customer prices only. */
export function customerText(quote: Omit<StaffQuote, "customerText">): string {
  const lines = [
    "【SPEEDX AUTO 维修报价】",
    `车辆：${quote.vehicle || "—"}`,
    `项目：${quote.service}${quote.position ? `（${quote.position.replace(/,?\s*both sides/i, "，左右两边").replace(/^Both sides$/i, "左右两边")}）` : ""}`,
  ];
  if (quote.kind === "team_quote" || quote.options.length === 0) {
    lines.push("这项需要到店检查后报价。");
  } else {
    quote.options.forEach((o, i) => {
      const name = [o.brand, o.label].filter(Boolean).join(" ");
      const each =
        quote.kind === "tires" ? `，每条 ${dollars(o.unitPrice)} × ${o.quantity}` : quote.kind === "labor" && o.quantity > 1 ? ` × ${o.quantity}` : "";
      lines.push(`${i + 1}. ${name}${each}：${dollars(o.customerTotal)}`);
    });
  }
  lines.push("以上为税前参考价，最终以到店检查为准。");
  lines.push(`报价编号 ${quote.id}`);
  return lines.join("\n");
}

