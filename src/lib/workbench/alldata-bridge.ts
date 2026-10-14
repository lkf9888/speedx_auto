/**
 * Talks to the SPEEDX ALLDATA extension (extensions/alldata-bridge) from the
 * workbench page. The extension's content script relays each request to the
 * staff member's own signed-in ALLDATA tab and posts the answer back. The
 * protocol is window.postMessage on the page's own origin.
 */

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

export interface BridgeOps {
  status: { args: Record<string, never>; result: { version: string; signedIn: boolean } };
  searchDocuments: { args: { search: string }; result: { documents: AlldataDocumentRow[] } };
  searchCustomers: { args: { search: string }; result: { customers: AlldataCustomerRow[] } };
  createEstimate: {
    args: {
      customerId: number | null;
      customerVehicleId: number | null;
      mileageIn: number | null;
      shopNote: string;
      datalines: Record<string, unknown>[];
    };
    result: { documentId: number; estimateNumber: number; customerAttached: boolean };
  };
  openPdf: { args: { documentId: number; documentType: AlldataDocumentType }; result: { opened: true } };
}

export type BridgeErrorCode = "not_installed" | "not_signed_in" | "timeout" | "alldata_error" | "bad_request";

export class BridgeError extends Error {
  constructor(readonly code: BridgeErrorCode, message: string = code) {
    super(message);
    this.name = "BridgeError";
  }
}

export const BRIDGE_ERRORS: Record<BridgeErrorCode, string> = {
  not_installed: "这台电脑还没装 SPEEDX ALLDATA 扩展，或扩展没启用。",
  not_signed_in: "这台电脑的 Chrome 没登录 ALLDATA，请先打开 my.alldata.com 登录。",
  timeout: "ALLDATA 没有回应，请确认 ALLDATA 页面能正常打开后再试。",
  alldata_error: "ALLDATA 拒绝了这次操作。",
  bad_request: "请求内容不完整。",
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
