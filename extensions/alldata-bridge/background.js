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

/** Runs inside the ALLDATA page: one same-origin request, as the Shop Manager app makes it. `body` is null for none. */
async function pageRequest(method, path, body, contentType) {
  const headers = { Accept: "application/json, text/plain, */*" };
  if (body !== null) headers["Content-Type"] = contentType;
  const response = await fetch(path, {
    method,
    headers,
    credentials: "include",
    body: body === null ? undefined : contentType === "application/json" ? JSON.stringify(body) : body,
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

async function request(method, path, body = null, contentType = "application/json") {
  const tabId = await alldataTab();
  // executeScript only passes JSON-serializable arguments: no undefined.
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

// ------------------------------------------------------------------ Westcan (Nexpart)
//
// Westcan Auto Parts sells through Nexpart. The workbench asks for one job's
// parts (vehicle + part type + position); the lookup runs as same-origin
// requests in this computer's own signed-in Nexpart tab, the way Nexpart's
// catalog page makes them. Nothing is ordered and nothing is stored.

const NEXPART = "https://3501660.nexpart.com";
const NEXPART_CATALOG = `${NEXPART}/acesCat.php?glsId=aces`;

/** A loaded tab on Westcan's own Nexpart site (another seller's Nexpart would be another store). */
async function nexpartTab() {
  const tabs = await chrome.tabs.query({ url: `${NEXPART}/*` });
  const ready = tabs.find((t) => t.status === "complete");
  if (ready) return ready.id;
  if (tabs[0]) {
    await waitForLoad(tabs[0].id);
    return tabs[0].id;
  }
  const tab = await chrome.tabs.create({ url: NEXPART_CATALOG, active: false });
  await waitForLoad(tab.id);
  return tab.id;
}

/** Runs inside the Nexpart page: vehicle → engine/trim → parts, as the catalog page asks for them. */
async function nexpartSearch(q) {
  const meta = document.querySelector("meta[name=csrf-token]");
  if (!meta || !meta.content || /login|signin/i.test(location.pathname)) return { status: "not_signed_in" };
  const token = meta.content;
  const post = async (url, params) => {
    const r = await fetch(`${url}?r=${Date.now()}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest", "x-csrf-token": token },
      body: new URLSearchParams(params).toString(),
    });
    const t = await r.text();
    try {
      return JSON.parse(t);
    } catch {
      return { __html: /log ?in|sign ?in|password/i.test(t) ? "login" : "other" };
    }
  };
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();
  // "2.5 L4" ~ "2.5L L4"; turbo only when both say so.
  const engineScore = (want, desc) => {
    const w = norm(want), d = norm(desc);
    if (!w) return 0;
    const disp = w.match(/(\d\.\d)/), cyl = w.match(/\b([lvhw]\d{1,2})\b/);
    let score = 0;
    if (disp && d.includes(disp[1])) score += 2;
    if (cyl && new RegExp(`\\b${cyl[1]}\\b`).test(d)) score += 1;
    if (/turbo/.test(w) === /turbo/.test(d)) score += 0.5;
    // A hybrid only when WorldPac says hybrid ("2.5L L4" over "2.5L L4 FULL HYBRID").
    if (/hybrid|phev|fhev|electric/.test(w) === /hybrid|phev|fhev|electric/.test(d)) score += 0.5;
    return score;
  };
  let picked = null;
  let engineList = [];
  for (const model of q.models) {
    const eng = await post("acesCatalogYmmeAjax.php", { ajaxCall: "json", year: String(q.year), make: String(q.makeId), model: String(model.id), catTypeId: "8" });
    if (eng && eng.__html === "login") return { status: "not_signed_in" };
    const engines = Object.entries((eng && eng.engines) || {}).filter(([id]) => id !== "0");
    if (engines.length === 0) continue;
    engineList = engines.map(([, e]) => e.desc);
    const ranked = engines.map(([id, e]) => ({ id, e, score: engineScore(q.engine, e.desc) })).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    // Several engines and no way to tell them apart: the staff member names the engine.
    if (engines.length > 1 && (best.score < 2 || (ranked[1] && ranked[1].score === best.score))) return { status: "need_engine", engines: engineList.slice(0, 8) };
    const subs = Object.entries(best.e.submodels || {});
    const sub = subs.find(([, name]) => q.submodel && norm(name) === norm(q.submodel)) || subs[0] || ["", ""];
    picked = { model, engineId: best.id, engine: best.e.desc, subId: sub[0], subName: sub[1] };
    break;
  }
  if (!picked) return { status: "no_vehicle", engines: engineList };
  const veh = await post("acesCatalogYmmeAjax.php", {
    ajaxCall: "json", ymmeMode: "doContinue", selYear: String(q.year), selMakeId: String(q.makeId), selMake: q.make, selModelId: String(picked.model.id), selModel: q.model,
    selVehType: String(picked.model.vehType), selSubModelId: picked.subId, selSubModel: picked.subName, selEngineId: picked.engineId, selEngine: picked.engine,
    selVin: "", selPlate: "", selState: "", selRoNum: "0", selRoBrId: "0", catTypeId: "8",
  });
  if (!veh || !veh.BaseVehId) return { status: "no_vehicle", engines: engineList };
  const cat = await post("acesCatalogResults.php", {
    ajaxCall: "json", getCatData: "1", mode: "part", sort: "bestMatch ASC", limit: "50", lookupType: "parts", logPartTypes: "1",
    baseVid: String(veh.BaseVehId), vid: String(veh.VehicleId), vidDesc: "", vin: "", state: "", plate: "",
    year: String(q.year), make: String(q.makeId), makeDesc: q.make, model: String(picked.model.id), modelDesc: q.model, vehType: String(picked.model.vehType),
    trim: picked.subId, trimDesc: picked.subName, engine: picked.engineId, engineDesc: picked.engine, udcfId: "1130",
    ptypes: JSON.stringify(q.partTypes), usgs: JSON.stringify(q.usages), usgNames: "[]", sources: '["partSearch"]', datetime: "", resultView: "gallery", isSmartSearch: "0", msPartTypeId: "0",
  });
  const vehicle = `${q.year} ${q.make} ${q.model} ${picked.subName} ${picked.engine}`.replace(/\s+/g, " ").trim();
  if (!cat || !cat.part_count) return { status: "ok", vehicle, rows: [] };
  const items = await post("acesCatalogResults.php", { limit: "50", offset: "0", offset_page: "0", offset_start: "0", resultView: "gallery", baseSellerId: "0" });
  const s = (v, max = 120) => (v === null || v === undefined ? "" : String(v).slice(0, max));
  const rows = (Array.isArray(items) ? items : []).slice(0, 50).map((i) => ({
    brand: s(i.mfgName, 80),
    partNumber: s(i.partNumber, 40),
    partType: s(i.partType, 10),
    position: Array.isArray(i.position) ? i.position.map((p) => s(p, 30)).join(", ") : s(i.position, 60),
    description: s(i.description),
    cost: s(i.priceCost, 20),
    list: s(i.priceList || i.listPrice, 20),
    stockHere: Number(i.stockQtyPri) || 0,
    stockOther: Number(i.stockQtyOthers) || 0,
    branch: s(i.branchName, 60),
    eta: s(i.commentETA, 60),
    specialOrder: String(i.isSpecialOrder) === "1",
    perCar: s(i.perVeh || i.qtypv, 6),
  }));
  return { status: "ok", vehicle, rows };
}

// One lookup at a time: Nexpart keeps the current search in the session, so
// two at once would read each other's parts.
let westcanQueue = Promise.resolve();

function westcanSearch(args) {
  const run = westcanQueue.then(() => westcanSearchNow(args));
  westcanQueue = run.catch(() => undefined);
  return run;
}

async function westcanSearchNow(args) {
  const year = positiveInt(args.year);
  const makeId = positiveInt(args.makeId);
  const models = (Array.isArray(args.models) ? args.models : []).slice(0, 4).filter((m) => m && positiveInt(m.id) && positiveInt(m.vehType));
  const partTypes = (Array.isArray(args.partTypes) ? args.partTypes : []).filter(positiveInt).slice(0, 4);
  const usages = (Array.isArray(args.usages) ? args.usages : []).filter(positiveInt).slice(0, 8);
  if (!year || !makeId || models.length === 0 || partTypes.length === 0) throw new BridgeError("bad_request", "bad lookup");
  const query = { year, makeId, make: text(args.make, 60), model: text(args.model, 60), models, engine: text(args.engine, 60), submodel: text(args.submodel, 60), partTypes, usages };
  const tabId = await nexpartTab();
  const [run] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: nexpartSearch, args: [query] });
  const result = run && run.result;
  if (!result) throw new BridgeError("westcan_error", "no answer from the Nexpart page");
  if (result.status === "not_signed_in") throw new BridgeError("westcan_not_signed_in");
  return result;
}

// ------------------------------------------------------------------ add to cart (Westcan / Lordco)

const NEXPART_SELLERS = { westcan: "https://3501660.nexpart.com", lordco: "https://1000027.nexpart.com" };

// Runs inside a Nexpart "Stock Check" page (Westcan or Lordco), signed in as the shop.
// Types the part number and quantity into the first Stock Check row, runs the stock check,
// then presses the page's own "Add to Cart". It never presses Buy Now or Place Order.
async function nexpartAddToCart(args) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (fn, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const value = fn();
      if (value) return value;
      await sleep(250);
    }
    return null;
  };
  const cartCount = () => Number((document.querySelector(".banner__cartQty") || {}).innerText) || 0;
  const setValue = (input, value) => {
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    for (const type of ["input", "keyup", "change"]) input.dispatchEvent(new Event(type, { bubbles: true }));
    input.blur();
  };
  const part = String(args.partNumber || "").trim();
  const qty = Math.max(1, Math.min(20, Number(args.qty) || 1));
  if (!part) return { status: "bad_request" };
  if (/login/i.test(location.pathname)) return { status: "not_signed_in" };
  const partInput = await waitFor(() => document.getElementById("PARTN_stockCheck1"), 15000);
  const qtyInput = document.getElementById("QTY_stockCheck1");
  if (!partInput || !qtyInput) return { status: /login/i.test(location.pathname) ? "not_signed_in" : "page_changed" };
  const before = cartCount();
  setValue(partInput, part);
  setValue(qtyInput, String(qty));
  const check = document.getElementById("StockCheckButtonTop");
  if (!check) return { status: "page_changed" };
  check.click();
  // The row for this part shows up with its price once the stock check has answered.
  const needle = part.toLowerCase();
  const shown = await waitFor(() => {
    const text = document.body.innerText.toLowerCase();
    return text.includes(needle) && /your price/i.test(document.body.innerText) ? text : null;
  }, 15000);
  if (!shown) {
    const message = /not found|invalid|no match|not available|could not/i.exec(document.body.innerText);
    return { status: "not_found", note: message ? message[0] : "" };
  }
  await sleep(500);
  const add = [...document.querySelectorAll(".addToCartBtn__stock")].find((el) => el.offsetParent);
  if (!add) return { status: "page_changed" };
  add.click();
  const grew = await waitFor(() => (cartCount() > before ? cartCount() : null), 12000);
  if (!grew) return { status: "not_added", cartBefore: before };
  return { status: "ok", cartBefore: before, cartAfter: grew };
}

// One cart change at a time, each in its own background tab so the staff member's own tabs are left alone.
let cartQueue = Promise.resolve();

function cartAdd(args) {
  const run = cartQueue.then(() => cartAddNow(args));
  cartQueue = run.catch(() => undefined);
  return run;
}

/** Adds one part to the seller's Nexpart cart. Never places an order. */
async function cartAddNow(args) {
  const origin = NEXPART_SELLERS[args.supplier];
  const part = text(args.partNumber, 40);
  const qty = positiveInt(args.qty);
  if (!origin || !/^[A-Za-z0-9][A-Za-z0-9 ._\/-]{1,39}$/.test(part) || !qty || qty > 20) throw new BridgeError("bad_request", "bad cart request");
  const tab = await chrome.tabs.create({ url: `${origin}/ts2orderparts.php`, active: false });
  try {
    await waitForLoad(tab.id);
    const [run] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: nexpartAddToCart, args: [{ partNumber: part, qty }] });
    const result = run && run.result;
    if (!result) throw new BridgeError("westcan_error", "no answer from the Nexpart page");
    return result;
  } finally {
    try {
      await chrome.tabs.remove(tab.id);
    } catch {
      // The tab is already gone.
    }
  }
}

const OPS = { status, searchDocuments, searchCustomers, createEstimate, openPdf, westcanSearch, cartAdd };
