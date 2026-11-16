/**
 * The customer's version of a staff quote: customer prices only, never cost or
 * margin. Kept apart from quote.ts so the quote card can rebuild it in the
 * browser for just the options staff tick.
 */
import type { StaffQuote } from "./quote";
import { taxOn } from "./tax";

const dollars = (value: number) => `$${value.toFixed(2)}`;

/** Text a staff member can paste into WhatsApp/WeChat: customer prices only. */
export function customerText(quote: Omit<StaffQuote, "customerText">): string {
  const lines = [
    "【SPEEDX AUTO 维修报价】",
    `车辆：${quote.vehicle || "—"}`,
    `项目：${quote.service}${quote.position ? `（${quote.position.replace(/,?\s*both sides/i, "，左右两边").replace(/^Both sides$/i, "左右两边")}）` : ""}`,
  ];
  // Out-of-stock options never go to the customer.
  const options = quote.options.filter((o) => !o.outOfStock);
  if (quote.kind === "team_quote" || options.length === 0) {
    lines.push("这项需要到店检查后报价。");
  } else {
    options.forEach((o, i) => {
      const name = [o.brand, o.label].filter(Boolean).join(" ");
      const each =
        quote.kind === "tires" ? `，每条 ${dollars(o.unitPrice)} × ${o.quantity}` : quote.kind === "labor" && o.quantity > 1 ? ` × ${o.quantity}` : quote.kind === "flat" && o.quantity > 1 ? `，每条 ${dollars(o.unitPrice)} × ${o.quantity}` : "";
      lines.push(`${i + 1}. ${name}${each}：${dollars(o.customerTotal)}${o.source === "used" ? "（二手件，质保以卖家陈述为准）" : ""}${o.eta ? `（需调货，${o.eta}）` : ""}（税后 ${dollars(taxOn(o.customerTotal).total)}）`);
    });
  }
  lines.push("以上为税前参考价，括号内为含 GST 5% + PST 7% 的税后价，最终以到店检查为准。");
  lines.push(`报价编号 ${quote.id}`);
  return lines.join("\n");
}

