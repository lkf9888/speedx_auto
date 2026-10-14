// SPEEDX ALLDATA 助手 — background worker.
//
// The repair workbench (repair.speedxrental.com) asks for a small, fixed set
// of ALLDATA Shop Manager operations. Each one runs as a same-origin request
// inside this computer's own signed-in my.alldata.com tab, exactly like the
// Shop Manager web app's own requests. The extension never sees or stores the
// ALLDATA password, and it does nothing unless a staff member acts in the
// workbench.

const ALLDATA = "https://my.alldata.com";
const SHOPMGR = "/ADAG/shopmgr/";
const ALLOWED_PAGES = [/^https:\/\/repair\.speedxrental\.com\//, /^http:\/\/localhost(:\d+)?\//];

// The shop's defaults in ALLDATA (same as its "Create New Document" button): technician Jason, service writer Kevin.
const DEFAULT_TECHNICIAN_ID = 270227;
const DEFAULT_SERVICE_WRITER_ID = 276708;
const PDF_TYPES = ["Estimate", "RepairOrder", "Invoice"];
const MAX_LINES = 40;

class BridgeError extends Error {
  constructor(code, message = "") {
    super(message);
    this.code = code;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !sender.url || !ALLOWED_PAGES.some((page) => page.test(sender.url))) return false;
  const op = OPS[message && message.op];
  if (!op) {
    sendResponse({ ok: false, error: { code: "bad_request", message: "unknown operation" } });
    return false;
  }
  op(message.args || {}).then(
    (result) => sendResponse({ ok: true, result }),
    (error) =>
      sendResponse({
        ok: false,
        error: { code: error instanceof BridgeError ? error.code : "alldata_error", message: String((error && error.message) || "").slice(0, 200) },
      }),
  );
  return true;
});

// ------------------------------------------------------------------ ALLDATA tab

function waitForLoad(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new BridgeError("timeout", "ALLDATA page did not load"));
    }, timeoutMs);
    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/** A loaded my.alldata.com tab; opens one in the background when there is none. */
async function alldataTab() {
  const tabs = await chrome.tabs.query({ url: `${ALLDATA}/*` });
  const ready = tabs.find((t) => t.status === "complete");
  if (ready) return ready.id;
  if (tabs[0]) {
    await waitForLoad(tabs[0].id);
    return tabs[0].id;
  }
  const tab = await chrome.tabs.create({ url: `${ALLDATA}/shop_manager/`, active: false });
  await waitForLoad(tab.id);
  return tab.id;
}

/** Runs inside the ALLDATA page: one same-origin request, as the Shop Manager app makes it. */
async function pageRequest(method, path, body, contentType) {
  const headers = { Accept: "application/json, text/plain, */*" };
  if (body !== undefined) headers["Content-Type"] = contentType;
  const response = await fetch(path, {
    method,
    headers,
    credentials: "include",
    body: body === undefined ? undefined : contentType === "application/json" ? JSON.stringify(body) : body,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text: json ? "" : text.slice(0, 300) };
}

async function request(method, path, body, contentType = "application/json") {
  const tabId = await alldataTab();
  const [run] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: pageRequest,
    args: [method, path, body, contentType],
  });
  const result = run && run.result;
  if (!result) throw new BridgeError("alldata_error", "no answer from the ALLDATA page");
  if (result.status === 401) throw new BridgeError("not_signed_in");
  if (result.status === 403 && result.json && result.json.url) throw new BridgeError("not_signed_in", "ALLDATA wants a human check; open ALLDATA in Chrome first");
  return result;
}

function ok(result, what) {
  if (result.status < 200 || result.status >= 300) {
    const detail = (result.json && (result.json.message || (result.json.error && result.json.error.message))) || result.text || "";
    throw new BridgeError("alldata_error", `${what} ${result.status} ${detail}`.trim());
  }
  return result.json;
}

// ------------------------------------------------------------------ operations

const text = (value, max = 120) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const positiveInt = (value) => (Number.isInteger(value) && value > 0 ? value : null);

function customerName(info) {
  if (!info) return "";
  const person = [info.firstName, info.lastName].filter(Boolean).join(" ").trim();
  return person || text(info.company) || "";
}

function customerPhone(info) {
  const methods = (info && Array.isArray(info.contactMethods) && info.contactMethods) || [];
  const phones = methods.filter((m) => m && /phone|mobile|cell|home|work/i.test(m.name || "") && /\d/.test(m.value || ""));
  const best = phones.find((m) => m.preferred) || phones[0];
  return best ? text(best.value, 40) : "";
}

async function status() {
  const profile = await request("GET", "/ADAG/sso/profile/v2");
  return { version: chrome.runtime.getManifest().version, signedIn: profile.status === 200 };
}

async function searchDocuments(args) {
  const params = new URLSearchParams({
    page: "0",
    paginationType: "slices",
    draft: "true",
    estimate: "true",
    repairOrder: "true",
    invoice: "true",
    open: "true",
    voided: "true",
    inProgress: "true",
    notStarted: "true",
    onHold: "true",
    complete: "true",
    sort: "update date desc",
  });
  const search = text(args.search, 80);
  if (search) params.set("search", search);
  const json = ok(await request("GET", `${SHOPMGR}documents?${params}`), "document search");
  const documents = ((json && json.documents) || []).slice(0, 25).map((d) => {
    const states = d.documentStates || {};
    const printable = [];
    if (states.estimate && states.estimate.available) printable.push("Estimate");
    if (states.repairOrder && states.repairOrder.available) printable.push("RepairOrder");
    if (states.invoice && states.invoice.available) printable.push("Invoice");
    return {
      documentId: d.documentId,
      number: d.documentNumber,
      state: text(d.state, 30),
      voided: Boolean((states.estimate && states.estimate.voided) || (states.invoice && states.invoice.isVoided)),
      customerName: text(d.customerName),
      vehicle: text(d.vehicleName),
      updatedOn: d.updatedOn || d.createdOn || 0,
      printable,
    };
  });
  return { documents };
}

async function searchCustomers(args) {
  const search = text(args.search, 80);
  if (!search) throw new BridgeError("bad_request", "empty search");
  const params = new URLSearchParams({ search, withVehicles: "true", pageSize: "20", page: "0" });
  const json = ok(await request("GET", `${SHOPMGR}customers?${params}`), "customer search");
  const customers = ((json && json.customers) || []).map((c) => ({
    customerId: c.customerId,
    name: customerName(c.customerInfo),
    phone: customerPhone(c.customerInfo),
    vehicles: (c.vehicles || []).map((v) => ({
      customerVehicleId: v.vehicleId,
      description: [v.year, v.make, v.model, v.engine].filter(Boolean).join(" "),
      vin: text(v.vin, 17),
    })),
  }));
  return { customers };
}

/** The estimate's vehicle block, built the way Shop Manager builds it from a customer's saved vehicle. */
function vehicleInformation(saved) {
  const v = saved.vehicle || {};
  const info = {
    year: v.year || null,
    make: v.make,
    model: v.model,
    engine: v.engine,
    color: saved.color,
    vin: saved.vin,
    alldataId: v.alldataId,
    vehicleAutoZoneId: v.autozoneId,
    licenseCountry: saved.licenseCountry,
    licensePlate: saved.licensePlate,
    licenseState: saved.licenseState,
    description: saved.description,
    customerVehicleId: saved.customerVehicleId,
    updateMasterRecord: false,
    odometerCode: (saved.odometer && saved.odometer.code) || "KM",
    autozoneId: v.autozoneId,
    autozoneDescription: v.autozoneDescription,
  };
  if (saved.manualEntry) {
    return {
      ...info,
      manualEntry: true,
      description: [v.year, v.make, v.model].join(" ").trim(),
      nonAcesTrimDesc: v.nonAcesTrimDesc,
      nonAcesFuelTypeName: v.nonAcesFuelTypeName,
      nonAcesTransmissionCode: v.nonAcesTransmissionCode,
      nonAcesBodyTypeName: v.nonAcesBodyTypeName,
    };
  }
  if (v.acesVehicleId) {
    return {
      ...info,
      acesVehicleId: v.acesVehicleId,
      acesEngineId: v.acesEngineId,
      acesVehToEngCfgId: v.acesVehToEngCfgId,
      acesTransmissionId: v.acesTransmission && v.acesTransmission.id,
      acesBodyConfigId: v.acesBodyConfig && v.acesBodyConfig.id,
      acesTrimDesc: v.acesTrimDesc,
    };
  }
  return info;
}

/** A vehicle from the customer's vehicle list (flat shape), in the customer record's shape. */
function savedFromList(v) {
  return {
    customerVehicleId: v.vehicleId,
    description: v.acesDescription || [v.year, v.make, v.model, v.engine].filter(Boolean).join(" "),
    vin: v.vin,
    licensePlate: v.licensePlate,
    licenseState: v.licenseState,
    licenseCountry: v.licenseCountry,
    odometer: { code: v.odometer || "KM" },
    color: v.color,
    manualEntry: Boolean(v.manualEntry),
    vehicle: {
      year: v.year,
      make: v.make,
      model: v.model,
      engine: v.engine,
      alldataId: v.alldataId,
      autozoneId: v.autozoneId,
      autozoneDescription: v.autozoneDescription,
      acesVehicleId: v.acesVehicleId,
      acesEngineId: v.acesEngineId,
      acesVehToEngCfgId: v.acesVehicleToEngineConfigId,
      acesTransmission: v.acesTransmissionId ? { id: v.acesTransmissionId } : null,
      acesBodyConfig: v.acesBodyConfigId ? { id: v.acesBodyConfigId } : null,
      acesTrimDesc: v.acesTrimDesc,
      nonAcesTrimDesc: v.nonAcesTrimDesc,
      nonAcesFuelTypeName: v.nonAcesFuelTypeName,
      nonAcesTransmissionCode: v.nonAcesTransmissionCode,
      nonAcesBodyTypeName: v.nonAcesBodyTypeName,
    },
  };
}

/** The customer's saved vehicle. The customer record embeds only the first few; fleets need the vehicle list. */
async function findSavedVehicle(customerId, full, customerVehicleId) {
  if (!customerVehicleId) return null;
  const embedded = (full.vehicles || []).find((v) => v.customerVehicleId === customerVehicleId);
  if (embedded) return embedded;
  for (let page = 0; page < 40; page += 1) {
    const json = ok(await request("GET", `${SHOPMGR}customers/${customerId}/vehicles?pageSize=10&page=${page}`), "vehicle list");
    const vehicles = (json && json.vehicles) || [];
    const match = vehicles.find((v) => v.vehicleId === customerVehicleId);
    if (match) return savedFromList(match);
    if (vehicles.length < 10) break;
  }
  return null;
}

function checkDatalines(lines) {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > MAX_LINES) throw new BridgeError("bad_request", "bad line count");
  for (const line of lines) {
    const fine =
      line &&
      (line.lineTypeId === 5 || line.lineTypeId === 6) &&
      typeof line.description === "string" &&
      Number.isFinite(line.quantityOrHours) &&
      Number.isFinite(line.priceRate) &&
      Number.isFinite(line.total);
    if (!fine) throw new BridgeError("bad_request", "bad line");
  }
  return lines;
}

async function createEstimate(args) {
  const datalines = checkDatalines(args.datalines);
  const customerId = positiveInt(args.customerId);
  const customerVehicleId = positiveInt(args.customerVehicleId);
  const mileage = Number.isFinite(args.mileageIn) && args.mileageIn > 0 ? Math.round(args.mileageIn) : 0;

  let customer = null;
  let vehicle = {};
  if (customerId) {
    const full = ok(await request("GET", `${SHOPMGR}customers/${customerId}`), "customer lookup");
    const saved = await findSavedVehicle(customerId, full, customerVehicleId);
    // The document carries the customer record itself, as Shop Manager sends it.
    customer = { ...full };
    delete customer.vehicles;
    delete customer._links;
    delete customer._embedded;
    if (saved) vehicle = vehicleInformation(saved);
  }

  const document = (withCustomer) => ({
    customer: withCustomer ? customer : null,
    vehicleInformation: withCustomer ? vehicle : {},
    mileageIn: String(withCustomer ? mileage : 0),
    mileageOut: "0",
    serviceTag: null,
    datalines,
    technicianId: DEFAULT_TECHNICIAN_ID,
    serviceWriterId: DEFAULT_SERVICE_WRITER_ID,
    proposedCompletionDate: null,
    shopNote: text(args.shopNote, 500) || null,
  });

  let created = await request("POST", `${SHOPMGR}documents?is_draft=true`, document(Boolean(customer)));
  let customerAttached = Boolean(customer);
  if (customer && (created.status < 200 || created.status >= 300)) {
    // ALLDATA refused the customer block: create the estimate without it; staff add the customer in ALLDATA.
    created = await request("POST", `${SHOPMGR}documents?is_draft=true`, document(false));
    customerAttached = false;
  }
  const draft = ok(created, "create");
  const documentId = draft.documentId;
  const converted = await request("PUT", `${SHOPMGR}documents/${documentId}/state`, "estimate", "text/plain");
  const estimate = converted.status >= 200 && converted.status < 300 ? converted.json : null;
  return { documentId, estimateNumber: (estimate && estimate.estimateNumber) || 0, customerAttached };
}

async function openPdf(args) {
  const documentId = positiveInt(args.documentId);
  if (!documentId || !PDF_TYPES.includes(args.documentType)) throw new BridgeError("bad_request", "bad document");
  const params = new URLSearchParams({ timezone: "America/Vancouver", documentType: args.documentType });
  await chrome.tabs.create({ url: `${ALLDATA}${SHOPMGR}documents/${documentId}/pdf?${params}`, active: true });
  return { opened: true };
}

const OPS = { status, searchDocuments, searchCustomers, createEstimate, openPdf };
