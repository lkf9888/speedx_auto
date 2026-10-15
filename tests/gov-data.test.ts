import { describe, expect, it, vi } from "vitest";
import { decodeVin, readVpic, specsForModel } from "@/lib/gov/vpic";
import { findRecalls, modelNames, splitTcComment } from "@/lib/gov/recalls";

const corolla = {
  Make: "TOYOTA",
  Model: "Corolla",
  ModelYear: "2018",
  Trim: "L/LE/SE/XLE/XSE",
  Series: "ZRE172L",
  EngineModel: "2ZR-FE",
  DisplacementL: "1.8",
  EngineCylinders: "4",
  EngineConfiguration: "In-Line",
  DriveType: "4x2",
  TransmissionSpeeds: "6",
  FuelTypePrimary: "Gasoline",
  BodyClass: "Sedan/Saloon",
  PlantCountry: "CANADA",
  ErrorCode: "0",
  ErrorText: "0 - VIN decoded clean.",
};

describe("vPIC VIN decoding", () => {
  it("keeps the fields an estimate needs", () => {
    const specs = readVpic("2T1BURHE0JC034187", corolla)!;
    expect(specs).toMatchObject({ year: 2018, make: "Toyota", model: "Corolla", engineCode: "2ZR-FE", cylinders: 4, drive: "2WD", builtIn: "CANADA", warning: "" });
    expect(specsForModel(specs)).toEqual({
      year_make_model: "2018 Toyota Corolla",
      trim: "L/LE/SE/XLE/XSE / ZRE172L",
      engine: "1.8 L, 4 cylinders, In-Line, engine code 2ZR-FE",
      drive: "2WD",
      transmission: "6-speed",
      fuel: "Gasoline",
      body: "Sedan/Saloon",
      built_in: "CANADA",
    });
  });

  it("passes vPIC's warning on and gives up on rows without a make", () => {
    expect(readVpic("X", { ...corolla, ErrorCode: "1", ErrorText: "1 - Check Digit (9th position) does not calculate properly" })!.warning).toMatch(/Check Digit/);
    expect(readVpic("X", { ...corolla, Make: "" })).toBeNull();
  });

  it("only asks vPIC about real VINs, and returns null when vPIC fails", async () => {
    const fetchImpl = vi.fn(async () => new Response("down", { status: 503 }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await decodeVin("12345", fetchImpl as unknown as typeof fetch)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await decodeVin("1HGCM82633A00435Z", fetchImpl as unknown as typeof fetch)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

const tcList = (rows: Array<[string, string, string]>) => ({
  ResultSet: rows.map(([number, model, date]) => [
    { Name: "Recall number", Value: { Literal: number } },
    { Name: "Model name", Value: { Literal: model } },
    { Name: "Recall date", Value: { Literal: date } },
  ]),
});
const tcSummary = (system: string, comment: string) => ({
  ResultSet: [[{ Name: "SYSTEM_TYPE_ETXT", Value: { Literal: system } }, { Name: "COMMENT_ETXT", Value: { Literal: comment } }]],
});

function fakeGov(routes: Record<string, unknown | Error>) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (url: string) => {
    calls.push(url);
    const hit = Object.entries(routes).find(([part]) => url.includes(part));
    if (!hit) return Response.json({ ResultSet: [], results: [] });
    if (hit[1] instanceof Error) throw hit[1];
    return Response.json(hit[1]);
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

describe("recalls", () => {
  it("splits Transport Canada's comment into issue, risk and fix", () => {
    expect(splitTcComment("Issue: \r\nThe fuel pump could fail.\r\n\r\nSafety Risk: \r\nLoss of power.\r\n\r\nCorrective Actions: \r\nReplace the pump.")).toEqual({
      issue: "The fuel pump could fail.",
      risk: "Loss of power.",
      remedy: "Replace the pump.",
    });
  });

  it("tries the spellings Transport Canada uses", () => {
    expect(modelNames("CRV")).toContain("cr-v");
    expect(modelNames("F150")).toContain("f-150");
    expect(modelNames("GLC300")).toContain("glc");
    expect(modelNames("Silverado 1500")).toContain("silverado");
  });

  it("lists Canadian recalls newest first with their details", async () => {
    const gov = fakeGov({
      "model-name/cr-v/": tcList([
        ["2019001", "CR-V", "1/5/2019 12:00:00 AM"],
        ["2026251", "CR-V", "5/21/2026 12:00:00 AM"],
      ]),
      "recall-number/2026251": tcSummary("Seats And Restraints", "Issue: Seat sensor. Safety Risk: Airbag. Corrective Actions: Replace sensor."),
      "recall-number/2019001": tcSummary("Brakes", "Issue: Brake hose. Corrective Actions: Replace hose."),
    });
    const result = await findRecalls(2018, "Honda", "CRV", gov.fetchImpl);
    expect(result).toMatchObject({ source: "Transport Canada", models: ["CR-V"], total: 2 });
    expect(result.recalls.map((r) => [r.number, r.date, r.system, r.remedy])).toEqual([
      ["2026251", "2026-05-21", "Seats And Restraints", "Replace sensor."],
      ["2019001", "2019-01-05", "Brakes", "Replace hose."],
    ]);
    // "crv" found nothing, so "cr-v" was tried; NHTSA wasn't needed.
    expect(gov.calls.some((u) => u.includes("api.nhtsa.gov"))).toBe(false);
  });

  it("falls back to NHTSA only when Canada lists nothing", async () => {
    const gov = fakeGov({
      "api.nhtsa.gov": { results: [{ NHTSACampaignNumber: "20V314000", ReportReceivedDate: "28/05/2020", Component: "FUEL PUMP", Summary: "Pump may fail.", Consequence: "Stall.", Remedy: "Replace pump.", Model: "XYZ" }] },
    });
    const result = await findRecalls(2017, "Acme", "XYZ", gov.fetchImpl);
    expect(result).toMatchObject({ source: "NHTSA", total: 1 });
    expect(result.recalls[0]).toMatchObject({ number: "20V314000", date: "2020-05-28" });
  });

  it("doesn't answer 'no recalls' when Transport Canada is unreachable", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const gov = fakeGov({ "data.tc.gc.ca": new Error("timeout") });
    await expect(findRecalls(2016, "Acme", "Nothing", gov.fetchImpl)).rejects.toThrow();
    const none = fakeGov({});
    expect(await findRecalls(2015, "Acme", "Nothing", none.fetchImpl)).toEqual({ source: null, models: [], total: 0, recalls: [] });
    spy.mockRestore();
  });
});
