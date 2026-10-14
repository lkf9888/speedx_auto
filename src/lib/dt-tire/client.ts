/**
 * Server-side session against DT Tire Hub (dttirehub.ca), the shop's supplier
 * for international tire brands. It has no API: this client signs in through
 * the storefront's own login form (Spring Security + CSRF token) and reads the
 * tire-size search page, the same pages a staff member sees.
 *
 * Credentials come only from DT_TIRE_USERNAME / DT_TIRE_PASSWORD. Nothing here
 * logs them, and errors never echo request bodies.
 */
import { CookieJar } from "@/lib/worldpac/client";
import { isDtLoginPage, parseDtSearch, type DtSearchPage } from "./parse";

const DT_ORIGIN = "https://dttirehub.ca";
const STORE = "/touchettestorefront/touchette/en";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 8;
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export class DtTireError extends Error {
  constructor(
    message: string,
    readonly kind: "config" | "auth" | "http" | "upstream",
  ) {
    super(message);
    this.name = "DtTireError";
  }
}

/** DT's season filter values. SUMMER also returns all-season and all-weather tires; WINTER also returns all-weather. */
export type DtSeasonFilter = "ALL" | "SUMMER" | "WINTER" | "AW";

/** DT's sort options; this one lists tires in stock first, cheapest first. */
export const DT_SORT_IN_STOCK_CHEAPEST = "tsrpPriceAvailabilityAsc";

export interface DtSearch {
  size: string;
  season: DtSeasonFilter;
  brand?: string;
  sort?: string;
}

type FetchLike = typeof fetch;

export class DtTireClient {
  private readonly jar = new CookieJar();
  private signedIn = false;
  private loginInFlight: Promise<void> | null = null;

  constructor(
    private readonly credentials: { username: string; password: string },
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  /** First page of results (up to 30 tires) for one tire size. */
  async searchBySize(search: DtSearch): Promise<DtSearchPage> {
    if (!this.signedIn) await this.login();
    const html = await this.searchPage(search);
    if (html !== null) return parseDtSearch(html);
    // Session expired: sign in again once.
    this.signedIn = false;
    await this.login();
    const retry = await this.searchPage(search);
    if (retry === null) throw new DtTireError("DT Tire Hub keeps asking to sign in", "auth");
    return parseDtSearch(retry);
  }

  async login(): Promise<void> {
    if (!this.loginInFlight) {
      this.loginInFlight = this.performLogin().finally(() => {
        this.loginInFlight = null;
      });
    }
    return this.loginInFlight;
  }

  /** The search page's HTML, or null when DT sends us to the sign-in page. */
  private async searchPage(search: DtSearch): Promise<string | null> {
    const params = new URLSearchParams({
      tireSize: search.size,
      season: search.season,
      manufacturer: search.brand ?? "",
      sort: search.sort ?? DT_SORT_IN_STOCK_CHEAPEST,
    });
    const url = `${DT_ORIGIN}${STORE}/tireSearch/tire-size/search?${params}`;
    const response = await this.request(url, { headers: { Accept: "text/html" } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location") ?? "";
      if (/\/login/.test(location)) return null;
      throw new DtTireError(`DT search redirected unexpectedly (${response.status})`, "upstream");
    }
    if (!response.ok) throw new DtTireError(`DT search failed with ${response.status}`, "http");
    const html = await response.text();
    return isDtLoginPage(html) ? null : html;
  }

  private async performLogin(): Promise<void> {
    const { username, password } = this.credentials;
    if (!username || !password) throw new DtTireError("DT_TIRE_USERNAME / DT_TIRE_PASSWORD are not set", "config");
    this.jar.clear();
    this.signedIn = false;

    const loginUrl = `${DT_ORIGIN}${STORE}/login`;
    const page = await this.request(loginUrl, { headers: { Accept: "text/html" } });
    if (!page.ok) throw new DtTireError(`DT login page returned ${page.status}`, "upstream");
    const html = await page.text();
    const csrf = html.match(/<form id="loginForm"[\s\S]*?name="CSRFToken" value="([^"]+)"/)?.[1];
    if (!csrf) throw new DtTireError("DT login page has no CSRF token", "upstream");

    const form = new URLSearchParams({ j_username: username, j_password: password, userTimezone: "America/Vancouver", CSRFToken: csrf });
    const post = await this.request(`${DT_ORIGIN}${STORE}/j_spring_security_check`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "text/html", Origin: DT_ORIGIN, Referer: loginUrl },
      body: form.toString(),
    });
    const location = post.headers.get("location") ?? "";
    if (post.status < 300 || post.status >= 400) throw new DtTireError(`DT login returned ${post.status}`, "auth");
    if (/login\?error|\/login$/.test(location)) throw new DtTireError("DT Tire Hub rejected the username or password", "auth");
    await this.follow(new URL(location, DT_ORIGIN).toString());
    this.signedIn = true;
  }

  /** Follow the post-login redirects on DT's own origin so the session cookies settle. */
  private async follow(start: string): Promise<void> {
    let url = start;
    for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
      if (new URL(url).origin !== DT_ORIGIN) throw new DtTireError("DT login redirected off-site", "auth");
      const response = await this.request(url, { headers: { Accept: "text/html" } });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        if (/\/login/.test(location)) throw new DtTireError("DT Tire Hub did not keep the session", "auth");
        url = new URL(location, url).toString();
        continue;
      }
      await response.body?.cancel();
      return;
    }
    throw new DtTireError("DT login redirected too many times", "auth");
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
      if (error instanceof DtTireError) throw error;
      throw new DtTireError(`DT request failed: ${(error as Error).name}`, "upstream");
    } finally {
      clearTimeout(timer);
    }
  }
}

export function dtTireConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.DT_TIRE_USERNAME && env.DT_TIRE_PASSWORD);
}

let shared: DtTireClient | null = null;

/** Process-wide client built from env vars; one DT session shared by all staff. */
export function getDtTireClient(): DtTireClient {
  if (!shared) {
    shared = new DtTireClient({ username: process.env.DT_TIRE_USERNAME ?? "", password: process.env.DT_TIRE_PASSWORD ?? "" });
  }
  return shared;
}
