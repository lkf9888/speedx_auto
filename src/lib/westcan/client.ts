/**
 * Server-side session against Westcan's Nexpart site (3501660.nexpart.com),
 * so a Westcan lookup doesn't depend on a staff computer's Chrome extension.
 * Same idea as the DT Tire client: sign in with the shop's own account from
 * env vars, keep the session cookies in memory, sign in again when it expires.
 *
 * Credentials come only from WESTCAN_USERNAME / WESTCAN_PASSWORD (set by Kevin
 * in Railway). Nothing here logs them and errors never echo request bodies.
 *
 * What this client never does: read an email for a verification code, imitate
 * a browser fingerprint, or keep retrying after a refusal. A wrong password or
 * a verification request is reported once and then left alone for a while, so
 * the shop's account can't be locked by a retry loop. The extension path stays
 * the fallback.
 */
import { CookieJar } from "@/lib/worldpac/client";
import type { WestcanLookup } from "./nexpart";

const ORIGIN = "https://3501660.nexpart.com";
const CATALOG = `${ORIGIN}/acesCat.php?glsId=aces`;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 8;
/** After a refusal (bad password, verification wanted) the account is left alone this long. */
const COOLDOWN_MS = 15 * 60 * 1000;
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** Why the server could not answer; the quote then falls back to staff's extension. */
export type WestcanServerStatus = "not_configured" | "login_failed" | "verification_required" | "error";

export class WestcanServerError extends Error {
  constructor(
    message: string,
    readonly status: WestcanServerStatus,
  ) {
    super(message);
    this.name = "WestcanServerError";
  }
}

/** Same shape the extension's westcanSearch answers with. */
export type WestcanSearchAnswer =
  | { status: "ok"; vehicle: string; rows: unknown[] }
  | { status: "need_engine" | "no_vehicle"; engines: string[] };

type FetchLike = typeof fetch;
type Params = Record<string, string>;

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();

/** "2.5 L4" ~ "2.5L L4"; turbo and hybrid only when both sides agree. */
export function engineScore(want: string, desc: string): number {
  const w = norm(want);
  const d = norm(desc);
  if (!w) return 0;
  const disp = w.match(/(\d\.\d)/);
  const cyl = w.match(/\b([lvhw]\d{1,2})\b/);
  let score = 0;
  if (disp && d.includes(disp[1])) score += 2;
  if (cyl && new RegExp(`\\b${cyl[1]}\\b`).test(d)) score += 1;
  if (/turbo/.test(w) === /turbo/.test(d)) score += 0.5;
  if (/hybrid|fhev|phev|hev/.test(w) === /hybrid|fhev|phev|hev/.test(d)) score += 0.5;
  return score;
}

const clip = (v: unknown, max = 120) => (v === null || v === undefined ? "" : String(v).slice(0, max));

export class WestcanClient {
  private readonly jar = new CookieJar();
  private csrf: string | null = null;
  private loginInFlight: Promise<void> | null = null;
  private refused: { at: number; error: WestcanServerError } | null = null;

  constructor(
    private readonly credentials: { username: string; password: string },
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  /** One Westcan lookup. Throws WestcanServerError when the server can't do it. */
  async search(lookup: WestcanLookup): Promise<WestcanSearchAnswer> {
    if (!this.csrf) await this.login();
    try {
      return await this.run(lookup);
    } catch (error) {
      if (!(error instanceof SessionExpired)) throw error;
    }
    // Session expired: sign in again once.
    this.csrf = null;
    await this.login();
    try {
      return await this.run(lookup);
    } catch (error) {
      if (error instanceof SessionExpired) throw new WestcanServerError("Nexpart keeps asking to sign in", "login_failed");
      throw error;
    }
  }

  async login(): Promise<void> {
    if (!this.loginInFlight) {
      this.loginInFlight = this.performLogin().finally(() => {
        this.loginInFlight = null;
      });
    }
    return this.loginInFlight;
  }

  private async performLogin(): Promise<void> {
    const { username, password } = this.credentials;
    if (!username || !password) throw new WestcanServerError("WESTCAN_USERNAME / WESTCAN_PASSWORD are not set", "not_configured");
    // A refusal is remembered: no second attempt until the cooldown is over.
    if (this.refused && this.now() - this.refused.at < COOLDOWN_MS) throw this.refused.error;
    this.refused = null;
    this.jar.clear();
    this.csrf = null;
    try {
      await this.signIn(username, password);
    } catch (error) {
      if (error instanceof WestcanServerError && (error.status === "login_failed" || error.status === "verification_required")) {
        this.refused = { at: this.now(), error };
      }
      throw error;
    }
  }

  private async signIn(username: string, password: string): Promise<void> {
    // The login page sets the session cookie the form post needs.
    const page = await this.request(`${ORIGIN}/login-nexpart.html`, { headers: { Accept: "text/html" } });
    await page.body?.cancel();
    if (!page.ok) throw new WestcanServerError(`Nexpart login page returned ${page.status}`, "error");

    const form = new URLSearchParams({
      login_source: "nexpart",
      nexpartuname: username,
      pwd: password,
      language: "en",
      product: "1",
      return_url: "login-nexpart.html",
    });
    const post = await this.request(`${ORIGIN}/do_login.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "text/html", Origin: ORIGIN, Referer: `${ORIGIN}/login-nexpart.html` },
      body: form.toString(),
    });
    await post.body?.cancel();
    const location = post.headers.get("location") ?? "";
    if (post.status < 300 || post.status >= 400) throw new WestcanServerError(`Nexpart login returned ${post.status}`, "error");
    // A refusal sends us back to the login page with err=1 (checked live with a made-up account).
    if (/err=|red=failed/i.test(location)) throw new WestcanServerError("Nexpart rejected the username or password", "login_failed");
    if (VERIFICATION.test(location)) throw new WestcanServerError("Nexpart wants a verification step", "verification_required");
    await this.follow(new URL(location, ORIGIN).toString());

    // Signed in only when the catalog page hands out its security token.
    const catalog = await this.request(CATALOG, { headers: { Accept: "text/html" } });
    if (catalog.status >= 300 && catalog.status < 400) {
      const where = catalog.headers.get("location") ?? "";
      await catalog.body?.cancel();
      if (VERIFICATION.test(where)) throw new WestcanServerError("Nexpart wants a verification step", "verification_required");
      throw new WestcanServerError("Nexpart did not keep the session", "login_failed");
    }
    const html = await catalog.text();
    const token = html.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']csrf-token["']/i)?.[1];
    if (!token) {
      if (VERIFICATION.test(html.replace(/<script[\s\S]*?<\/script>/gi, "").slice(0, 200_000))) throw new WestcanServerError("Nexpart wants a verification step", "verification_required");
      throw new WestcanServerError("Nexpart did not give a security token after sign-in", "error");
    }
    this.csrf = token;
  }

  /** Follow the post-login redirects on Nexpart's own origin so the session cookies settle. */
  private async follow(start: string): Promise<void> {
    let url = start;
    for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
      if (new URL(url).origin !== ORIGIN) throw new WestcanServerError("Nexpart login redirected off-site", "error");
      const response = await this.request(url, { headers: { Accept: "text/html" } });
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (response.status >= 300 && response.status < 400 && location) {
        if (/err=|red=failed/i.test(location)) throw new WestcanServerError("Nexpart did not keep the session", "login_failed");
        if (VERIFICATION.test(location)) throw new WestcanServerError("Nexpart wants a verification step", "verification_required");
        url = new URL(location, url).toString();
        continue;
      }
      return;
    }
    throw new WestcanServerError("Nexpart login redirected too many times", "error");
  }

  /** One POST to a Nexpart catalog endpoint; throws SessionExpired when it answers with the login page. */
  private async post(path: string, params: Params): Promise<unknown> {
    const response = await this.request(`${ORIGIN}/${path}?r=${this.now()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "x-csrf-token": this.csrf ?? "",
        Origin: ORIGIN,
        Referer: CATALOG,
      },
      body: new URLSearchParams(params).toString(),
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new SessionExpired();
    }
    if (response.status === 401 || response.status === 403 || response.status === 419) {
      await response.body?.cancel();
      throw new SessionExpired();
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new WestcanServerError(`Nexpart ${path} returned ${response.status}`, "error");
    }
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      if (/log ?in|sign ?in|password/i.test(text)) throw new SessionExpired();
      throw new WestcanServerError(`Nexpart ${path} did not answer with data`, "error");
    }
  }

  /** The same four-step lookup the extension runs in the page. */
  private async run(q: WestcanLookup): Promise<WestcanSearchAnswer> {
    let picked: { model: { id: number; vehType: number }; engineId: string; engine: string; subId: string; subName: string } | null = null;
    let engineList: string[] = [];
    for (const model of q.models) {
      const eng = (await this.post("acesCatalogYmmeAjax.php", { ajaxCall: "json", year: String(q.year), make: String(q.makeId), model: String(model.id), catTypeId: "8" })) as {
        engines?: Record<string, { desc: string; submodels?: Record<string, string> }>;
      } | null;
      const engines = Object.entries(eng?.engines ?? {}).filter(([id]) => id !== "0");
      if (engines.length === 0) continue;
      engineList = engines.map(([, e]) => e.desc);
      const ranked = engines.map(([id, e]) => ({ id, e, score: engineScore(q.engine, e.desc) })).sort((a, b) => b.score - a.score);
      const best = ranked[0];
      // Several engines and no way to tell them apart: staff name the engine.
      if (engines.length > 1 && (best.score < 2 || (ranked[1] && ranked[1].score === best.score))) return { status: "need_engine", engines: engineList.slice(0, 8) };
      const subs = Object.entries(best.e.submodels ?? {});
      const sub = subs.find(([, name]) => q.submodel && norm(name) === norm(q.submodel)) ?? subs[0] ?? ["", ""];
      picked = { model, engineId: best.id, engine: best.e.desc, subId: sub[0], subName: sub[1] };
      break;
    }
    if (!picked) return { status: "no_vehicle", engines: engineList };
    const veh = (await this.post("acesCatalogYmmeAjax.php", {
      ajaxCall: "json",
      ymmeMode: "doContinue",
      selYear: String(q.year),
      selMakeId: String(q.makeId),
      selMake: q.make,
      selModelId: String(picked.model.id),
      selModel: q.model,
      selVehType: String(picked.model.vehType),
      selSubModelId: picked.subId,
      selSubModel: picked.subName,
      selEngineId: picked.engineId,
      selEngine: picked.engine,
      selVin: "",
      selPlate: "",
      selState: "",
      selRoNum: "0",
      selRoBrId: "0",
      catTypeId: "8",
    })) as { BaseVehId?: string | number; VehicleId?: string | number } | null;
    if (!veh?.BaseVehId) return { status: "no_vehicle", engines: engineList };
    const cat = (await this.post("acesCatalogResults.php", {
      ajaxCall: "json",
      getCatData: "1",
      mode: "part",
      sort: "bestMatch ASC",
      limit: "50",
      lookupType: "parts",
      logPartTypes: "1",
      baseVid: String(veh.BaseVehId),
      vid: String(veh.VehicleId),
      vidDesc: "",
      vin: "",
      state: "",
      plate: "",
      year: String(q.year),
      make: String(q.makeId),
      makeDesc: q.make,
      model: String(picked.model.id),
      modelDesc: q.model,
      vehType: String(picked.model.vehType),
      trim: picked.subId,
      trimDesc: picked.subName,
      engine: picked.engineId,
      engineDesc: picked.engine,
      udcfId: "1130",
      ptypes: JSON.stringify(q.partTypes),
      usgs: JSON.stringify(q.usages),
      usgNames: "[]",
      sources: '["partSearch"]',
      datetime: "",
      resultView: "gallery",
      isSmartSearch: "0",
      msPartTypeId: "0",
    })) as { part_count?: number } | null;
    const vehicle = `${q.year} ${q.make} ${q.model} ${picked.subName} ${picked.engine}`.replace(/\s+/g, " ").trim();
    if (!cat?.part_count) return { status: "ok", vehicle, rows: [] };
    const items = await this.post("acesCatalogResults.php", { limit: "50", offset: "0", offset_page: "0", offset_start: "0", resultView: "gallery", baseSellerId: "0" });
    const list = Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
    const rows = list.slice(0, 50).map((i) => ({
      brand: clip(i.mfgName, 80),
      partNumber: clip(i.partNumber, 40),
      partType: clip(i.partType, 10),
      position: Array.isArray(i.position) ? i.position.map((p) => clip(p, 30)).join(", ") : clip(i.position, 60),
      description: clip(i.description),
      cost: clip(i.priceCost, 20),
      list: clip(i.priceList || i.listPrice, 20),
      stockHere: Number(i.stockQtyPri) || 0,
      stockOther: Number(i.stockQtyOthers) || 0,
      branch: clip(i.branchName, 60),
      eta: clip(i.commentETA, 60),
      specialOrder: String(i.isSpecialOrder) === "1",
      perCar: clip(i.perVeh || i.qtypv, 6),
    }));
    return { status: "ok", vehicle, rows };
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, ...(init.headers as Record<string, string>), Cookie: this.jar.header(url) },
        redirect: "manual",
        signal: controller.signal,
      });
      this.jar.store(url, response.headers.getSetCookie());
      return response;
    } catch (error) {
      if (error instanceof WestcanServerError) throw error;
      throw new WestcanServerError(`Nexpart request failed: ${(error as Error).name}`, "error");
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Words in a redirect or page that mean Nexpart is asking for more than a password. */
const VERIFICATION = /verif|otp|2fa|mfa|two.?factor|one.?time|confirm.?(device|code)|new.?device|security.?code/i;

class SessionExpired extends Error {}

export function westcanServerConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.WESTCAN_USERNAME && env.WESTCAN_PASSWORD);
}

let shared: WestcanClient | null = null;

/** Process-wide client built from env vars; one Nexpart session shared by all staff. */
export function getWestcanClient(): WestcanClient {
  if (!shared) shared = new WestcanClient({ username: process.env.WESTCAN_USERNAME ?? "", password: process.env.WESTCAN_PASSWORD ?? "" });
  return shared;
}
