import { describe, expect, it, vi } from "vitest";
import { engineScore, LORDCO_ORIGIN, NexpartClient, WestcanClient, WestcanServerError } from "@/lib/westcan/client";
import type { WestcanLookup } from "@/lib/westcan/nexpart";
import { buildLaborQuote } from "@/lib/workbench/quote";
import { checkWestcanOnServer } from "@/lib/workbench/westcan-server";

// Kevin, 2026-11-15: Westcan should also work from the server's own Nexpart
// sign-in (env vars set by Kevin in Railway), with the staff extension as the
// fallback. No retry loops after a refusal, no verification-code workarounds.

const lookup: WestcanLookup = { year: 2019, makeId: 76, make: "Toyota", model: "Camry", models: [{ id: 1011, vehType: 5 }], engine: "2.5 L4", submodel: "LE", partTypes: [1896], usages: [61], multiplier: 1 };

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const redirect = (location: string, cookies: string[] = []) => {
  const headers = new Headers({ location });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(null, { status: 302, headers });
};
const page = (html: string, cookies: string[] = []) => {
  const headers = new Headers({ "content-type": "text/html" });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(html, { status: 200, headers });
};

interface Fake {
  loginOutcome: "ok" | "wrong" | "verify";
  /** Session cookie value that the catalog accepts. */
  valid: Set<string>;
  logins: number;
  token: string;
  rows: Array<Record<string, unknown>>;
}

/** A tiny Nexpart: login page, do_login, the catalog page with its token, and the JSON endpoints. */
function fakeNexpart(opts: Partial<Fake> = {}) {
  const state: Fake = { loginOutcome: "ok", valid: new Set(), logins: 0, token: "tok-1", rows: [{ mfgName: "RS Parts", partNumber: "RS982292B", partType: "1896", position: ["Front"], description: "Disc Brake Rotor", priceCost: "80.69", stockQtyPri: 4, stockQtyOthers: 38, perVeh: "2" }], ...opts };
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const cookie = String((init?.headers as Record<string, string>)?.Cookie ?? "");
    const signedIn = [...state.valid].some((v) => cookie.includes(`sess=${v}`));
    calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
    if (url.pathname === "/login-nexpart.html") return page("<form action=do_login.php>", ["PHPSESSID=anon; path=/"]);
    if (url.pathname === "/do_login.php") {
      state.logins += 1;
      if (state.loginOutcome === "wrong") return redirect("login.php?err=1&red=failed&return_url=login-nexpart.html");
      if (state.loginOutcome === "verify") return redirect("verify_device.php");
      const id = `s${state.logins}`;
      state.valid.add(id);
      return redirect("/home.php", [`sess=${id}; path=/; domain=nexpart.com; secure`]);
    }
    if (url.pathname === "/home.php") return page("home");
    if (url.pathname === "/acesCat.php") {
      if (!signedIn) return redirect("login.php");
      return page(`<head><meta name="csrf-token" content="${state.token}"></head>`);
    }
    if (!signedIn || (init?.headers as Record<string, string>)["x-csrf-token"] !== state.token) return redirect("login.php");
    const body = new URLSearchParams(String(init?.body));
    if (url.pathname === "/acesCatalogYmmeAjax.php" && body.get("ymmeMode") === "doContinue") return json({ BaseVehId: 5, VehicleId: 9 });
    if (url.pathname === "/acesCatalogYmmeAjax.php") return json({ engines: { "0": { desc: "Any" }, "7": { desc: "2.5L L4 GAS", submodels: { "1": "LE" } }, "8": { desc: "2.5L L4 FHEV", submodels: { "2": "LE" } } } });
    if (url.pathname === "/acesCatalogResults.php" && body.get("getCatData")) return json({ part_count: 1 });
    if (url.pathname === "/acesCatalogResults.php") return json(state.rows);
    return new Response("no", { status: 404 });
  });
  return { state, calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

describe("Westcan server sign-in", () => {
  it("signs in, looks the job up and returns the same answer the extension gives", async () => {
    const nx = fakeNexpart();
    const client = new WestcanClient({ username: "shop", password: "pw" }, nx.fetchImpl);
    const answer = await client.search(lookup);
    expect(answer.status).toBe("ok");
    if (answer.status === "ok") {
      expect(answer.vehicle).toBe("2019 Toyota Camry LE 2.5L L4 GAS");
      expect(answer.rows).toHaveLength(1);
      expect(answer.rows[0]).toMatchObject({ partNumber: "RS982292B", cost: "80.69", stockHere: 4, stockOther: 38, perCar: "2" });
    }
    // The session is kept: a second lookup doesn't sign in again.
    await client.search(lookup);
    expect(nx.state.logins).toBe(1);
  });

  it("reports not_configured without calling Nexpart", async () => {
    const nx = fakeNexpart();
    const client = new WestcanClient({ username: "", password: "" }, nx.fetchImpl);
    await expect(client.search(lookup)).rejects.toMatchObject({ status: "not_configured" });
    expect(nx.calls).toHaveLength(0);
  });

  it("signs in again once when the session has expired", async () => {
    const nx = fakeNexpart();
    const client = new WestcanClient({ username: "shop", password: "pw" }, nx.fetchImpl);
    await client.search(lookup);
    nx.state.valid.clear(); // Nexpart forgot us
    await expect(client.search(lookup)).resolves.toMatchObject({ status: "ok" });
    expect(nx.state.logins).toBe(2);
  });

  it("a wrong password is reported once and not retried for a while", async () => {
    const nx = fakeNexpart({ loginOutcome: "wrong" });
    let now = 1_000_000;
    const client = new WestcanClient({ username: "shop", password: "bad" }, nx.fetchImpl, () => now);
    await expect(client.search(lookup)).rejects.toMatchObject({ status: "login_failed" });
    await expect(client.search(lookup)).rejects.toMatchObject({ status: "login_failed" });
    await expect(client.search(lookup)).rejects.toBeInstanceOf(WestcanServerError);
    expect(nx.state.logins).toBe(1);
    now += 16 * 60 * 1000; // after the cooldown one more try is allowed
    await expect(client.search(lookup)).rejects.toMatchObject({ status: "login_failed" });
    expect(nx.state.logins).toBe(2);
  });

  it("reports a verification step instead of trying to get past it", async () => {
    const nx = fakeNexpart({ loginOutcome: "verify" });
    const client = new WestcanClient({ username: "shop", password: "pw" }, nx.fetchImpl);
    await expect(client.search(lookup)).rejects.toMatchObject({ status: "verification_required" });
    await expect(client.search(lookup)).rejects.toMatchObject({ status: "verification_required" });
    expect(nx.state.logins).toBe(1);
  });

  it("asks staff for the engine when it can't tell two engines apart", async () => {
    const nx = fakeNexpart();
    const client = new WestcanClient({ username: "shop", password: "pw" }, nx.fetchImpl);
    const answer = await client.search({ ...lookup, engine: "" });
    expect(answer).toEqual({ status: "need_engine", engines: ["2.5L L4 GAS", "2.5L L4 FHEV"] });
  });

  it("scores engines by displacement, cylinders, turbo and hybrid", () => {
    expect(engineScore("2.5 L4", "2.5L L4 GAS")).toBeGreaterThan(engineScore("2.5 L4", "2.5L L4 FHEV"));
    expect(engineScore("2.0 L4 Turbo", "2.0L L4 GAS Turbocharged")).toBeGreaterThan(engineScore("2.0 L4 Turbo", "2.0L L4 GAS"));
  });
});

describe("Westcan check on the server, with the extension as fallback", () => {
  const quote = () => buildLaborQuote("2019 Toyota Camry", { serviceName: "Brake Rotor R&R", position: "Front", laborHours: 1.5, laborNote: "", primaryPartName: "Brake Disc", otherPartNames: [], partsNote: "", partOptions: [] }, "W-1", {} as NodeJS.ProcessEnv);

  it("returns the quote already checked when the server answers", async () => {
    const nx = fakeNexpart();
    const client = new WestcanClient({ username: "shop", password: "pw" }, nx.fetchImpl);
    const result = await checkWestcanOnServer(quote(), lookup, { client: () => client });
    expect(result.westcan?.checked).toMatchObject({ found: 1 });
    expect(result.westcan?.server).toBeUndefined();
    expect(result.options.some((o) => o.source === "westcan" && o.partNumber === "RS982292B")).toBe(true);
  });

  it("keeps the lookup for the extension when the server isn't set up", async () => {
    const result = await checkWestcanOnServer(quote(), lookup, { client: () => null });
    expect(result.westcan).toEqual({ lookup });
  });

  it("keeps the lookup and says why when sign-in is refused", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const nx = fakeNexpart({ loginOutcome: "verify" });
    const client = new WestcanClient({ username: "shop", password: "pw" }, nx.fetchImpl);
    const result = await checkWestcanOnServer(quote(), lookup, { client: () => client });
    expect(result.westcan).toEqual({ lookup, server: "verification_required" });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/pw|shop/);
    warn.mockRestore();
  });

  it("falls back when Nexpart is too slow", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const slow = { search: () => new Promise<never>(() => undefined) };
    const result = await checkWestcanOnServer(quote(), lookup, { client: () => slow, timeoutMs: 20 });
    expect(result.westcan).toEqual({ lookup, server: "error" });
    warn.mockRestore();
  });
});

describe("Lordco after Westcan", () => {
  const quote = () => buildLaborQuote("2019 Toyota Camry", { serviceName: "Brake Rotor R&R", position: "Front", laborHours: 1.5, laborNote: "", primaryPartName: "Brake Disc", otherPartNames: [], partsNote: "", partOptions: [] }, "W-1", {} as NodeJS.ProcessEnv);
  const row = (over: Record<string, unknown>) => ({ mfgName: "Brembo", partNumber: "B-1", partType: "1896", position: ["Front"], description: "Disc Brake Rotor", priceCost: "100", stockQtyPri: 0, stockQtyOthers: 5, perVeh: "2", ...over });
  const client = (nx: ReturnType<typeof fakeNexpart>, origin?: string) => new NexpartClient({ username: "u", password: "p" }, nx.fetchImpl, Date.now, origin);

  it("signs in to Lordco's own site", async () => {
    const nx = fakeNexpart();
    await client(nx, LORDCO_ORIGIN).search(lookup);
    expect(nx.fetchImpl).toHaveBeenCalledWith(expect.stringContaining("https://1000027.nexpart.com/do_login.php"), expect.anything());
  });

  it("is asked when Westcan only has next-day stock, and its local stock wins", async () => {
    const westcan = fakeNexpart({ rows: [row({ partNumber: "W-1", stockQtyPri: 0, stockQtyOthers: 9 })] });
    const lordco = fakeNexpart({ rows: [row({ mfgName: "Raybestos", partNumber: "L-1", priceCost: "90", stockQtyPri: 3, stockQtyOthers: 0 })] });
    const result = await checkWestcanOnServer(quote(), lookup, { client: () => client(westcan), lordco: () => client(lordco, LORDCO_ORIGIN) });
    const lordcoOption = result.options.find((o) => o.source === "lordco");
    expect(lordcoOption).toMatchObject({ partNumber: "L-1", unitPrice: 117, unitCost: 90 });
    expect(result.westcan?.lordco).toMatchObject({ found: 1 });
    // Lordco is local, so Westcan's next-day option is hidden.
    expect(result.options.find((o) => o.source === "westcan")).toMatchObject({ outOfStock: true });
    expect(result.options.findIndex((o) => o.source === "lordco")).toBeLessThan(result.options.findIndex((o) => o.source === "westcan"));
  });

  it("is not asked when Westcan has the part locally", async () => {
    const westcan = fakeNexpart();
    const lordco = vi.fn(() => null);
    const result = await checkWestcanOnServer(quote(), lookup, { client: () => client(westcan), lordco });
    expect(lordco).not.toHaveBeenCalled();
    expect(result.options.some((o) => o.source === "lordco")).toBe(false);
  });

  it("is asked when Westcan has nothing usable", async () => {
    const westcan = fakeNexpart({ rows: [] });
    const lordco = fakeNexpart({ rows: [row({ stockQtyPri: 2, stockQtyOthers: 0 })] });
    const result = await checkWestcanOnServer(quote(), lookup, { client: () => client(westcan), lordco: () => client(lordco, LORDCO_ORIGIN) });
    expect(result.options.some((o) => o.source === "lordco")).toBe(true);
  });

  it("leaves Westcan's answer alone when Lordco can't be reached", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const westcan = fakeNexpart({ rows: [row({ partNumber: "W-1" })] });
    const lordco = fakeNexpart({ loginOutcome: "verify" });
    const result = await checkWestcanOnServer(quote(), lookup, { client: () => client(westcan), lordco: () => client(lordco, LORDCO_ORIGIN) });
    expect(result.westcan?.checked).toMatchObject({ found: 1 });
    expect(result.westcan?.lordco).toBeUndefined();
    expect(result.options.some((o) => o.source === "westcan")).toBe(true);
    warn.mockRestore();
  });
});

// Kevin, 2026-11-16: the "typing" line says which supplier is being asked and how it went.
describe("progress while the suppliers are asked", () => {
  const quote = () => buildLaborQuote("2019 Toyota Camry", { serviceName: "Brake Rotor R&R", position: "Front", laborHours: 1.5, laborNote: "", primaryPartName: "Brake Disc", otherPartNames: [], partsNote: "", partOptions: [] }, "W-1", {} as NodeJS.ProcessEnv);

  it("reports Westcan's result", async () => {
    const said: string[] = [];
    const client = new WestcanClient({ username: "shop", password: "pw" }, fakeNexpart().fetchImpl);
    await checkWestcanOnServer(quote(), lookup, { client: () => client, lordco: () => null, onProgress: (d) => said.push(d) });
    expect(said).toEqual(["Westcan：找到 1 个可用零件"]);
  });

  it("says why Westcan failed, without account details", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = new WestcanClient({ username: "shop", password: "bad" }, fakeNexpart({ loginOutcome: "wrong" }).fetchImpl);
    const said: string[] = [];
    await checkWestcanOnServer(quote(), lookup, { client: () => client, onProgress: (d) => said.push(d) });
    expect(said).toEqual(["Westcan 这次没查成：登录被拒绝（账号或密码不对），改由 Chrome 扩展再试"]);
    expect(said.join()).not.toMatch(/bad|shop/);
    warn.mockRestore();
  });

  it("says when the server has no account", async () => {
    const said: string[] = [];
    await checkWestcanOnServer(quote(), lookup, { client: () => null, onProgress: (d) => said.push(d) });
    expect(said[0]).toContain("Chrome 扩展");
  });
});
