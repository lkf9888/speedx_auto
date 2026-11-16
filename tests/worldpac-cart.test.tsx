import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffQuoteCard } from "@/components/workbench/StaffQuoteCard";
import { handleWorldpacCart, type CartDeps } from "@/lib/workbench/cart-http";
import { buildLaborQuote } from "@/lib/workbench/quote";
import { addToWorldpacCart } from "@/lib/worldpac/cart";
import { encodeVehicleKey, type CatalogApi, type StaffPartOption, type VehicleRef } from "@/lib/worldpac/catalog";

// Kevin, 2026-11-16: WorldPac parts go into the shop's speedDIAL cart from the workbench. The request shapes were
// confirmed on the real account (a cart order made, added to, read back and deleted); nothing here submits an order.

const vehicle: VehicleRef = { baseVehicleId: 123, label: "2021 Porsche Cayenne GTS", attributes: [{ name: "EngineBase", id: 7, label: "4.0 L" } as never] };
const key = encodeVehicleKey(vehicle);
const productQuote = (partNumber: string, extra: Record<string, unknown> = {}) => ({
  manufacturerPart: partNumber,
  brandName: "SHW Performance",
  productID: { key: `N1000-${partNumber}   SHG`, brandCode: "SHG" },
  warehouseID: "176",
  appID: "6231099167",
  catalogID: "N1000",
  carrierDescription: "WORLDPAC Delivery",
  PnAResponseSequence: 2,
  availability: "Monday-local",
  qtyAvailable: 3,
  ...extra,
});

function fakeApi(cartOnHand: string | null = null, options: { dropWrites?: boolean; historyError?: boolean } = {}) {
  const calls: Array<{ path: string; data: unknown; extra?: Record<string, unknown> }> = [];
  const lines = new Map<string, number>(cartOnHand ? [[cartOnHand, 1]] : []);
  const api: CatalogApi = {
    async get<T>(path: string) {
      const n = path.replace("order/", "");
      return { order: { orderLines: Array.from({ length: lines.get(n) ?? 0 }) } } as T;
    },
    async post<T>(path: string, data: unknown, extra?: Record<string, unknown>) {
      calls.push({ path, data, extra });
      if (path === "pna360_cat") {
        return { quotes: [{ PnARequestID: 999, productQuotes: [productQuote("PFL47533", { unitPrice: 342 }), productQuote("PFR47534"), productQuote("PFL47533", { availability: "Wednesday", qtyAvailable: 0, warehouseID: "999" }), productQuote("PFL47533", { warehouseID: "177", unitPrice: 300, brandName: "Other" })] }] } as T;
      }
      if (path === "order/history") {
        if (options.historyError) return { status: { code: 400 } } as T;
        return { status: { code: 200 }, orders: cartOnHand ? [{ orderHeader: { orderNumber: cartOnHand, orderStatusDescription: "In shopping cart", modifiedTimeMS: 5 } }, { orderHeader: { orderNumber: "1", orderStatusDescription: "Delivered", modifiedTimeMS: 9 } }] : [{ orderHeader: { orderNumber: "1", orderStatusDescription: "Delivered" } }] } as T;
      }
      if (path === "createorder") {
        if (!options.dropWrites) lines.set("4463000", (data as unknown[]).length);
        return { status: { code: 200 }, order: { orderHeader: { orderNumber: "4463000" } } } as T;
      }
      if (path === "order/addlines") {
        if (!options.dropWrites) lines.set(String(extra?.orderNumber), (lines.get(String(extra?.orderNumber)) ?? 0) + (data as unknown[]).length);
        return { status: { code: 200 } } as T;
      }
      throw new Error(path);
    },
  };
  return { api, calls };
}

let clock = Date.UTC(2026, 10, 16, 18);
/** Each call a few minutes later, so the "just added" guard of an earlier test doesn't apply. */
const later = () => new Date((clock += 10 * 60_000));

describe("the speedDIAL cart", () => {
  it("creates a cart order with a line built the way speedDIAL's own page builds it", async () => {
    const { api, calls } = fakeApi();
    const result = await addToWorldpacCart(api, vehicle, "N1000", [{ partNumber: "pfl47533", qty: 2, brand: "" }], later());
    expect(result).toEqual({ status: "ok", orderNumber: "4463000", created: true });
    const create = calls.find((c) => c.path === "createorder")!;
    expect(create.extra).toEqual({ orderType: "ST" });
    expect(create.data).toEqual([
      {
        productId: "N1000-PFL47533   SHG",
        brandId: "SHG",
        carrierID: "",
        carrierDescription: "WORLDPAC Delivery",
        warehouseId: "177",
        applicationId: "6231099167",
        requestedQuantity: "2",
        catalogID: "N1000",
        PnARequestID: 999,
        PnAResponseSequence: 2,
        requestedProductCode: "",
      },
    ]);
  });

  it("takes the local warehouse row, and adds to the cart that is already open", async () => {
    const { api, calls } = fakeApi("4462999");
    const result = await addToWorldpacCart(api, vehicle, "N1000", [{ partNumber: "PFL47533", qty: 1, brand: "SHW" }, { partNumber: "PFR47534", qty: 1 }], later());
    expect(result).toEqual({ status: "ok", orderNumber: "4462999", created: false });
    const add = calls.find((c) => c.path === "order/addlines")!;
    expect(add.extra).toEqual({ orderNumber: "4462999" });
    expect((add.data as Array<{ warehouseId: string }>).map((l) => l.warehouseId)).toEqual(["176", "176"]);
    expect(calls.some((c) => c.path === "createorder")).toBe(false);
  });

  it("says when a part isn't there any more and sends nothing", async () => {
    const { api, calls } = fakeApi();
    expect(await addToWorldpacCart(api, vehicle, "N1000", [{ partNumber: "NOPE", qty: 1 }], later())).toEqual({ status: "part_not_found", partNumber: "NOPE" });
    expect(calls.map((c) => c.path)).toEqual(["pna360_cat"]);
  });

  it("takes the cheaper local row, the brand staff were quoted, and refuses a quantity the stock can't cover", async () => {
    const { api } = fakeApi();
    const wrongBrand = await addToWorldpacCart(api, vehicle, "N1000", [{ partNumber: "PFL47533", qty: 1, brand: "Nobody" }], later());
    expect(wrongBrand.status).toBe("part_not_found");
    const tooMany = await addToWorldpacCart(api, vehicle, "N1000", [{ partNumber: "PFL47533", qty: 9 }], later());
    expect(tooMany).toEqual({ status: "not_enough_stock", partNumber: "PFL47533", available: 3 });
  });

  it("refuses the same part twice within two minutes, so a retry can't add it twice", async () => {
    const { api, calls } = fakeApi();
    const at = later();
    expect((await addToWorldpacCart(api, vehicle, "N1000", [{ partNumber: "PFR47534", qty: 1 }], at)).status).toBe("ok");
    expect(await addToWorldpacCart(api, vehicle, "N1000", [{ partNumber: "PFR47534", qty: 1 }], new Date(at.getTime() + 30_000))).toEqual({ status: "just_added" });
    expect(calls.filter((c) => c.path === "createorder")).toHaveLength(1);
  });

  it("reads the cart back and says so when the lines didn't arrive", async () => {
    const { api } = fakeApi(null, { dropWrites: true });
    expect(await addToWorldpacCart(api, vehicle, "N1000", [{ partNumber: "PFR47534", qty: 1 }], later())).toEqual({ status: "failed", reason: "unverified" });
  });

  it("doesn't guess a cart when the order list can't be read", async () => {
    const { api, calls } = fakeApi(null, { historyError: true });
    const result = await addToWorldpacCart(api, vehicle, "N1000", [{ partNumber: "PFR47534", qty: 1 }], later());
    expect(result.status).toBe("failed");
    expect(calls.some((c) => c.path === "createorder" || c.path === "order/addlines")).toBe(false);
  });

  it("never calls anything that submits an order", async () => {
    const { api, calls } = fakeApi();
    await addToWorldpacCart(api, vehicle, "N1000", [{ partNumber: "PFL47533", qty: 1 }], later());
    expect(calls.map((c) => c.path).filter((p) => /submit/i.test(p))).toEqual([]);
  });
});

describe("the cart route", () => {
  const deps = (signedIn = true, api = fakeApi().api): CartDeps => ({ user: async () => (signedIn ? { email: "k@x" } : null), catalog: () => api, log: () => undefined });
  const post = (body: unknown) => new Request("https://repair/api/workbench/cart/worldpac", { method: "POST", body: JSON.stringify(body) });

  it("is for signed-in staff only and refuses an incomplete request", async () => {
    expect((await handleWorldpacCart(post({}), deps(false))).status).toBe(401);
    expect((await handleWorldpacCart(post({ vehicleKey: key, categoryCode: "N1000", items: [] }), deps())).status).toBe(400);
    expect((await handleWorldpacCart(post({ vehicleKey: "nope", categoryCode: "N1000", items: [{ partNumber: "PFL47533", qty: 1 }] }), deps())).status).toBe(400);
    expect((await handleWorldpacCart(post({ vehicleKey: key, categoryCode: "N1000", items: [{ partNumber: "PFL47533", qty: 99 }] }), deps())).status).toBe(400);
    // One bad item among good ones is refused as a whole, not dropped.
    expect((await handleWorldpacCart(post({ vehicleKey: key, categoryCode: "N1000", items: [{ partNumber: "PFL47533", qty: 1 }, { partNumber: "<x>", qty: 1 }] }), deps())).status).toBe(400);
  });

  it("answers with the cart order number", async () => {
    const response = await handleWorldpacCart(post({ vehicleKey: key, categoryCode: "N1000", items: [{ partNumber: "PFL47533", qty: 1 }, { partNumber: "PFR47534", qty: 1 }] }), { ...deps(), now: later });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ orderNumber: "4463000", created: true });
    const missing = await handleWorldpacCart(post({ vehicleKey: key, categoryCode: "N1000", items: [{ partNumber: "NOPE", qty: 1 }] }), deps());
    expect(missing.status).toBe(404);
    expect((await missing.json()).error).toBe("part_not_found");
  });
});

describe("the button on a WorldPac part", () => {
  afterEach(() => vi.unstubAllGlobals());
  const part: StaffPartOption = { description: "Brake Disc", series: "", listPrice: 484, quantity: 1, inStockLocally: true, note: "", prices: { unitPrice: 342.54 }, partNumber: "PFL47533 + PFR47534", brand: "SHW", availability: "", qtyAvailable: 3, fields: { categoryCode: "N1000" } };
  const quote = () => buildLaborQuote("2021 Porsche Cayenne GTS", { serviceName: "Brake Rotor R&R", position: "Front", laborHours: 0.8, laborNote: "", primaryPartName: "Brake Disc", otherPartNames: [], partsNote: "", partOptions: [part] }, "W-1", {} as NodeJS.ProcessEnv);

  it("asks first, puts a left + right set in as two lines and links to the cart order", async () => {
    const fetchMock = vi.fn(async () => Response.json({ orderNumber: "4463000", created: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(<StaffQuoteCard quote={quote()} tier="retail" vehicleKey={key} />);
    await userEvent.click(screen.getByRole("button", { name: "加进 WorldPac 购物车" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("add-to-cart")).toHaveTextContent("#PFL47533 + PFR47534 × 1");
    expect(screen.getByTestId("add-to-cart")).toHaveTextContent("不会下单");
    await userEvent.click(screen.getByTestId("cart-confirm"));
    await waitFor(() => expect(screen.getByTestId("cart-done")).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/workbench/cart/worldpac");
    expect(JSON.parse(init.body as string)).toEqual({ vehicleKey: key, categoryCode: "N1000", items: [{ partNumber: "PFL47533", qty: 1, brand: "SHW" }, { partNumber: "PFR47534", qty: 1, brand: "SHW" }] });
    expect(screen.getByTestId("cart-done")).toHaveTextContent("订单 4463000");
    expect(screen.getByRole("link", { name: /打开 speedDIAL/ })).toHaveAttribute("href", "https://speeddial.worldpac.com/#/order/4463000");
  });

  it("is not offered without the car or the part category", () => {
    render(<StaffQuoteCard quote={quote()} tier="retail" />);
    expect(screen.queryByTestId("add-to-cart")).not.toBeInTheDocument();
  });

  it("says plainly when the part is gone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "part_not_found" }, { status: 404 })));
    render(<StaffQuoteCard quote={quote()} tier="retail" vehicleKey={key} />);
    await userEvent.click(screen.getByRole("button", { name: "加进 WorldPac 购物车" }));
    await userEvent.click(screen.getByTestId("cart-confirm"));
    expect(await screen.findByRole("alert")).toHaveTextContent("现在查不到这个零件");
  });
});
