"use client";

import { useState } from "react";
import { bridgeErrorText, callAlldata, CART_URLS, type CartAddResult, type CartSupplier } from "@/lib/workbench/alldata-bridge";
import { optionLinks, orderLine, type ProductLink } from "@/lib/workbench/links";
import { finalCustomerText, priceOption, withFinalPrices } from "@/lib/workbench/final-price";
import { staffName } from "@/lib/workbench/conversation-types";
import { atTier, describePricing, extraPctOf, laborWithExtra, noFriendPrice, TIER_LABEL, tierLabor, tierMarkup, type CustomPricing, type PriceTier } from "@/lib/workbench/price-tier";
import { supplierLabel, type StaffQuote, type StaffQuoteOption } from "@/lib/workbench/quote";

const usd = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const money = (value: number | null) => (value === null ? "—" : usd.format(value));

const KIND_LABEL: Record<StaffQuote["kind"], string> = {
  labor: "工时 + 零件",
  flat: "店内一口价",
  tires: "新轮胎",
  team_quote: "对外不报价",
};

/** Buttons that open the part at the supplier or on marketplaces, in a new tab. */
function ProductLinks({ links }: { links: ProductLink[] }) {
  const [copied, setCopied] = useState("");
  if (links.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          title={link.copy ? `复制零件号 ${link.copy}，再打开 ${link.label} 粘贴搜索` : `在 ${link.label} 打开`}
          onClick={() => {
            if (!link.copy) return;
            void navigator.clipboard?.writeText(link.copy).then(
              () => setCopied(link.copy!),
              () => setCopied(""),
            );
          }}
          className="rounded-full border border-ink-200 px-2 py-0.5 text-[11px] font-medium text-ink-600 hover:border-brand-400 hover:text-brand-700"
        >
          {link.label} ↗
        </a>
      ))}
      {copied && <span className="text-[11px] text-emerald-700">已复制 {copied}，在 speedDIAL 搜索框粘贴</span>}
    </div>
  );
}

/** Copies the one-line order for this part (supplier, car, part number, quantity, cost) for staff to paste where they order. */
function CopyOrder({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  return (
    <div className="mt-1 flex items-center gap-1">
      <button
        type="button"
        data-testid="copy-order"
        onClick={() => void navigator.clipboard.writeText(text).then(() => setState("done"), () => setState("failed"))}
        className="rounded-full border border-ink-200 px-2 py-0.5 text-[11px] font-medium text-ink-600 hover:border-brand-400 hover:text-brand-700"
      >
        复制订货信息
      </button>
      {state === "done" && <span className="text-[11px] text-emerald-700">已复制（内部，含进价）</span>}
      {state === "failed" && <span className="text-[11px] text-amber-700">浏览器不让复制，请手动选择</span>}
    </div>
  );
}

const CART_NOTE: Record<Exclude<CartAddResult["status"], "ok">, string> = {
  not_signed_in: "这台电脑的 Chrome 没登录这家的 Nexpart，请先登录再试。",
  not_found: "这家的 Nexpart 里搜不到这个零件号，没有加进购物车。",
  not_added: "点了加购物车，但购物车数量没有增加，没有加成功。请到 Nexpart 里看一眼。",
  page_changed: "Nexpart 页面和预期不一样（可能改版了），没有加进购物车。",
  bad_request: "零件号或数量不合规，没有加进购物车。",
};

/**
 * One click into a seller's cart (Kevin, 2026-11-16): staff confirm the part and quantity, the part goes into the
 * seller's shopping cart, and staff place the order themselves there. Never an order.
 */
function CartButton({
  name,
  summary,
  run,
  link,
  slow,
}: {
  name: string;
  summary: string;
  run: () => Promise<{ ok: true; message: string; href?: string } | { ok: false; message: string }>;
  link: { href: string; label: string };
  slow: string;
}) {
  const [step, setStep] = useState<"idle" | "confirm" | "adding" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [href, setHref] = useState(link.href);

  async function add() {
    setStep("adding");
    const result = await run();
    setMessage(result.message);
    if (result.ok && result.href) setHref(result.href);
    setStep(result.ok ? "done" : "error");
  }

  return (
    <div className="mt-1" data-testid="add-to-cart">
      {step === "idle" && (
        <button type="button" onClick={() => setStep("confirm")} className="rounded-full border border-amber-600 px-2 py-0.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-50">
          加进 {name} 购物车
        </button>
      )}
      {step === "confirm" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
          <p>
            加进 {name} 购物车？{summary}。只加购物车，<b>不会下单</b>。
          </p>
          <div className="mt-1 flex gap-2">
            <button type="button" data-testid="cart-confirm" onClick={() => void add()} className="rounded bg-amber-700 px-2 py-0.5 font-semibold text-white hover:bg-amber-800">
              确认加入
            </button>
            <button type="button" onClick={() => setStep("idle")} className="rounded border border-amber-400 px-2 py-0.5">
              取消
            </button>
          </div>
        </div>
      )}
      {step === "adding" && <p className="text-[11px] text-ink-600">正在加进 {name} 购物车…{slow}</p>}
      {step === "done" && (
        <p data-testid="cart-done" className="text-[11px] text-emerald-800">
          {message}{" "}
          <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            {link.label} ↗
          </a>
        </p>
      )}
      {step === "error" && (
        <p role="alert" className="text-[11px] text-amber-800">
          {message}{" "}
          <a href={link.href} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            先打开 {name} 购物车看一眼 ↗
          </a>{" "}
          （确认没加上再重试，免得加两遍）{" "}
          <button type="button" className="underline" onClick={() => setStep("confirm")}>
            再试一次
          </button>
        </p>
      )}
    </div>
  );
}

const WORLDPAC_CART_NOTE: Record<string, string> = {
  part_not_found: "WorldPac 现在查不到这个零件（可能刚卖完或下架了），没有加进购物车。",
  not_enough_stock: "WorldPac 现在的库存不够这个数量，没有加进购物车。",
  just_added: "这个零件两分钟内刚加过，请先到 speedDIAL 购物车看一眼，免得加两遍。",
  failed: "speedDIAL 没有接受这次加购物车，或加完后读回来对不上。请到 speedDIAL 购物车看一眼再决定要不要重试。",
  bad_request: "零件、数量或车型不完整，没有加进购物车。",
  unauthorized: "登录已失效，请刷新工作台重新登录。",
  upstream: "speedDIAL 暂时没有回应，请稍后再试。",
};

const nexpartCart = (supplier: CartSupplier, name: string, option: StaffQuoteOption, total: number | null) => (
  <CartButton
    name={name}
    summary={`${[option.brand, option.label].filter(Boolean).join(" ")} #${option.partNumber} × ${option.quantity}${total !== null ? `，进价 $${total.toFixed(2)}` : ""}`}
    link={{ href: CART_URLS[supplier], label: `打开 ${name} 购物车` }}
    slow="（会在后台打开一个标签页，几秒钟）"
    run={async () => {
      try {
        const result = await callAlldata("cartAdd", { supplier, partNumber: option.partNumber, qty: option.quantity }, 60_000);
        if (result.status === "ok") return { ok: true as const, message: `已加进 ${name} 购物车（现在购物车里 ${result.cartAfter} 件）。去购物车核对，由你自己下单。` };
        return { ok: false as const, message: CART_NOTE[result.status] };
      } catch (error) {
        // An extension older than 1.2.0 doesn't know this request.
        const old = error instanceof Error && error.name === "BridgeError" && /unknown operation/i.test(error.message);
        return { ok: false as const, message: old ? "这台电脑的 SPEEDX 扩展版本太旧，请更新到 1.2.0（见扩展的 README），再试。" : bridgeErrorText(error) };
      }
    }}
  />
);

/** Where WorldPac's own cart order opens in speedDIAL. */
const worldpacCartHref = (orderNumber: string) => `https://speeddial.worldpac.com/#/order/${encodeURIComponent(orderNumber)}`;

function AddToCart({ quote, option, vehicleKey }: { quote: StaffQuote; option: StaffQuoteOption; vehicleKey?: string }) {
  if (!option.partNumber || option.outOfStock) return null;
  const total = option.unitCost === null ? null : Math.round(option.unitCost * option.quantity * 100) / 100;
  if (option.source === "westcan" || option.source === "lordco") {
    // A left + right set carries two part numbers: one cart line can't be made from it.
    if (/\+/.test(option.partNumber)) return null;
    return nexpartCart(option.source, option.source === "westcan" ? "Westcan" : "Lordco", option, total);
  }
  // WorldPac: the server puts it into the shop's speedDIAL cart. A left + right set is two lines.
  const category = String(option.fields?.categoryCode ?? "");
  if (quote.supplier !== "worldpac" || option.source || !vehicleKey || !/^[A-Za-z0-9]{2,12}$/.test(category)) return null;
  const parts = option.partNumber.split(/\s*\+\s*/).filter(Boolean);
  if (parts.length === 0 || parts.length > 4) return null;
  return (
    <CartButton
      name="WorldPac"
      summary={`${[option.brand, option.label].filter(Boolean).join(" ")} #${parts.join(" + ")} × ${option.quantity}${total !== null ? `，进价 $${total.toFixed(2)}` : ""}`}
      link={{ href: "https://speeddial.worldpac.com/", label: "打开 speedDIAL" }}
      slow="（几秒钟）"
      run={async () => {
        try {
          const response = await fetch("/api/workbench/cart/worldpac", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ vehicleKey, categoryCode: category, items: parts.map((partNumber) => ({ partNumber, qty: option.quantity, ...(option.brand ? { brand: option.brand } : {}) })) }),
          });
          const data = (await response.json().catch(() => null)) as { orderNumber?: string; error?: string; created?: boolean } | null;
          if (response.ok && data?.orderNumber) {
            return { ok: true as const, message: `已加进 WorldPac 购物车（speedDIAL 订单 ${data.orderNumber}，${data.created ? "新建的购物车" : "加进了已有的购物车"}）。去 speedDIAL 核对，由你自己提交订单。`, href: worldpacCartHref(data.orderNumber) };
          }
          return { ok: false as const, message: WORLDPAC_CART_NOTE[data?.error ?? "failed"] ?? WORLDPAC_CART_NOTE.failed };
        } catch {
          return { ok: false as const, message: WORLDPAC_CART_NOTE.upstream };
        }
      }}
    />
  );
}

type Totals = Record<string, number> | null;

/** Markup in dollars on a row as shown (its total may be a final price). */
function rowMarkup(quote: StaffQuote, row: StaffQuoteOption, tier: PriceTier, custom?: CustomPricing | null): number | null {
  // The row is already at the chosen price, so its customer total is the total for every tier.
  if (quote.kind === "labor") {
    if (row.unitCost === null || row.costTotal === null) return null;
    return Math.round((row.customerTotal - (tierLabor(quote, tier, custom) ?? 0) - row.costTotal) * 100) / 100;
  }
  return tierMarkup(quote, { ...row, referralTotal: row.customerTotal, friendTotal: row.customerTotal }, tier === "custom" || tier === "cost" ? "retail" : tier, null);
}

/**
 * One staff quote at the conversation's chosen price (Kevin, 2026-11-14): only
 * options in stock, with cost and markup in dollars, and a customer-safe text
 * and PDF. Staff can change the customer prices after bargaining ("改价"); the
 * agreed prices are saved for everyone and used for the text and the PDF.
 */
/** Where the Westcan check stands: running, failed here, or what it found. */
function WestcanLine({ quote, error, onRetry }: { quote: StaffQuote; error?: string; onRetry?: () => void }) {
  const checked = quote.westcan?.checked;
  if (checked) {
    return (
      <p data-testid="westcan-status" className="px-4 pt-2 text-xs text-ink-600">
        {checked.found > 0 && !checked.note ? `已查 Westcan：${checked.found} 个可用零件，已按拿货价 × 1.3 加进报价。` : `已查 Westcan：${checked.note ?? "没有可用零件。"}`}
      </p>
    );
  }
  if (error) {
    return (
      <p data-testid="westcan-status" className="flex flex-wrap items-center gap-2 px-4 pt-2 text-xs text-amber-800">
        <span>WorldPac 本地没货，没查成 Westcan：{error}</span>
        {onRetry && (
          <button type="button" onClick={onRetry} className="rounded-full border border-amber-700 px-2 py-0.5 font-semibold hover:bg-amber-50">
            重试 Westcan
          </button>
        )}
      </p>
    );
  }
  // Read-only views (share links) don't run the check.
  if (!onRetry) return null;
  return (
    <p data-testid="westcan-status" className="px-4 pt-2 text-xs text-sky-800">
      WorldPac 本地没货，正在用这台电脑的 Chrome 查 Westcan…
    </p>
  );
}

export function StaffQuoteCard({
  quote: stored,
  onSaveFinal,
  tier = "retail",
  custom,
  westcanError,
  onRetryWestcan,
  vehicleKey,
}: {
  quote: StaffQuote;
  /** The conversation's car, so a WorldPac part can be put into the speedDIAL cart. */
  vehicleKey?: string;
  onSaveFinal?: (totals: Totals) => Promise<boolean>;
  /** Why the Westcan check couldn't run on this computer. */
  westcanError?: string;
  onRetryWestcan?: () => void;
  /** The conversation's price; the card shows only that one. */
  tier?: PriceTier;
  /** The slider positions when tier is "custom". */
  custom?: CustomPricing | null;
}) {
  // Every total at the chosen price; agreed (final) prices still win.
  const quote = atTier(stored, tier, custom);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const [raw, setRaw] = useState(false);
  /** Options left out of the customer text (unticked); out-of-stock ones start unticked so they aren't copied by accident. */
  const [left, setLeft] = useState<Set<number>>(() => new Set(quote.options.flatMap((o, i) => (o.outOfStock ? [i] : []))));
  /** Price inputs while editing, by option index. */
  const [editing, setEditing] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [image, setImage] = useState<"idle" | "making" | "failed">("idle");
  const [pdf, setPdf] = useState<{ state: "idle" | "making" | "failed" } | { state: "ready"; file: File }>({ state: "idle" });

  const priced = withFinalPrices(quote);
  const draftTotal = (i: number) => {
    const value = editing?.[String(i)];
    const n = value === undefined || value.trim() === "" ? NaN : Number(value);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  // While editing, the row shows what the typed price would give.
  const rows = editing ? quote.options.map((o, i) => priceOption(quote, o, draftTotal(i))) : priced.options;
  /** Out-of-stock options are left off the card entirely. */
  const visible = quote.options.flatMap((o, i) => (o.outOfStock ? [] : [i]));
  const chosen = priced.options.filter((_, i) => !left.has(i));
  const textForCustomer = finalCustomerText(quote, (i) => !left.has(i));

  function startEditing() {
    setNotice("");
    setEditing(Object.fromEntries(priced.options.map((o, i) => [String(i), o.customerTotal.toFixed(2)])));
  }

  async function saveFinal(totals: Totals) {
    if (!onSaveFinal) return;
    setSaving(true);
    setNotice("");
    const ok = await onSaveFinal(totals).catch(() => false);
    setSaving(false);
    if (ok) {
      setEditing(null);
      setPdf({ state: "idle" });
      setNotice(totals ? "最终价已保存，复制和 PDF 都按最终价" : "已恢复 AI 报价");
    } else {
      setNotice("保存失败，请稍后再试");
    }
  }

  function saveEdits() {
    const totals: Record<string, number> = {};
    for (const i of visible) {
      const value = draftTotal(i);
      if (value === undefined) {
        setNotice("每个价格都要填一个数字");
        return;
      }
      const cents = Math.round(value * 100) / 100;
      // Only the prices staff changed become final, so the others still follow the conversation's price.
      const before = stored.final?.totals[String(i)];
      if (before !== undefined || cents !== Math.round(priced.options[i].customerTotal * 100) / 100) totals[String(i)] = cents;
    }
    if (Object.keys(totals).length === 0) {
      setEditing(null);
      setNotice("价格没有改动");
      return;
    }
    void saveFinal(totals);
  }

  /** Labor at the list rate, and what this price charges, for the estimate's discount line. */
  // An agreed final price replaces the total, so the labor split no longer applies.
  const pdfLabor = stored.labor && chosen.every((o) => o.originalTotal == null) ? { ...laborWithExtra(stored.labor, custom), charged: tierLabor(stored, tier, custom) ?? stored.labor.walkIn } : null;

  async function makeImage() {
    setImage("making");
    try {
      const { downloadFile, quoteImage } = await import("@/lib/workbench/quote-pdf");
      downloadFile(await quoteImage({ ...priced, options: chosen }, new Date(), undefined, pdfLabor));
      setImage("idle");
    } catch {
      setImage("failed");
    }
  }

  async function makePdf() {
    setPdf({ state: "making" });
    try {
      const { downloadFile, quotePdf } = await import("@/lib/workbench/quote-pdf");
      const file = await quotePdf({ ...priced, options: chosen }, new Date(), undefined, pdfLabor);
      downloadFile(file);
      setPdf({ state: "ready", file });
    } catch {
      setPdf({ state: "failed" });
    }
  }

  async function sharePdf(file: File) {
    try {
      await navigator.share({ files: [file], title: `SPEEDX AUTO ${quote.id}` });
    } catch {
      // Cancelled, or the browser can't share files: the PDF was already downloaded.
    }
  }
  const canShare = pdf.state === "ready" && typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [pdf.file] });

  async function copyForCustomer() {
    try {
      await navigator.clipboard.writeText(textForCustomer);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  const showCost = quote.kind === "labor" || quote.kind === "tires";
  const labor = tierLabor(stored, tier, custom);

  return (
    <article data-testid="staff-quote" className="rounded-xl border border-ink-200 bg-white text-sm shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-ink-100 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{KIND_LABEL[quote.kind]}</p>
          <h3 className="mt-0.5 text-base font-semibold text-ink-900">
            {quote.service}
            {quote.position ? ` · ${quote.position}` : ""}
          </h3>
          <p className="text-xs text-ink-500">{quote.vehicle}</p>
          {showCost && (
            <p data-testid="quote-tier" className="mt-1 inline-block rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
              按{TIER_LABEL[tier]}{tier === "custom" && custom ? `（${describePricing(custom)}）` : extraPctOf(custom) > 0 ? `（工时加时 ${extraPctOf(custom)}%）` : ""}
            </p>
          )}
          {quote.final && (
            <p data-testid="final-badge" className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              最终价 · {staffName(quote.final.by)} 修改
            </p>
          )}
        </div>
        <span className="shrink-0 font-mono text-xs text-ink-400">{quote.id}</span>
      </header>

      {quote.labor && labor !== null && (
        <p data-testid="labor-line" className="border-b border-ink-100 px-4 py-2 text-ink-700">
          工时 <b className="tabular-nums">{laborWithExtra(quote.labor, custom).hours} h</b> × {money(laborWithExtra(quote.labor, custom).hours > 0 ? Math.round((labor / laborWithExtra(quote.labor, custom).hours) * 100) / 100 : quote.labor.rate)} ={" "}
          <b className="tabular-nums">{money(labor)}</b>
        </p>
      )}

      {quote.westcan && <WestcanLine quote={quote} error={westcanError} onRetry={onRetryWestcan} />}
      {quote.used && !quote.options.some((o) => o.source === "used") && (
        <div data-testid="used-search" className="px-4 pt-2 text-xs text-violet-900">
          <p className="font-semibold">二手件：{quote.used.part}。先去这些地方查，查到后告诉助手拆车场、价格、运费和卖家说的质保。</p>
          <ProductLinks links={quote.used.links} />
        </div>
      )}

      {quote.options.length > 0 && visible.length === 0 && (
        <p data-testid="no-stock" className="px-4 py-3 text-amber-800">
          {quote.supplier === "worldpac" ? "WorldPac 本地仓库没有现货，" : "没有现货，"}这张卡不列价格。
          {quote.westcan?.checked ? "Westcan 也没有，" : ""}可以打电话问别的供货商。
        </p>
      )}

      {visible.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] border-collapse text-left tabular-nums">
            <thead className="bg-ink-50 text-xs text-ink-500">
              <tr>
                <th className="px-3 py-2 font-medium">选项</th>
                <th className="px-3 py-2 font-medium">数量</th>
                {showCost && <th className="px-3 py-2 text-right font-medium text-amber-800">{quote.kind === "tires" ? "采购价 / 条" : "采购价"}</th>}
                <th className="px-3 py-2 text-right font-medium text-emerald-800">{quote.kind === "tires" ? "每条（含安装）" : quote.kind === "labor" ? "零件卖价" : "单价"}</th>
                {quote.kind === "labor" && labor !== null && <th className="px-3 py-2 text-right font-medium text-emerald-800">安装工时价</th>}
                {showCost && <th className="px-3 py-2 text-right font-medium">{quote.kind === "tires" ? "加价（合计）" : "加价"}</th>}
                <th className="px-3 py-2 text-right font-medium">{quote.kind === "labor" && quote.labor ? `${TIER_LABEL[tier]}（零件+工时）` : showCost ? TIER_LABEL[tier] : "客户总价"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o, i) => {
                if (quote.options[i].outOfStock) return null;
                const markup = rowMarkup(quote, o, tier, custom);
                const partsSell = quote.kind === "labor" ? Math.round((o.customerTotal - (labor ?? 0)) * 100) / 100 : o.unitPrice;
                return (
                <tr key={`${o.label}-${i}`} className="border-t border-ink-100 align-top">
                  <td className="px-3 py-2">
                    {visible.length > 1 && (
                      <label className="mb-1 flex items-center gap-1.5 text-[11px] text-ink-500">
                        <input
                          type="checkbox"
                          checked={!left.has(i)}
                          onChange={() =>
                            setLeft((current) => {
                              const next = new Set(current);
                              if (next.has(i)) next.delete(i);
                              else next.add(i);
                              return next;
                            })
                          }
                          aria-label={`复制给客人时包含 ${[o.brand, o.label].filter(Boolean).join(" ")}${o.partNumber ? ` #${o.partNumber}` : ""}`}
                        />
                        给客人
                      </label>
                    )}
                    <div className="font-medium text-ink-900">{[o.brand, o.label].filter(Boolean).join(" ")}</div>
                    {o.partNumber && <div className="font-mono text-xs text-ink-500">#{o.partNumber}</div>}
                    {o.source === "used" && (
                      <div data-testid="used-badge" className="mt-0.5 mr-1 inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-900">
                        二手件
                      </div>
                    )}
                    {o.source === "used" && o.stock && (
                      <div data-testid="used-details" className="text-xs text-violet-900">
                        {o.stock}
                      </div>
                    )}
                    {(o.source === "westcan" || o.source === "lordco") && (
                      <div data-testid="westcan-badge" className="mt-0.5 mr-1 inline-block rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-900">
                        {o.source === "lordco" ? "Lordco" : "Westcan"}{o.eta ? "" : o.source === "lordco" ? " 本店有货" : " Richmond 有货"}
                      </div>
                    )}
                    {o.eta && (
                      <div data-testid="eta" className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
                        {o.source === "used" ? "二手件到货" : o.source ? "其他分店调货" : "本地没货，调货"} · {o.eta}
                      </div>
                    )}
                    {supplierLabel(quote, o) && o.source !== "westcan" && o.source !== "lordco" && o.source !== "used" && (
                      <div data-testid="supplier-badge" className="mt-0.5 mr-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                        供应商：{supplierLabel(quote, o)}
                      </div>
                    )}
                    {o.core !== null && <div className="text-xs text-amber-700">核心件押金 {money(o.core)}</div>}
                    <ProductLinks links={optionLinks(quote, o)} />
                    {quote.kind === "labor" && o.partNumber && o.source !== "used" && !o.outOfStock && <CopyOrder text={orderLine(quote, o)} />}
                    {quote.kind === "labor" && <AddToCart quote={quote} option={o} vehicleKey={vehicleKey} />}
                  </td>
                  <td className="px-3 py-2">{o.quantity}</td>
                  {showCost && <td data-testid="cost-cell" className="px-3 py-2 text-right font-medium text-amber-700">{money(quote.kind === "tires" ? o.unitCost : o.costTotal)}</td>}
                  <td data-testid="sell-cell" className="px-3 py-2 text-right font-medium text-emerald-700">{money(partsSell)}</td>
                  {quote.kind === "labor" && labor !== null && <td data-testid="labor-cell" className="px-3 py-2 text-right font-medium text-emerald-700">{money(labor)}</td>}
                  {showCost && (
                    <td data-testid="surcharge" className="px-3 py-2 text-right text-ink-600">
                      {markup === null ? "—" : `${markup >= 0 ? "+" : "−"}${money(Math.abs(markup))}`}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right font-semibold text-ink-900">
                    {editing ? (
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        value={editing[String(i)] ?? ""}
                        onChange={(e) => setEditing((current) => ({ ...(current ?? {}), [String(i)]: e.target.value }))}
                        aria-label={`最终价 ${[o.brand, o.label].filter(Boolean).join(" ")}`}
                        className="w-28 rounded-md border border-ink-300 px-2 py-1 text-right font-semibold focus:border-brand-500 focus:outline-none"
                      />
                    ) : (
                      money(o.customerTotal)
                    )}
                    {o.originalTotal !== null && <div className="text-[11px] font-normal text-ink-400 line-through">{money(o.originalTotal)}</div>}
                    {noFriendPrice(stored.options[i], tier) && <div className="text-[11px] font-normal text-ink-400">没有进价，按「原价+8折人工」</div>}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {quote.notes.length > 0 && (
        <ul className="space-y-1 border-t border-ink-100 px-4 py-3 text-xs leading-5 text-ink-600">
          {quote.notes.map((note) => (
            <li key={note}>• {note}</li>
          ))}
        </ul>
      )}

      <footer className="flex flex-wrap items-center gap-2 border-t border-ink-100 px-4 py-3">
        {editing ? (
          <>
            <button type="button" disabled={saving} onClick={saveEdits} className="rounded-full bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              {saving ? "保存中…" : "保存最终价"}
            </button>
            <button type="button" disabled={saving} onClick={() => setEditing(null)} className="rounded-full border border-ink-200 px-4 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
              取消
            </button>
            {quote.final && (
              <button type="button" disabled={saving} onClick={() => void saveFinal(null)} className="rounded-full border border-ink-200 px-4 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
                恢复 AI 报价
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void copyForCustomer()}
              disabled={chosen.length === 0}
              className="rounded-full bg-ink-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
            >
              {chosen.length === visible.length ? "复制客户报价" : `复制客户报价（${chosen.length} 个选项）`}
            </button>
            {quote.options.length > 0 && (
              <button
                type="button"
                onClick={() => void makePdf()}
                disabled={chosen.length === 0 || pdf.state === "making"}
                className="rounded-full border border-ink-900 px-4 py-1.5 text-xs font-semibold text-ink-900 hover:bg-ink-50 disabled:opacity-50"
              >
                {pdf.state === "making" ? "正在生成 PDF…" : "下载 PDF 报价单"}
              </button>
            )}
            {quote.options.length > 0 && (
              <button
                type="button"
                onClick={() => void makeImage()}
                disabled={chosen.length === 0 || image === "making"}
                className="rounded-full border border-ink-900 px-4 py-1.5 text-xs font-semibold text-ink-900 hover:bg-ink-50 disabled:opacity-50"
              >
                {image === "making" ? "正在生成图片…" : "下载图片报价单"}
              </button>
            )}
            {image === "failed" && <span className="text-xs text-amber-700">图片生成失败，请再试一次</span>}
            {pdf.state === "ready" && canShare && (
              <button type="button" onClick={() => void sharePdf(pdf.file)} className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                发给客人（WhatsApp / 微信）
              </button>
            )}
            {onSaveFinal && visible.length > 0 && !(stored.westcan && !stored.westcan.checked) && (
              <button type="button" onClick={startEditing} className="rounded-full border border-amber-400 px-4 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50">
                ✎ 改价
              </button>
            )}
          </>
        )}
        {notice && <span className="text-xs text-amber-800">{notice}</span>}
        {pdf.state === "ready" && <span className="text-xs text-emerald-700">已下载 {pdf.file.name}{canShare ? "" : "，可在 WhatsApp / 微信里作为文件发给客人"}</span>}
        {pdf.state === "failed" && <span className="text-xs text-amber-700">PDF 生成失败，请再试一次</span>}
        {copied === "done" && <span className="text-xs text-emerald-700">已复制，可直接粘贴给客人（不含进价）</span>}
        {copied === "failed" && <span className="text-xs text-amber-700">浏览器不允许复制，请在下面手动选择文字</span>}
        {quote.kind === "labor" && (
          <button
            type="button"
            onClick={() => setRaw((v) => !v)}
            className="rounded-full border border-ink-200 px-4 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
          >
            {raw ? "隐藏原始字段" : "显示 WorldPac 原始字段"}
          </button>
        )}
      </footer>

      {copied === "failed" && (
        <pre className="mx-4 mb-3 whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-xs">{textForCustomer}</pre>
      )}

      {raw && (
        <div className="space-y-3 border-t border-ink-100 px-4 py-3 text-xs">
          {quote.options.map((o, i) => (
            <div key={`raw-${i}`} className="overflow-x-auto">
              <p className="font-medium text-ink-800">{o.label}</p>
              <p className="mt-1 font-mono text-ink-600">
                {Object.entries(o.prices)
                  .map(([k, v]) => `${k}=${v}`)
                  .join("  ")}
              </p>
              <p className="mt-1 font-mono text-ink-400">
                {Object.entries(o.fields)
                  .map(([k, v]) => `${k}=${v}`)
                  .join("  ")}
              </p>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
