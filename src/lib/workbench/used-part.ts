/**
 * Used parts on a staff quote (Kevin, 2026-11-15, phase 1). Staff ask for a used
 * part themselves (engines, transmissions, driveshafts and other costly
 * assemblies); the assistant gives search links, and when staff report what
 * they found (yard, price, shipping, the seller's warranty) it builds the quote.
 *
 * Price: the yard's price x 1.3 plus shipping at cost, plus labor like any
 * other part. Warranty: only what the seller states; the shop adds none.
 * Used parts live in the workbench only: the public assistant never mentions
 * them, and the yard and cost never reach the customer text.
 */
import { customerText } from "./customer-text";
import { buildLaborQuote, finish, type StaffQuote, type StaffQuoteOption } from "./quote";

/** Used parts sell at the yard's price times this, plus shipping. */
export const USED_MARKUP = 1.3;

export interface UsedPartInput {
  /** "2019 Toyota Camry" */
  vehicle: string;
  service: string;
  position?: string | null;
  laborHours?: number | null;
  /** English description, e.g. "Engine assembly 2.5L". */
  part: string;
  yard?: string | null;
  grade?: string | null;
  mileageKm?: number | null;
  /** The seller's own words, passed on as stated. */
  warranty?: string | null;
  /** Per unit, from the yard. */
  partCost?: number | null;
  /** For the whole order; 0 when picked up. */
  shipping?: number | null;
  quantity?: number | null;
  /** How long until it arrives, as staff said it ("3 days"). */
  eta?: string | null;
  partNumber?: string | null;
}

export interface UsedLink {
  label: string;
  url: string;
  /** Copied before the link opens (Car-Part Pro and LKQ have no search URL). */
  copy?: string;
}

const money = (value: number) => Math.round(value * 100) / 100;
const text = (value: unknown, max = 120) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);

/** Search entry points for a used part; built here, never written by the assistant. */
export function usedSearchLinks(vehicle: string, part: string): UsedLink[] {
  const words = `${vehicle} ${part}`.replace(/\s+/g, " ").trim();
  return [
    { label: "Car-Part Pro", url: "https://pro.car-part.com/", copy: words },
    { label: "eBay.ca 二手", url: `https://www.ebay.ca/sch/i.html?${new URLSearchParams({ _nkw: words, _sacat: "6028", LH_ItemCondition: "3000" })}` },
    { label: "LKQ Canada", url: "https://www.lkqcanada.ca/en/", copy: words },
  ];
}

/** The seller's details in one line, for staff. */
function stockLine(i: { yard: string; grade: string; mileage: number | null; warranty: string }) {
  return [
    "二手",
    i.yard && `拆车场 ${i.yard}`,
    i.grade && `等级 ${i.grade}`,
    i.mileage !== null && `${i.mileage.toLocaleString("en-CA")} km`,
    i.warranty ? `卖家质保：${i.warranty}` : "卖家没说质保",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The quote for a used part. Without a price it is the labor with search links
 * and a note to come back with what was found; with one, the used option
 * replaces the labor-only line.
 */
export function buildUsedQuote(input: UsedPartInput, id: string, env: NodeJS.ProcessEnv = process.env, now = new Date()): StaffQuote | null {
  const hours = num(input.laborHours);
  const part = text(input.part, 100);
  if (hours === null || !part) return null;
  const vehicle = text(input.vehicle, 100) || "—";
  const base = buildLaborQuote(
    vehicle,
    { serviceName: text(input.service, 100) || part, position: text(input.position, 60), laborHours: hours, laborNote: "", primaryPartName: part, otherPartNames: [], partsNote: part, partOptions: [] },
    id,
    env,
    now,
  );
  const used = { part, links: usedSearchLinks(vehicle, part) };
  const cost = num(input.partCost);
  if (cost === null || cost <= 0) {
    return { ...base, used, notes: [...base.notes, "二手件：用卡片上的链接去查，查到后把拆车场、价格、运费和卖家说的质保告诉我，我再算价。"] };
  }
  const quantity = Math.min(Math.max(Math.floor(num(input.quantity) ?? 1), 1), 20);
  const shipping = money(num(input.shipping) ?? 0);
  const yard = text(input.yard, 80);
  const grade = text(input.grade, 20);
  const mileage = num(input.mileageKm);
  const warranty = text(input.warranty, 120);
  const walkIn = base.labor?.walkIn ?? 0;
  const referral = base.labor?.referral ?? 0;
  const costTotal = money(cost * quantity + shipping);
  const partsSale = money(cost * quantity * USED_MARKUP + shipping);
  const eta = text(input.eta, 60);
  const option: StaffQuoteOption = finish({
    label: `${part} (used${grade ? `, grade ${grade}` : ""}${mileage !== null ? `, ${mileage.toLocaleString("en-CA")} km` : ""})`,
    brand: "",
    partNumber: text(input.partNumber, 40),
    quantity,
    unitPrice: money(partsSale / quantity),
    unitCost: money(costTotal / quantity),
    core: null,
    stock: stockLine({ yard, grade, mileage, warranty }),
    ...(eta ? { eta } : {}),
    source: "used",
    customerTotal: money(partsSale + walkIn),
    referralTotal: money(partsSale + referral),
    // Other suppliers' parts are cost x 1.3 at the friend price too.
    friendTotal: money(partsSale + referral),
    costTotal,
    prices: { priceCost: cost, shipping },
    fields: { supplier: "二手", ...(yard ? { yard } : {}), ...(warranty ? { warranty } : {}) },
  });
  const merged: StaffQuote = {
    ...base,
    options: [option],
    used,
    notes: [
      ...base.notes.filter((n) => !/^二手件：/.test(n)),
      `二手件按拆车场价格 × ${USED_MARKUP} + 运费（$${shipping.toFixed(2)}，按实际）。质保只按卖家的说法，店里不另外承诺；给客人的文字里不含拆车场和拿货价。`,
    ],
  };
  return { ...merged, customerText: customerText(merged) };
}
