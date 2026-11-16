import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A plain function, not vi.fn: vitest reports a rejection that passes through a spy even when the caller handles it.
const { callAlldata, calls, setImpl } = vi.hoisted(() => {
  let impl: (...args: unknown[]) => unknown = () => undefined;
  const calls: unknown[][] = [];
  return {
    calls,
    setImpl: (next: (...args: unknown[]) => unknown) => {
      impl = next;
    },
    callAlldata: (...args: unknown[]) => {
      calls.push(args);
      return impl(...args);
    },
  };
});
vi.mock("@/lib/workbench/alldata-bridge", async (original) => ({ ...(await original<typeof import("@/lib/workbench/alldata-bridge")>()), callAlldata }));

import { StaffQuoteCard } from "@/components/workbench/StaffQuoteCard";
import { mergeLordco } from "@/lib/workbench/westcan";
import { buildLaborQuote, type StaffQuote } from "@/lib/workbench/quote";
import type { StaffPartOption } from "@/lib/worldpac/catalog";

// Kevin, 2026-11-16: one click puts a Westcan or Lordco part into that seller's Nexpart cart through the
// staff computer's own signed-in Chrome. Staff confirm first and place the order themselves.

const worldpac: StaffPartOption = { description: "Brake Disc", series: "", listPrice: 300, quantity: 2, inStockLocally: true, note: "", prices: { unitPrice: 150 }, partNumber: "P-1", brand: "ACME", availability: "", qtyAvailable: 3, fields: {} };
const base = () => buildLaborQuote("2021 Porsche Cayenne GTS", { serviceName: "Brake Rotor R&R", position: "Front", laborHours: 0.8, laborNote: "", primaryPartName: "Brake Disc", otherPartNames: [], partsNote: "", partOptions: [worldpac] }, "W-1", {} as NodeJS.ProcessEnv);

/** The same quote with a Westcan option, the way the extension's lookup adds one. */
function withWestcanOption(source: "westcan" | "lordco"): StaffQuote {
  const q = base();
  const option = { ...q.options[0], label: "HIGH CARBON DISC", brand: "Brembo", partNumber: "09.C988.21", source, unitCost: 149.71, quantity: 2, outOfStock: false, eta: undefined };
  return { ...q, options: [option] };
}

beforeEach(() => {
  calls.length = 0;
  setImpl(() => undefined);
});

describe("add to cart", () => {
  it("is offered only for Westcan and Lordco parts", () => {
    render(<StaffQuoteCard quote={base()} tier="retail" />);
    expect(screen.queryByTestId("add-to-cart")).not.toBeInTheDocument();
    expect(mergeLordco).toBeTypeOf("function");
  });

  it("asks first, says it won't order, then adds through the extension and links to the cart", async () => {
    setImpl(async () => ({ status: "ok", cartBefore: 0, cartAfter: 1 }));
    render(<StaffQuoteCard quote={withWestcanOption("westcan")} tier="retail" />);
    await userEvent.click(screen.getByRole("button", { name: "加进 Westcan 购物车" }));
    expect(calls).toHaveLength(0);
    expect(screen.getByTestId("add-to-cart")).toHaveTextContent("不会下单");
    expect(screen.getByTestId("add-to-cart")).toHaveTextContent("#09.C988.21 × 2，进价 $299.42");
    await userEvent.click(screen.getByTestId("cart-confirm"));
    await waitFor(() => expect(screen.getByTestId("cart-done")).toBeInTheDocument());
    expect(calls[0]).toEqual(["cartAdd", { supplier: "westcan", partNumber: "09.C988.21", qty: 2 }, 60_000]);
    expect(screen.getByTestId("cart-done")).toHaveTextContent("现在购物车里 1 件");
    expect(screen.getByRole("link", { name: /打开 Westcan 购物车/ })).toHaveAttribute("href", "https://3501660.nexpart.com/cart.php");
  });

  it("uses Lordco's own site for a Lordco part", async () => {
    setImpl(async () => ({ status: "ok", cartBefore: 1, cartAfter: 2 }));
    render(<StaffQuoteCard quote={withWestcanOption("lordco")} tier="retail" />);
    await userEvent.click(screen.getByRole("button", { name: "加进 Lordco 购物车" }));
    await userEvent.click(screen.getByTestId("cart-confirm"));
    await waitFor(() => expect(calls[0]).toEqual(["cartAdd", { supplier: "lordco", partNumber: "09.C988.21", qty: 2 }, 60_000]));
    expect(await screen.findByRole("link", { name: /打开 Lordco 购物车/ })).toHaveAttribute("href", "https://1000027.nexpart.com/cart.php");
  });

  it("doesn't offer the button for a left + right set", () => {
    const q = withWestcanOption("westcan");
    render(<StaffQuoteCard quote={{ ...q, options: [{ ...q.options[0], partNumber: "L-1 + R-2", quantity: 1 }] }} tier="retail" />);
    expect(screen.queryByTestId("add-to-cart")).not.toBeInTheDocument();
  });

  it("says plainly when nothing was added", async () => {
    setImpl(async () => ({ status: "not_found" }));
    render(<StaffQuoteCard quote={withWestcanOption("westcan")} tier="retail" />);
    await userEvent.click(screen.getByRole("button", { name: "加进 Westcan 购物车" }));
    await userEvent.click(screen.getByTestId("cart-confirm"));
    expect(await screen.findByRole("alert")).toHaveTextContent("搜不到这个零件号，没有加进购物车");
    expect(screen.getByRole("link", { name: /先打开 Westcan 购物车看一眼/ })).toBeInTheDocument();
  });

  it("says when the extension is too old to know the request", async () => {
    const { BridgeError } = await import("@/lib/workbench/alldata-bridge");
    const failure = new BridgeError("bad_request", "unknown operation");
    setImpl(() => new Promise((_, reject) => setTimeout(() => reject(failure), 0)));
    render(<StaffQuoteCard quote={withWestcanOption("westcan")} tier="retail" />);
    await userEvent.click(screen.getByRole("button", { name: "加进 Westcan 购物车" }));
    await userEvent.click(screen.getByTestId("cart-confirm"));
    expect(await screen.findByRole("alert")).toHaveTextContent("扩展版本太旧");
  });

  it("says when the extension isn't there", async () => {
    // The real bridge: nothing answers the page's ping, so the extension counts as missing.
    const actual = await vi.importActual<typeof import("@/lib/workbench/alldata-bridge")>("@/lib/workbench/alldata-bridge");
    actual.resetBridge();
    setImpl((op, args, timeout) => actual.callAlldata(op as never, args as never, timeout as number));
    render(<StaffQuoteCard quote={withWestcanOption("westcan")} tier="retail" />);
    await userEvent.click(screen.getByRole("button", { name: "加进 Westcan 购物车" }));
    await userEvent.click(screen.getByTestId("cart-confirm"));
    expect(await screen.findByRole("alert", undefined, { timeout: 4000 })).toHaveTextContent("还没装 SPEEDX ALLDATA 扩展");
  });
});
