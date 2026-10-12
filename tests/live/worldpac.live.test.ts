/**
 * Live checks against the real WorldPac account (and, optionally, Claude).
 * Skipped unless WORLDPAC_LIVE=1. Run with: npm run worldpac:check
 * Credentials are read from .env.local, which git ignores.
 */
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { runChat } from "@/lib/repair-chat/agent";
import {
  applyVehicleDetails,
  findServices,
  identifyByVin,
  identifyByYearMakeModel,
  quoteService,
} from "@/lib/worldpac/catalog";
import { WorldpacClient } from "@/lib/worldpac/client";

const live = process.env.WORLDPAC_LIVE === "1";
const client = new WorldpacClient({
  username: process.env.WORLDPAC_USERNAME ?? "",
  password: process.env.WORLDPAC_PASSWORD ?? "",
});

describe.skipIf(!live)("WorldPac live", () => {
  it("logs in with the configured account", async () => {
    await client.login();
  }, 60_000);

  it("prices front brake pads on a 2019 Toyota Camry LE", async () => {
    let lookup = await identifyByYearMakeModel(client, 2019, "Toyota", "Camry");
    if (lookup.status === "needs_details") {
      lookup = await applyVehicleDetails(client, lookup.vehicle, [{ attribute: "SubModel", option: "LE" }]);
    }
    if (lookup.status === "needs_details") {
      const q = lookup.questions[0];
      lookup = await applyVehicleDetails(client, lookup.vehicle, [{ attribute: q.attribute, option: q.options[0] }]);
    }
    expect(["ok", "needs_details"]).toContain(lookup.status);
    if (lookup.status !== "ok" && lookup.status !== "needs_details") return;
    const services = await findServices(client, lookup.vehicle, "brake pads");
    console.log("services:", services.slice(0, 5).map((s) => `${s.name} (${s.system})`).join(" | "));
    const pads = services.find((s) => /brake pads/i.test(s.name));
    expect(pads).toBeDefined();
    const quote = await quoteService(client, lookup.vehicle, pads!.serviceId, "Front");
    console.log("quote:", JSON.stringify(quote, null, 2));
    expect(quote.status).toBe("ok");
    if (quote.status === "ok") {
      expect(quote.laborHours).toBeGreaterThan(0);
      expect(JSON.stringify(quote)).not.toMatch(/unitPrice|jobberPrice|wholesalePrice|dcDirectUnitPrice/);
    }
  }, 120_000);

  it("decodes a VIN", async () => {
    const lookup = await identifyByVin(client, "1HGCM82633A004352");
    console.log("vin:", JSON.stringify(lookup));
    expect(["ok", "needs_details"]).toContain(lookup.status);
  }, 60_000);
});

describe.skipIf(!live || !process.env.ANTHROPIC_API_KEY)("Repair chat live", () => {
  it("answers a real customer question end to end", async () => {
    const events: unknown[] = [];
    const result = await runChat(
      new Anthropic(),
      client,
      {
        history: [],
        message: "How much to replace the front brake pads on my 2019 Toyota Camry LE?",
        locale: "en",
        vehicleKey: null,
      },
      (e) => events.push(e),
      () => "E-LIVE",
    );
    console.log("reply:", result.text);
    console.log("events:", JSON.stringify(events.filter((e) => (e as { type: string }).type !== "status"), null, 2));
    expect(result.text.length).toBeGreaterThan(0);
  }, 180_000);
});
