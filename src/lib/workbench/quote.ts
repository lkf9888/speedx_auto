/**
 * The staff quote: the same job the public assistant prices, with what the
 * public never sees — every part option, the shop's cost, margin, labor hours
 * and the referral price — plus a customer-ready text with no cost in it.
 */
import { WALK_IN_LABOR_RATE, REFERRAL_LABOR_MULTIPLIER, type EstimateCard } from "@/lib/repair-chat/pricing";
import type { StaffPartOption } from "@/lib/worldpac/catalog";
import { customerText } from "./customer-text";

export { customerText };

export type StaffQuoteKind = "labor" | "flat" | "tires" | "team_quote";

export interface StaffQuoteOption {
  label: string;
  brand: string;
  partNumber: string;
  quantity: number;
  /** Price per unit the customer pays for the part (list price; tires: installed price). */
  unitPrice: number;
  /** Shop cost per unit, when known. */
  unitCost: number | null;
  /** Core charge per unit, when WorldPac sends one. */
  core: number | null;
  stock: string;
  /** The supplier has none: left out of the customer copy unless staff tick it. */
  outOfStock?: boolean;
  /** Customer total for this option: parts + labor (walk-in). */
  customerTotal: number;
  /** Same with the referral labor price. */
  referralTotal: number;
  costTotal: number | null;
  profit: number | null;
  /** Profit as a share of the customer total, 0–1. */
  margin: number | null;
  /** Every price field WorldPac sent, by field name. */
  prices: Record<string, number>;
  /** Other raw fields, for working out what WorldPac sends. */
  fields: Record<string, string | number>;
}

export interface StaffQuote {
  id: string;
  kind: StaffQuoteKind;
  /** Where the options come from; decides the link buttons. */
  supplier?: "worldpac" | "dt" | "partner_tires" | "shop";
  vehicle: string;
  service: string;
  position: string;
  labor: { hours: number; rate: number; walkIn: number; referral: number } | null;
  /** Which WorldPac price is treated as cost (WORKBENCH_COST_FIELD). */
  costField: string;
  options: StaffQuoteOption[];
  notes: string[];
  customerText: string;
  createdAt: string;
}

const money = (value: number) => Math.round(value * 100) / 100;

export function costField(env: NodeJS.ProcessEnv = process.env): string {
  return env.WORKBENCH_COST_FIELD?.trim() || "unitPrice";
}

function finish(option: Omit<StaffQuoteOption, "profit" | "margin">): StaffQuoteOption {
  const profit = option.costTotal === null ? null : money(option.customerTotal - option.costTotal);
  const margin = profit === null || option.customerTotal <= 0 ? null : Math.round((profit / option.customerTotal) * 1000) / 1000;
  return { ...option, profit, margin };
}

function withText(quote: Omit<StaffQuote, "customerText">): StaffQuote {
  return { ...quote, customerText: customerText(quote) };
}

export interface LaborJob {
  serviceName: string;
  position: string;
  laborHours: number;
  laborNote: string;
  primaryPartName: string;
  otherPartNames: string[];
  partsNote: string;
  partOptions: StaffPartOption[];
}

export function buildLaborQuote(vehicle: string, job: LaborJob, id: string, env: NodeJS.ProcessEnv = process.env, now = new Date()): StaffQuote {
  const field = costField(env);
  const walkIn = money(job.laborHours * WALK_IN_LABOR_RATE);
  const referral = money(job.laborHours * WALK_IN_LABOR_RATE * REFERRAL_LABOR_MULTIPLIER);
  const options = job.partOptions.map((p) => {
    const cost = p.prices[field];
    const unitCost = typeof cost === "number" && cost > 0 ? cost : null;
    const listTotal = money(p.listPrice * p.quantity);
    return finish({
      label: p.description,
      brand: p.brand || p.series,
      partNumber: p.partNumber,
      quantity: p.quantity,
      unitPrice: p.listPrice,
      unitCost,
      core: typeof p.prices.corePrice === "number" && p.prices.corePrice > 0 ? p.prices.corePrice : null,
      stock: p.inStockLocally ? `本地有货（${p.qtyAvailable ?? "?"}）` : p.availability || "未知",
      customerTotal: money(listTotal + walkIn),
      referralTotal: money(listTotal + referral),
      costTotal: unitCost === null ? null : money(unitCost * p.quantity),
      prices: p.prices,
      fields: p.fields,
    });
  });
  if (options.length === 0) {
    options.push(
      finish({
        label: job.partsNote ? "仅工时（零件另计）" : "仅工时",
        brand: "",
        partNumber: "",
        quantity: 1,
        unitPrice: 0,
        unitCost: 0,
        core: null,
        stock: "",
        customerTotal: walkIn,
        referralTotal: referral,
        costTotal: 0,
        prices: {},
        fields: {},
      }),
    );
  }
  const notes = [
    job.laborNote && `工时说明：${job.laborNote}`,
    job.partsNote && `零件：${job.partsNote}`,
    job.otherPartNames.length ? `可能还需要：${job.otherPartNames.join("、")}` : "",
    "毛利 = 客户总价（零件标价 + 工时）− 零件进价，未扣人工成本。",
  ].filter(Boolean) as string[];
  return withText({
    id,
    kind: "labor",
    supplier: "worldpac",
    vehicle,
    service: job.serviceName,
    position: job.position,
    labor: { hours: job.laborHours, rate: WALK_IN_LABOR_RATE, walkIn, referral },
    costField: field,
    options,
    notes,
    createdAt: now.toISOString(),
  });
}

/** A shop flat price that needs no vehicle (mounting the customer's own tires). */
export function buildFlatQuote(
  service: string,
  rows: Array<{ label: string; quantity: number; unitPrice: number }>,
  note: string,
  id: string,
  now = new Date(),
): StaffQuote {
  const options = rows.map((r) =>
    finish({
      label: r.label,
      brand: "",
      partNumber: "",
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      unitCost: null,
      core: null,
      stock: "",
      customerTotal: money(r.unitPrice * r.quantity),
      referralTotal: money(r.unitPrice * r.quantity),
      costTotal: null,
      prices: {},
      fields: {},
    }),
  );
  return withText({ id, kind: "flat", supplier: "shop", vehicle: "—", service, position: "", labor: null, costField: "", options, notes: [note, "店内一口价，没有单独的进价数据。"], createdAt: now.toISOString() });
}

/** Parts priced with no labor operation behind them: staff add the labor. */
export function buildPartsQuote(vehicle: string, partName: string, position: string, parts: StaffPartOption[], id: string, env: NodeJS.ProcessEnv = process.env, now = new Date()): StaffQuote {
  const field = costField(env);
  const options = parts.map((p) => {
    const cost = p.prices[field];
    const unitCost = typeof cost === "number" && cost > 0 ? cost : null;
    const listTotal = money(p.listPrice * p.quantity);
    return finish({
      label: p.description,
      brand: p.brand || p.series,
      partNumber: p.partNumber,
      quantity: p.quantity,
      unitPrice: p.listPrice,
      unitCost,
      core: typeof p.prices.corePrice === "number" && p.prices.corePrice > 0 ? p.prices.corePrice : null,
      stock: p.inStockLocally ? `本地有货（${p.qtyAvailable ?? "?"}）` : p.availability || "未知",
      customerTotal: listTotal,
      referralTotal: listTotal,
      costTotal: unitCost === null ? null : money(unitCost * p.quantity),
      prices: p.prices,
      fields: p.fields,
    });
  });
  return withText({
    id,
    kind: "labor",
    supplier: "worldpac",
    vehicle,
    service: `${partName}（只查零件）`,
    position,
    labor: null,
    costField: field,
    options,
    notes: ["这张卡只含零件标价，不含工时；工时请按相关工时项或人工确认后再加。", "毛利 = 零件标价 − 进价。"],
    createdAt: now.toISOString(),
  });
}

/** Flat-price and team-quote cards from the shared tools, shown to staff as quotes. */
export function fromPublicCard(card: EstimateCard, reason = ""): StaffQuote {
  const kind: StaffQuoteKind = card.kind === "team_quote" ? "team_quote" : card.kind === "tires" ? "tires" : "flat";
  const options = card.partOptions.map((p) =>
    finish({
      label: p.description,
      brand: "",
      partNumber: "",
      quantity: p.quantity,
      unitPrice: p.unitListPrice,
      unitCost: null,
      core: null,
      stock: "",
      customerTotal: p.total,
      referralTotal: p.total,
      costTotal: null,
      prices: {},
      fields: {},
    }),
  );
  const notes = [
    card.partsNote && kind !== "team_quote" ? card.partsNote : "",
    kind === "flat" ? "店内一口价，没有单独的进价数据。" : "",
    kind === "team_quote" ? `对外不给价：${reason || card.partsNote}` : "",
  ].filter(Boolean);
  return withText({
    id: card.id,
    kind,
    vehicle: card.vehicle,
    service: card.service,
    position: card.position,
    labor: null,
    costField: "",
    options,
    notes,
    createdAt: card.createdAt,
  });
}

export interface StaffTireOption {
  brand: string;
  pattern: string;
  size: string;
  load: string;
  season: string;
  retail: number;
  eco: number;
  mounting: number;
  /** Shop cost per tire, when the markup is configured. */
  cost: number | null;
  /** Supplier SKU, when the supplier gives one. */
  sku?: string;
  /** Supplier stock, e.g. "本地 51 / 其他仓 99+". */
  stock?: string;
  outOfStock?: boolean;
}

export interface TireQuoteSource {
  /** Shown to staff only, never in the customer text. */
  name: string;
  /** How the customer price was set, e.g. "零售价 = MSRP". */
  retailRule: string;
  supplier: "dt" | "partner_tires";
}

const PARTNER_LIST: TireQuoteSource = { name: "合作轮胎价目表 + Wheel Mart（实时，每行注明）", retailRule: "零售价（拿货价 × 店里的加价倍率）", supplier: "partner_tires" };

/** New tires: installed price per tire for the customer; cost, eco fee and mounting shown apart. */
export function buildTireQuote(
  vehicle: string,
  size: string,
  options: StaffTireOption[],
  count: number,
  id: string,
  now = new Date(),
  source: TireQuoteSource = PARTNER_LIST,
): StaffQuote {
  const rows = options.map((o) => {
    const perTire = Math.round(o.retail + o.eco) + o.mounting;
    return finish({
      label: `${o.pattern} ${o.size} ${o.load}`.trim(),
      brand: o.brand,
      partNumber: o.sku ?? "",
      quantity: count,
      unitPrice: perTire,
      unitCost: o.cost === null ? null : money(o.cost),
      core: null,
      stock: [o.season, o.stock].filter(Boolean).join(" · "),
      ...(o.outOfStock ? { outOfStock: true } : {}),
      customerTotal: perTire * count,
      referralTotal: perTire * count,
      // Eco fee is passed through, so it counts against profit like cost.
      costTotal: o.cost === null ? null : money((o.cost + o.eco) * count),
      prices: { retail: money(o.retail), eco: o.eco, mounting: o.mounting, ...(o.cost === null ? {} : { cost: money(o.cost) }) },
      fields: {},
    });
  });
  const notes = [
    `来源：${source.name}。客户每条价 = ${source.retailRule} + 环保费（取整）+ 换胎工钱；表中“进价”为轮胎拿货价。`,
    options.some((o) => o.cost === null) ? (source === PARTNER_LIST ? "未配置 TIRE_MARKUP，无法显示轮胎进价。" : "部分轮胎没有拿货价。") : "",
    "毛利 = 客户总价 − 轮胎进价 − 环保费，换胎工钱计入毛利。",
  ].filter(Boolean);
  return withText({
    id,
    kind: "tires",
    supplier: source.supplier,
    vehicle,
    service: `新轮胎（含安装）· ${size}`,
    position: "",
    labor: null,
    costField: "cost",
    options: rows,
    notes,
    createdAt: now.toISOString(),
  });
}

const SOURCES: Record<NonNullable<StaffQuote["supplier"]>, string> = {
  worldpac: "WorldPac speedDIAL (labor guide and the shop's WorldPac account prices)",
  dt: "DT Tire Hub, live",
  partner_tires: "the partner tire price list and Wheel Mart Canada (live stock; each row says which)",
  shop: "the shop's own flat prices",
};

const LINKS: Partial<Record<NonNullable<StaffQuote["supplier"]>, string>> = {
  worldpac:
    "Each part on the card has buttons: speedDIAL (copies the part number and opens speedDIAL, which has no product links), and eBay, Amazon and RockAuto searches by part number. These are search entry points, not checked listings: staff confirm the same part, price and shipping there.",
  dt: "Each tire on the card has a DT Tire Hub search for its SKU and an Amazon search. Search entry points, not checked listings.",
};

/** What the model reads about a staff quote: compact, numbers only, plus where it came from. */
export function summarizeStaffQuote(quote: StaffQuote): string {
  const source = quote.supplier ? ` Source: ${SOURCES[quote.supplier]}.` : "";
  const head = `Staff quote ${quote.id} shown as a card. Vehicle: ${quote.vehicle}. Service: ${quote.service}${quote.position ? ` (${quote.position})` : ""}.${source}`;
  if (quote.kind === "team_quote") return `${head}\nNo public price: ${quote.notes.join(" ")}`;
  const labor = quote.labor
    ? `Labor: ${quote.labor.hours} h × $${quote.labor.rate} = $${quote.labor.walkIn} (referral $${quote.labor.referral}).`
    : "";
  const options = quote.options
    .map(
      (o, i) =>
        `${i + 1}. ${[o.brand, o.label].filter(Boolean).join(" ")}${o.partNumber ? ` #${o.partNumber}` : ""} ×${o.quantity}: unit $${o.unitPrice}` +
        `${quote.kind === "tires" && o.prices.retail !== undefined ? ` (= tire $${o.prices.retail} + eco fee $${o.prices.eco} + mounting $${o.prices.mounting}, eco rounded in)` : ""}` +
        `${o.unitCost !== null ? `, cost $${o.unitCost}` : ""}; customer $${o.customerTotal} (referral $${o.referralTotal})` +
        `${o.profit !== null ? `, profit $${o.profit}${o.margin !== null ? ` (${Math.round(o.margin * 100)}%)` : ""}` : ""}${o.stock ? `, ${o.stock}` : ""}`,
    )
    .join("\n");
  return [head, labor, options, quote.notes.join(" "), quote.supplier ? (LINKS[quote.supplier] ?? "") : ""].filter(Boolean).join("\n");
}
