import { describe, expect, it } from "vitest";
import { TatoClient, TatoError } from "@/lib/tato/client";
import { describeFleetCar, runWorkbenchTool } from "@/lib/workbench/assistant";
import type { CatalogApi } from "@/lib/worldpac/catalog";

// Shapes as TATO's /api/agent/vehicles and /api/agent/orders return them (tato-admin-mvp).
const MIRAGE = {
  id: "v1",
  plateNumber: "XC829X",
  nickname: "Precious",
  brand: "Mitsubishi",
  model: "Mirage",
  year: 2019,
  vin: "ml32a3hj5kh000000",
  status: "available",
  owner: { id: "o1", name: "Lee" },
  purchasePrice: 9000,
};
const NOW = new Date("2026-10-14T20:00:00Z"); // 13:00 in Vancouver

function fakeTato(vehicles: unknown[], orders: Record<string, unknown[]> = {}) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push(url);
    if ((init.headers as Record<string, string>).Authorization !== "Bearer tato_test") return new Response("{}", { status: 401 });
    const u = new URL(url);
    if (u.pathname === "/api/agent/vehicles") {
      const q = u.searchParams.get("q") ?? "";
      return Response.json({ data: vehicles.filter((v) => JSON.stringify(v).includes(q)), nextCursor: null });
    }
    if (u.pathname === "/api/agent/orders") return Response.json({ data: orders[u.searchParams.get("status") ?? ""] ?? [], nextCursor: null });
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { client: new TatoClient("tato_test", "https://tatocar.co", fetchImpl), calls, fetchImpl };
}

const trip = (status: string, pickup: string, ret: string) => ({
  status,
  pickupDatetime: pickup,
  returnDatetime: ret,
  renterName: "Guest Person",
  renterPhone: "+1 604 555 0100",
});

describe("TATO client", () => {
  it("finds a car by a plate typed in lower case with a space", async () => {
    const { client, calls } = fakeTato([MIRAGE]);
    const [car] = await client.findCars("xc 829x");
    expect(car).toEqual({ id: "v1", plate: "XC829X", nickname: "Precious", year: 2019, brand: "Mitsubishi", model: "Mirage", vin: "ML32A3HJ5KH000000", status: "available", owner: "Lee" });
    expect(calls.at(-1)).toContain("q=XC829X");
  });

  it("lists the current trip and upcoming bookings, soonest first, without guests", async () => {
    const { client } = fakeTato([MIRAGE], {
      ongoing: [trip("ongoing", "2026-10-13T17:00:00Z", "2026-10-15T01:00:00Z")],
      booked: [trip("booked", "2026-10-20T17:00:00Z", "2026-10-22T17:00:00Z"), trip("booked", "2026-10-16T17:00:00Z", "2026-10-17T17:00:00Z")],
    });
    const trips = await client.upcomingTrips("v1", NOW);
    expect(trips.map((t) => t.pickup)).toEqual(["2026-10-13T17:00:00Z", "2026-10-16T17:00:00Z", "2026-10-20T17:00:00Z"]);
    expect(JSON.stringify(trips)).not.toMatch(/Guest|604/);
  });

  it("reports a rejected token as an auth error", async () => {
    const client = new TatoClient("wrong", "https://tatocar.co", fakeTato([MIRAGE]).fetchImpl);
    await expect(client.findCars("XC829X")).rejects.toMatchObject({ kind: "auth" });
    expect(new TatoError("x", "auth")).toBeInstanceOf(Error);
  });
});

describe("find_fleet_car", () => {
  const catalog = {} as CatalogApi;

  it("gives the VIN and when the car is free, in shop time", async () => {
    const { client } = fakeTato([MIRAGE], {
      booked: [trip("booked", "2026-10-16T17:00:00Z", "2026-10-17T17:00:00Z")],
    });
    const text = describeFleetCar((await client.findCars("XC829X"))[0], await client.upcomingTrips("v1", NOW), NOW);
    expect(text).toContain("XC829X \"Precious\": 2019 Mitsubishi Mirage");
    expect(text).toContain("VIN ML32A3HJ5KH000000");
    expect(text).toContain("owner Lee (revenue-share");
    expect(text).toMatch(/Free now until the next pickup Fri, Oct 16, 10:00/);
  });

  it("says when a car is out on a trip", () => {
    const car = { id: "v1", plate: "XC829X", nickname: "", year: 2019, brand: "Mitsubishi", model: "Mirage", vin: "", status: "available", owner: null };
    const text = describeFleetCar(car, [{ status: "ongoing", pickup: "2026-10-13T17:00:00Z", return: "2026-10-15T01:00:00Z" }], NOW);
    expect(text).toContain("SPEEDX's own car");
    expect(text).toContain("no VIN on file");
    expect(text).toMatch(/On a trip now, back Wed, Oct 14, 18:00/);
  });

  it("asks which car when several match, and says when TATO isn't connected", async () => {
    const { client } = fakeTato([MIRAGE, { ...MIRAGE, id: "v2", plateNumber: "AB123C", nickname: "Blue" }]);
    const many = await runWorkbenchTool(catalog, "find_fleet_car", { query: "Mirage" }, () => "W-1", null, () => null, () => client);
    expect(JSON.parse(many.content)).toMatchObject({ status: "ok", matches: 2, note: "Several cars match; ask staff which one." });
    const off = await runWorkbenchTool(catalog, "find_fleet_car", { query: "XC829X" }, () => "W-1", null, () => null, () => null);
    expect(JSON.parse(off.content).status).toBe("not_configured");
  });
});
