import { generateKeyPairSync, sign, type JsonWebKey } from "node:crypto";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import proxy from "@/proxy";
import { RateLimiter } from "@/lib/repair-chat/rate-limit";
import { staffUser } from "@/lib/workbench/access";
import { runWorkbenchTool } from "@/lib/workbench/assistant";
import { handleWorkbenchChat, type WorkbenchDeps } from "@/lib/workbench/http";
import { buildLaborQuote, buildTireQuote } from "@/lib/workbench/quote";
import { encodeVehicleKey, quoteService, type CatalogApi, type VehicleRef } from "@/lib/worldpac/catalog";

// ------------------------------------------------------------------ access

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: "jwk" }) as JsonWebKey), kid: "k1" } as JsonWebKey;
const TEAM = "speedxrental.cloudflareaccess.com";
const AUD = "aud-tag-123";
const env = { NODE_ENV: "production", CF_ACCESS_TEAM_DOMAIN: TEAM, CF_ACCESS_AUD: AUD } as NodeJS.ProcessEnv;
const certs = async () => [jwk];
const NOW = Date.parse("2026-10-13T20:00:00Z");

function token(claims: Record<string, unknown>, kid = "k1", key = privateKey) {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ alg: "RS256", kid, typ: "JWT" });
  const body = enc({ aud: [AUD], iss: `https://${TEAM}`, exp: NOW / 1000 + 600, email: "Staff@Example.com", ...claims });
  const sig = sign("RSA-SHA256", Buffer.from(`${head}.${body}`), key).toString("base64url");
  return `${head}.${body}.${sig}`;
}
const headersWith = (t: string) => new Headers({ "cf-access-jwt-assertion": t });

describe("workbench sign-in", () => {
  it("accepts a valid Cloudflare Access token, from the header or the cookie", async () => {
    expect(await staffUser(headersWith(token({})), env, certs, NOW)).toEqual({ email: "staff@example.com" });
    const cookie = new Headers({ cookie: `other=1; CF_Authorization=${token({})}` });
    expect(await staffUser(cookie, env, certs, NOW)).toEqual({ email: "staff@example.com" });
  });

  it("refuses wrong audience, issuer, expired or forged tokens", async () => {
    expect(await staffUser(headersWith(token({ aud: ["someone-else"] })), env, certs, NOW)).toBeNull();
    expect(await staffUser(headersWith(token({ iss: "https://evil.cloudflareaccess.com" })), env, certs, NOW)).toBeNull();
    expect(await staffUser(headersWith(token({ exp: NOW / 1000 - 1 })), env, certs, NOW)).toBeNull();
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    expect(await staffUser(headersWith(token({}, "k1", other)), env, certs, NOW)).toBeNull();
    expect(await staffUser(headersWith("not.a.token"), env, certs, NOW)).toBeNull();
    expect(await staffUser(new Headers(), env, certs, NOW)).toBeNull();
  });

  it("fails closed without configuration, and the dev shortcut never works in production", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await staffUser(headersWith(token({})), { NODE_ENV: "production" } as NodeJS.ProcessEnv, certs, NOW)).toBeNull();
    expect(
      await staffUser(new Headers(), { NODE_ENV: "production", WORKBENCH_DEV_EMAIL: "me@x.com" } as NodeJS.ProcessEnv, certs, NOW),
    ).toBeNull();
    expect(
      await staffUser(new Headers(), { NODE_ENV: "development", WORKBENCH_DEV_EMAIL: "me@x.com" } as NodeJS.ProcessEnv, certs, NOW),
    ).toEqual({ email: "me@x.com" });
    errors.mockRestore();
  });
});

// ------------------------------------------------------------------ routing

describe("workbench routing", () => {
  const at = (url: string, host: string) => proxy(new NextRequest(url, { headers: { host } }));

  it("serves the workbench at the root of the staff subdomain only", () => {
    const root = at("https://repair.speedxrental.com/", "repair.speedxrental.com");
    expect(root.headers.get("x-middleware-rewrite")).toContain("/workbench");
    expect(at("https://repair.speedxrental.com/en/hosting", "repair.speedxrental.com").status).toBe(404);
    expect(at("https://speedxrental.com/workbench", "speedxrental.com").status).toBe(404);
    expect(at("http://localhost:3110/workbench", "localhost:3110").headers.get("x-middleware-next")).toBe("1");
    // The public site still redirects to a locale as before.
    expect(at("https://speedxrental.com/auto-repair", "speedxrental.com").headers.get("location")).toContain("/en/auto-repair");
  });
});

// ------------------------------------------------------------------ quotes

const camry: VehicleRef = {
  baseVehicleId: 146565,
  label: "2019 Toyota Camry",
  attributes: [
    { name: "SubModel", id: 269, label: "LE" },
    { name: "EngineBase", id: 17637, label: "2.5 L4" },
  ],
};

function catalog(): CatalogApi {
  const answers: Record<string, unknown> = {
    "labor-ops-list": { laborOperations: [{ applicationID: 1, assetName: "a", position: { description: "Front", id: 22 }, positionID: 22 }] },
    "labor-ops-details": {
      laborOperation: {
        estimateTimeHour: 1.1,
        laborCategoryName: "Brake Pads R&R",
        applicationNote: "Does not include: Brake Hydraulic System Bleed.",
        applications: [{ categoryCode: "N1010", categoryName: "Brake Pad Set" }],
      },
    },
    pna360_cat: {
      quotes: [
        {
          productQuotes: [
            { appID: "x", partDescription: "Pads A", seriesDescription: "PRO", listPrice: 159.05, unitPrice: 78.86, jobberPrice: 101.11, corePrice: 0, availability: "Local", qtyAvailable: 4, partNumber: "PA-1", position: { id: 22 } },
            { appID: "x", partDescription: "Pads B", seriesDescription: "OE", listPrice: 185.84, unitPrice: 120.5, availability: "DC", qtyAvailable: 0, position: { id: 22 } },
          ],
        },
      ],
    },
  };
  return {
    async get() {
      throw new Error("unused");
    },
    async post<T>(path: string) {
      return answers[path] as T;
    },
  };
}

describe("staff quotes", () => {
  it("shows cost, margin and every option, while the public quote still shows list price only", async () => {
    const out = await runWorkbenchTool(catalog(), "get_estimate", { vehicle_key: encodeVehicleKey(camry), service_id: 5, position: "Front" }, () => "W-1", null);
    const quote = out.events.find((e) => e.type === "quote");
    expect(quote?.type).toBe("quote");
    if (quote?.type !== "quote") return;
    const q = quote.quote;
    expect(q.labor).toEqual({ hours: 1.1, rate: 120, walkIn: 132, referral: 105.6 });
    expect(q.options.map((o) => [o.label, o.partNumber, o.unitCost, o.customerTotal, o.referralTotal, o.profit])).toEqual([
      ["Pads A", "PA-1", 78.86, 291.05, 264.65, 212.19],
      ["Pads B", "", 120.5, 317.84, 291.44, 197.34],
    ]);
    expect(q.options[0].margin).toBeCloseTo(0.729, 3);
    expect(q.options[0].stock).toContain("本地有货");
    expect(out.content).toContain("cost $78.86");

    // The customer text and the public quote never carry the cost.
    expect(q.customerText).toContain("$291.05");
    expect(q.customerText).not.toMatch(/78\.86|120\.5|212\.19|毛利|进价/);
    const pub = await quoteService(catalog(), { ...camry, label: "2019 Toyota Camry (public)" }, 5, "Front");
    expect(JSON.stringify(pub)).not.toMatch(/78\.86|120\.5|unitPrice|jobber/);
  });

  it("uses the configured WorldPac field as cost", () => {
    const quote = buildLaborQuote(
      "2019 Toyota Camry",
      {
        serviceName: "Brake Pads R&R",
        position: "Front",
        laborHours: 1,
        laborNote: "",
        primaryPartName: "Brake Pad Set",
        otherPartNames: [],
        partsNote: "",
        partOptions: [
          {
            description: "Pads",
            series: "",
            listPrice: 100,
            quantity: 1,
            inStockLocally: false,
            note: "",
            prices: { listPrice: 100, unitPrice: 50, jobberPrice: 70 },
            partNumber: "",
            brand: "",
            availability: "",
            qtyAvailable: null,
            fields: {},
          },
        ],
      },
      "W-2",
      { WORKBENCH_COST_FIELD: "jobberPrice" } as unknown as NodeJS.ProcessEnv,
    );
    expect(quote.costField).toBe("jobberPrice");
    expect(quote.options[0]).toMatchObject({ unitCost: 70, customerTotal: 220, profit: 150 });
  });

  it("splits a tire quote into installed price, cost and eco fee", () => {
    const quote = buildTireQuote(
      "—",
      "225/65R17",
      [{ brand: "BrandA", pattern: "AS1", size: "225/65R17", load: "102H", season: "all_season", retail: 130, eco: 6.5, mounting: 25, cost: 100 }],
      4,
      "W-3",
    );
    // 130 + 6.5 → 137 (rounded) + 25 = 162 per tire
    expect(quote.options[0]).toMatchObject({ unitPrice: 162, customerTotal: 648, costTotal: 426, profit: 222 });
    expect(quote.customerText).toContain("每条 $162.00 × 4：$648.00");
    expect(quote.customerText).not.toMatch(/100|426|222/);
  });
});

// ------------------------------------------------------------------ http

describe("workbench chat endpoint", () => {
  const deps = (user: { email: string } | null, log = vi.fn()): WorkbenchDeps => ({
    user: async () => user,
    configured: () => true,
    limiter: new RateLimiter(),
    log,
    catalog: () => catalog(),
    client: () => ({
      beta: { messages: { create: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "OK" }] }) as never } },
    }),
  });
  const request = () =>
    new Request("https://repair.speedxrental.com/api/workbench/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history: [], message: "2019 Camry LE front pads", vehicleKey: null }),
    });

  it("refuses requests without a verified sign-in", async () => {
    const response = await handleWorkbenchChat(request(), deps(null));
    expect(response.status).toBe(401);
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
  });

  it("answers signed-in staff and logs who asked what", async () => {
    const log = vi.fn();
    const response = await handleWorkbenchChat(request(), deps({ email: "staff@example.com" }, log));
    const lines = (await response.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.at(-2)).toEqual({ type: "message", text: "OK" });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ email: "staff@example.com", message: "2019 Camry LE front pads" }));
  });
});
