/**
 * Put parts into the shop's speedDIAL shopping cart (Kevin, 2026-11-16). Only ever a cart: an order is created or
 * added to in the "In shopping cart" state, and nothing here (or anywhere) submits it. Staff check the cart in
 * speedDIAL and place the order themselves.
 *
 * The request shapes are the ones speedDIAL's own web app sends (order lines made from the part's price-and-availability
 * row; "createorder" for a new cart, "order/addlines" for one that exists).
 */
import { PART_NUMBER_FIELDS, type CatalogApi, type VehicleRef } from "./catalog";

export interface CartItem {
  partNumber: string;
  qty: number;
}

export type CartResult =
  | { status: "ok"; orderNumber: string; created: boolean }
  | { status: "part_not_found"; partNumber: string }
  | { status: "failed"; reason: string };

type Row = Record<string, unknown>;

interface PnaResponse {
  quotes?: Array<Row & { productQuotes?: Row[] }>;
}

const partNumberOf = (q: Row): string => {
  for (const key of PART_NUMBER_FIELDS) {
    const value = q[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

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

const vancouverToday = (now = new Date()) => new Date(now.getTime() - 8 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");

/** The cart order the shop already has open today, if any (the newest "In shopping cart" one). */
async function openCart(api: CatalogApi, now: Date): Promise<string | null> {
  const today = vancouverToday(now);
  const history = await api.post<{ orders?: Array<{ orderHeader?: Row }> }>("order/history", {
    searchAll: "",
    orderNumber: "",
    orderStatus: "All",
    comment: "",
    productCode: "",
    fromDate: today,
    toDate: today,
    pageSize: 50,
    pageNumber: 1,
    sortBy: "",
    sortSequence: "",
    includeLastUpdateDateInFilter: false,
  });
  const carts = (history.orders ?? []).map((o) => o.orderHeader ?? {}).filter((h) => h.orderStatusDescription === "In shopping cart" && h.orderNumber);
  carts.sort((a, b) => Number(b.modifiedTimeMS ?? 0) - Number(a.modifiedTimeMS ?? 0));
  return carts[0] ? String(carts[0].orderNumber) : null;
}

const ok = (response: { status?: { code?: number } } | null) => response?.status?.code === 200;

/**
 * Adds the parts, priced fresh from speedDIAL (the line needs the current price-and-availability request),
 * to the open cart or a new one. `categoryCode` is the part's category ("N1000") and `vehicle` the car it was priced for.
 */
export async function addToWorldpacCart(api: CatalogApi, vehicle: VehicleRef, categoryCode: string, items: CartItem[], now = new Date()): Promise<CartResult> {
  if (items.length === 0 || items.length > 6) return { status: "failed", reason: "bad_request" };
  const pna = await api.post<PnaResponse>("pna360_cat", {
    attributes: vehicle.attributes.map((a) => ({ name: a.name, value: a.id })),
    partTypes: [{ requestedQuantity: 0, orderType: "ST", categoryCode, baseVehicleID: vehicle.baseVehicleId, positionID: -1 }],
  });
  const rows = (pna.quotes ?? []).flatMap((quote) => (quote.productQuotes ?? []).map((row) => ({ row, requestId: quote.PnARequestID })));
  const lines: Row[] = [];
  for (const item of items) {
    const wanted = item.partNumber.trim().toLowerCase();
    const matches = rows.filter(({ row }) => partNumberOf(row).toLowerCase() === wanted);
    if (matches.length === 0) return { status: "part_not_found", partNumber: item.partNumber };
    // The local warehouse with stock first: that is the row staff were quoted.
    const best = matches.find(({ row }) => /local/i.test(String(row.availability ?? "")) && Number(row.qtyAvailable) > 0) ?? matches[0];
    lines.push(orderLine(best.row, best.requestId, item.qty));
  }
  const existing = await openCart(api, now);
  if (existing) {
    const response = await api.post<{ status?: { code?: number } }>("order/addlines", lines, { orderNumber: existing });
    return ok(response) ? { status: "ok", orderNumber: existing, created: false } : { status: "failed", reason: "addlines" };
  }
  const response = await api.post<{ status?: { code?: number }; order?: { orderHeader?: Row; orderNumber?: string } }>("createorder", lines, { orderType: "ST" });
  const orderNumber = String(response.order?.orderHeader?.orderNumber ?? response.order?.orderNumber ?? "");
  return ok(response) && orderNumber ? { status: "ok", orderNumber, created: true } : { status: "failed", reason: "createorder" };
}

/** Removes a whole cart order (used by tests of this module against the real account; never by the workbench). */
export async function deleteWorldpacCartOrder(api: CatalogApi, orderNumber: string): Promise<boolean> {
  const response = await api.post<{ status?: { code?: number } }>("order/delete", { orderNumber });
  return ok(response);
}
