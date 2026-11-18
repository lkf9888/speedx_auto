/**
 * Talks to the SPEEDX ALLDATA extension (extensions/alldata-bridge) from the
 * workbench page. The extension's content script relays each request to the
 * staff member's own signed-in ALLDATA tab and posts the answer back. The
 * protocol is window.postMessage on the page's own origin.
 */

import type { WestcanLookup } from "@/lib/westcan/nexpart";
import type { AlldataReadback } from "./alldata-readback";
import type { Taxes, SaveEdits } from "./alldata-change";

export const BRIDGE_CHANNEL = "speedx-alldata";

export type AlldataDocumentType = "Estimate" | "RepairOrder" | "Invoice";

export interface AlldataDocumentRow {
  documentId: number;
  number: number;
  /** Draft, Estimate, Repair Order, Invoice. */
  state: string;
  voided: boolean;
  customerName: string;
  vehicle: string;
  updatedOn: number;
  /** Which PDFs exist for this document. */
  printable: AlldataDocumentType[];
}

export interface AlldataCustomerRow {
  customerId: number;
  name: string;
  phone: string;
  vehicles: Array<{ customerVehicleId: number; description: string; vin: string }>;
}

/** One part as Westcan's Nexpart catalog lists it (strings as Nexpart sends them; the server checks them). */
export interface WestcanRow {
  brand: string;
  partNumber: string;
  partType: string;
  position: string;
  description: string;
  /** Our cost and Westcan's list price, e.g. "43.52"; empty when not priced (special orders). */
  cost: string;
  list: string;
  /** Units at our branch (W.C Richmond) and at Westcan's other branches. */
  stockHere: number;
  stockOther: number;
  branch: string;
  eta: string;
  specialOrder: boolean;
  perCar: string;
}

export type WestcanSearchResult =
  | { status: "ok"; vehicle: string; rows: WestcanRow[] }
  | { status: "need_engine" | "no_vehicle"; engines: string[] };

export interface CreateDocumentArgs {
  customerId: number | null;
  customerVehicleId: number | null;
  mileageIn: number | null;
  shopNote: string;
  datalines: Record<string, unknown>[];
}

export interface BridgeOps {
  status: { args: Record<string, never>; result: { version: string; signedIn: boolean } };
  searchDocuments: { args: { search: string }; result: { documents: AlldataDocumentRow[] } };
  searchCustomers: { args: { search: string }; result: { customers: AlldataCustomerRow[] } };
  createEstimate: { args: CreateDocumentArgs; result: { documentId: number; estimateNumber: number; customerAttached: boolean; markupSaved?: boolean } };
  /** Saves a Draft only (document number 0, no number taken); the staff member decides later whether it becomes an estimate. */
  createDraft: { args: CreateDocumentArgs; result: { documentId: number; estimateNumber: 0; customerAttached: boolean; markupSaved?: boolean } };
  /** One document as ALLDATA has it now, without customer details; used to check what was created. */
  readDocument: { args: { documentId: number }; result: AlldataReadback };
  /** The tax switches in ALLDATA Settings (PST is turned on and off there by staff, and every save is taxed by them). */
  readTaxSettings: { args: Record<string, never>; result: Taxes };
  /**
   * Saves changes to a Draft or an Estimate. Refused when the document is an invoice, voided, or changed since expectedVersion,
   * or when the tax switches in ALLDATA Settings are no longer the ones the change was measured with (expectedTaxes).
   * customerId changes the customer (and vehicle) the document is filed under.
   */
  saveDocument: {
    args: { documentId: number; expectedVersion: number; expectedTaxes: Taxes; edits: SaveEdits; customerId?: number; customerVehicleId?: number | null };
    result: { documentId: number; version: number; markupSaved: boolean };
  };
  /** Draft → estimate (takes a document number), or → invoice, which only works with confirm = `invoice:<id>:<version>` and can never be undone. */
  convertDocument: {
    args: { documentId: number; expectedVersion: number; to: "estimate" | "invoice"; confirm?: string };
    result: { documentId: number; state: string; documentNumber: number };
  };
  openPdf: { args: { documentId: number; documentType: AlldataDocumentType }; result: { opened: true } };
  westcanSearch: { args: WestcanLookup; result: WestcanSearchResult };
  /** Westcan or Lordco: one part into the seller's Nexpart cart (never an order). */
  cartAdd: { args: { supplier: CartSupplier; partNumber: string; qty: number }; result: CartAddResult };
}

export type CartSupplier = "westcan" | "lordco";

export type CartAddResult =
  | { status: "ok"; cartBefore: number; cartAfter: number }
  | { status: "not_signed_in" | "not_found" | "not_added" | "page_changed" | "bad_request"; note?: string; cartBefore?: number };

export const CART_URLS: Record<CartSupplier, string> = {
  westcan: "https://3501660.nexpart.com/cart.php",
  lordco: "https://1000027.nexpart.com/cart.php",
};

export type BridgeErrorCode = "document_locked" | "document_changed" | "not_installed" | "not_signed_in" | "timeout" | "alldata_error" | "bad_request" | "westcan_not_signed_in" | "westcan_error" | "nexpart_error";

export class BridgeError extends Error {
  constructor(readonly code: BridgeErrorCode, message: string = code) {
    super(message);
    this.name = "BridgeError";
  }
}

export const BRIDGE_ERRORS: Record<BridgeErrorCode, string> = {
  document_locked: "这张单在 ALLDATA 里已经锁定（发票或已作废），不能修改。",
  document_changed: "这张单在你查看之后被别人改过了，请重新打开再改。",
  not_installed: "这台电脑还没装 SPEEDX ALLDATA 扩展，或扩展没启用。",
  not_signed_in: "这台电脑的 Chrome 没登录 ALLDATA，请先打开 my.alldata.com 登录。",
  timeout: "ALLDATA 没有回应，请确认 ALLDATA 页面能正常打开后再试。",
  alldata_error: "ALLDATA 拒绝了这次操作。",
  bad_request: "请求内容不完整。",
  westcan_not_signed_in: "这台电脑的 Chrome 没登录 Westcan（Nexpart），请先打开 3501660.nexpart.com 登录。",
  westcan_error: "Westcan（Nexpart）没有正常回应。",
  nexpart_error: "Nexpart（Westcan / Lordco）页面没有正常回应，或这个扩展还没拿到 Lordco 的新权限（到 chrome://extensions 刷新扩展并同意权限）。",
};

let counter = 0;
let installed: Promise<boolean> | null = null;

function post(message: Record<string, unknown>) {
  window.postMessage({ channel: BRIDGE_CHANNEL, ...message }, window.location.origin);
}

/** Wait for one reply from the extension's content script, or null after the timeout. */
function reply(id: string, direction: "pong" | "response", timeoutMs: number): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(null);
    }, timeoutMs);
    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data as Record<string, unknown> | null;
      if (data?.channel !== BRIDGE_CHANNEL || data.direction !== direction || data.id !== id) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(data);
    }
    window.addEventListener("message", onMessage);
  });
}

const nextId = () => `${Date.now().toString(36)}-${(counter += 1)}`;

/** Whether the extension answers on this page. A yes is remembered; a no is asked again next time. */
export function bridgeInstalled(timeoutMs = 1500): Promise<boolean> {
  if (!installed) {
    const id = nextId();
    const answer = reply(id, "pong", timeoutMs);
    post({ direction: "ping", id });
    installed = answer.then((data) => {
      if (!data) installed = null;
      return Boolean(data);
    });
  }
  return installed;
}

/** Forget the cached answer (tests). */
export function resetBridge() {
  installed = null;
}

export async function callAlldata<K extends keyof BridgeOps>(op: K, args: BridgeOps[K]["args"], timeoutMs = 45_000): Promise<BridgeOps[K]["result"]> {
  if (!(await bridgeInstalled())) throw new BridgeError("not_installed");
  const id = nextId();
  const answer = reply(id, "response", timeoutMs);
  post({ direction: "request", id, op, args });
  const data = (await answer) as { ok?: boolean; result?: unknown; error?: { code?: BridgeErrorCode; message?: string } } | null;
  if (!data) throw new BridgeError("timeout");
  if (data.ok) return data.result as BridgeOps[K]["result"];
  const code: BridgeErrorCode = data.error?.code && data.error.code in BRIDGE_ERRORS ? data.error.code : "alldata_error";
  throw new BridgeError(code, data.error?.message ?? "");
}

/** A staff-readable message for any bridge failure. */
export function bridgeErrorText(error: unknown): string {
  if (error instanceof BridgeError) {
    const base = BRIDGE_ERRORS[error.code];
    return error.code === "alldata_error" && error.message && error.message !== error.code ? `${base}（${error.message}）` : base;
  }
  return BRIDGE_ERRORS.alldata_error;
}
