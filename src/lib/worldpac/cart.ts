/**
 * Put parts into the shop's speedDIAL shopping cart (Kevin, 2026-11-16). Only ever a cart: an order is created or
 * added to in the "In shopping cart" state, and nothing here (or anywhere) submits it. Staff check the cart in
 * speedDIAL and place the order themselves.
 *
 * The request shapes are the ones speedDIAL's own web app sends (order lines made from the part's price-and-availability
 * row; "createorder" for a new cart, "order/addlines" for one that exists).
 */
import { BRAND_FIELDS, PART_NUMBER_FIELDS, type CatalogApi, type VehicleRef } from "./catalog";

export interface CartItem {
  partNumber: string;
  qty: number;
  /** The brand staff were quoted: when given, only that brand's part is added. */
  brand?: string;
}

export type CartResult =
  | { status: "ok"; orderNumber: string; created: boolean }
  | { status: "part_not_found"; partNumber: string }
  | { status: "not_enough_stock"; partNumber: string; available: number }
  | { status: "just_added" }
  | { status: "failed"; reason: string };

type Row = Record<string, unknown>;

interface PnaResponse {
  quotes?: Array<Row & { productQuotes?: Row[] }>;
}

const firstOf = (q: Row, keys: readonly string[]): string => {
  for (const key of keys) {
    const value = q[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

const partNumberOf = (q: Row) => firstOf(q, PART_NUMBER_FIELDS);
const brandOf = (q: Row) => firstOf(q, BRAND_FIELDS);
/** Both named, and one contains the other ("SHW" and "SHW Performance"). A row with no brand text never matches a named brand. */
const sameBrand = (rowBrand: string, wanted: string) => rowBrand !== "" && (rowBrand.includes(wanted) || wanted.includes(rowBrand));

/** The order line speedDIAL's own "add to cart" builds from a price-and-availability row. */
function orderLine(q: Row, requestId: unknown, qty: number): Row {
  const product = (q.productID ?? {}) as { key?: string; brandCode?: string };
  return {
    productId: product.key,
    brandId: product.brandCode,
    // The standard carrier is an empty id in speedDIAL's own code.
    carrierID: "",
    carrierDescription: q.carrierDescription,
    warehouseId: String(q.warehouseID),
    applicationId: String(q.appID),
    requestedQuantity: String(qty),
    catalogID: q.catalogID,
    PnARequestID: requestId,
    PnAResponseSequence: q.PnAResponseSequence,
    requestedProductCode: "",
  };
}

/** Shop time (Vancouver) as YYYYMMDD, with the daylight-saving shift handled. */
const vancouverDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "2-digit", day: "2-digit" }).format(date).replace(/-/g, "");

type OrderHeader = Row & { orderNumber?: unknown; orderStatusDescription?: unknown; modifiedTimeMS?: unknown };

/** The cart order the shop already has open (the newest "In shopping cart" one within the last month), if any. Null on "none"; throws when the list can't be trusted. */
async function openCart(api: CatalogApi, now: Date): Promise<string | null> {
  const history = await api.post<{ status?: { code?: number }; orders?: Array<{ orderHeader?: OrderHeader }> }>("order/history", {
    searchAll: "",
    orderNumber: "",
    orderStatus: "All",
    comment: "",
    productCode: "",
    fromDate: vancouverDay(new Date(now.getTime() - 30 * 86_400_000)),
    toDate: vancouverDay(now),
    pageSize: 100,
    pageNumber: 1,
    sortBy: "",
    sortSequence: "",
    includeLastUpdateDateInFilter: false,
  });
  // An error answer is not "no cart": adding on a guess could make a second cart.
  if (history.status?.code !== 200 || !Array.isArray(history.orders)) throw new Error("order history unavailable");
  const carts = history.orders.map((o) => o.orderHeader ?? {}).filter((h) => h.orderStatusDescription === "In shopping cart" && h.orderNumber);
  carts.sort((a, b) => Number(b.modifiedTimeMS ?? 0) - Number(a.modifiedTimeMS ?? 0));
  return carts[0] ? String(carts[0].orderNumber) : null;
}

const ok = (response: { status?: { code?: number } } | null) => response?.status?.code === 200;

async function cartLines(api: CatalogApi, orderNumber: string): Promise<number | null> {
  const read = await api.get<{ order?: { orderLines?: unknown[] } }>(`order/${encodeURIComponent(orderNumber)}`);
  return Array.isArray(read.order?.orderLines) ? read.order!.orderLines!.length : null;
}

// The same part asked for again within two minutes is refused: a retry after a lost answer must not add it twice.
const recent = new Map<string, number>();
const RECENT_MS = 2 * 60_000;

/**
 * Adds the parts, priced fresh from speedDIAL (the line needs the current price-and-availability request),
 * to the open cart or a new one, then reads the cart back to check the lines really arrived.
 * `categoryCode` is the part's category ("N1000") and `vehicle` the car it was priced for.
 */
export async function addToWorldpacCart(api: CatalogApi, vehicle: VehicleRef, categoryCode: string, items: CartItem[], now = new Date()): Promise<CartResult> {
  if (items.length === 0 || items.length > 6) return { status: "failed", reason: "bad_request" };
  const marker = `${vehicle.baseVehicleId}|${items.map((i) => `${i.partNumber.toLowerCase()}x${i.qty}`).join(",")}`;
  const last = recent.get(marker);
  if (last !== undefined && now.getTime() - last < RECENT_MS) return { status: "just_added" };
  const pna = await api.post<PnaResponse>("pna360_cat", {
    attributes: vehicle.attributes.map((a) => ({ name: a.name, value: a.id })),
    partTypes: [{ requestedQuantity: 0, orderType: "ST", categoryCode, baseVehicleID: vehicle.baseVehicleId, positionID: -1 }],
  });
  const rows = (pna.quotes ?? []).flatMap((quote) => (quote.productQuotes ?? []).map((row) => ({ row, requestId: quote.PnARequestID })));
  const lines: Row[] = [];
  for (const item of items) {
    const wanted = item.partNumber.trim().toLowerCase();
    const brand = item.brand?.trim().toLowerCase() ?? "";
    const matches = rows.filter(({ row }) => partNumberOf(row).toLowerCase() === wanted && (!brand || sameBrand(brandOf(row).toLowerCase(), brand)));
    if (matches.length === 0) return { status: "part_not_found", partNumber: item.partNumber };
    // The row staff were quoted: local stock that covers the quantity, the lower account price first.
    const enough = matches.filter(({ row }) => Number(row.qtyAvailable) >= item.qty);
    if (enough.length === 0) return { status: "not_enough_stock", partNumber: item.partNumber, available: Math.max(0, ...matches.map(({ row }) => Number(row.qtyAvailable) || 0)) };
    const local = enough.filter(({ row }) => /local/i.test(String(row.availability ?? "")));
    const pool = local.length ? local : enough;
    pool.sort((a, b) => (Number(a.row.unitPrice) || Infinity) - (Number(b.row.unitPrice) || Infinity));
    lines.push(orderLine(pool[0].row, pool[0].requestId, item.qty));
  }
  recent.set(marker, now.getTime());
  try {
    const existing = await openCart(api, now);
    if (existing) {
      const before = await cartLines(api, existing);
      const response = await api.post<{ status?: { code?: number } }>("order/addlines", lines, { orderNumber: existing });
      if (!ok(response)) throw new Error("addlines");
      const after = await cartLines(api, existing);
      // Verified by reading the cart back, not by the answer alone.
      if (before === null || after === null || after - before !== lines.length) return { status: "failed", reason: "unverified" };
      return { status: "ok", orderNumber: existing, created: false };
    }
    const response = await api.post<{ status?: { code?: number }; order?: { orderHeader?: Row; orderNumber?: string } }>("createorder", lines, { orderType: "ST" });
    const orderNumber = String(response.order?.orderHeader?.orderNumber ?? response.order?.orderNumber ?? "");
    if (!ok(response) || !orderNumber) throw new Error("createorder");
    const count = await cartLines(api, orderNumber);
    if (count !== lines.length) return { status: "failed", reason: "unverified" };
    return { status: "ok", orderNumber, created: true };
  } catch (error) {
    // Not added (or not known to be): the guard is lifted so staff can try again after looking at the cart.
    recent.delete(marker);
    return { status: "failed", reason: error instanceof Error ? error.message.slice(0, 60) : "failed" };
  }
}

/** Removes a whole cart order (used by tests of this module against the real account; never by the workbench). */
export async function deleteWorldpacCartOrder(api: CatalogApi, orderNumber: string): Promise<boolean> {
  const response = await api.post<{ status?: { code?: number } }>("order/delete", { orderNumber });
  return ok(response);
}
