/**
 * POST /api/workbench/cart/worldpac — staff put parts into the shop's speedDIAL shopping cart (never an order).
 * Body: { vehicleKey, categoryCode, items: [{ partNumber, qty }] }. Signed-in staff only.
 */
import { addToWorldpacCart } from "@/lib/worldpac/cart";
import { decodeVehicleKey, type CatalogApi } from "@/lib/worldpac/catalog";
import { getWorldpacClient } from "@/lib/worldpac/client";
import type { StaffUser } from "./access";
import { signedInStaff } from "./staff-roster";

export interface CartDeps {
  user: (request: Request) => Promise<StaffUser | null>;
  catalog: () => CatalogApi;
  log: (entry: Record<string, unknown>) => void;
  now?: () => Date;
}

const defaultDeps: CartDeps = {
  user: (request) => signedInStaff(request.headers),
  catalog: () => getWorldpacClient(),
  log: (entry) => console.info("workbench cart", JSON.stringify(entry)),
};

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

const PART = /^[A-Za-z0-9][A-Za-z0-9 ._/-]{1,39}$/;
const CATEGORY = /^[A-Za-z0-9]{2,12}$/;

export async function handleWorldpacCart(request: Request, deps: CartDeps = defaultDeps): Promise<Response> {
  const user = await deps.user(request);
  if (!user) return json({ error: "unauthorized" }, 401);
  const body = (await request.json().catch(() => null)) as { vehicleKey?: unknown; categoryCode?: unknown; items?: unknown } | null;
  const vehicle = typeof body?.vehicleKey === "string" ? decodeVehicleKey(body.vehicleKey) : null;
  const category = typeof body?.categoryCode === "string" ? body.categoryCode : "";
  const items = Array.isArray(body?.items) ? body.items : [];
  const clean = items.flatMap((item) => {
    const { partNumber, qty, brand } = (item ?? {}) as { partNumber?: unknown; qty?: unknown; brand?: unknown };
    return typeof partNumber === "string" && PART.test(partNumber.trim()) && Number.isInteger(qty) && (qty as number) >= 1 && (qty as number) <= 20
      ? [{ partNumber: partNumber.trim(), qty: qty as number, ...(typeof brand === "string" && brand.trim() ? { brand: brand.trim().slice(0, 60) } : {}) }]
      : [];
  });
  // Every item must be valid: a part that was dropped quietly would leave the cart short.
  if (!vehicle || !CATEGORY.test(category) || clean.length === 0 || clean.length > 4 || clean.length !== items.length) return json({ error: "bad_request" }, 400);
  try {
    const result = await addToWorldpacCart(deps.catalog(), vehicle, category, clean, deps.now?.());
    deps.log({ action: "worldpac_cart", email: user.email, status: result.status, lines: clean.length });
    if (result.status === "ok") return json({ orderNumber: result.orderNumber, created: result.created });
    if (result.status === "part_not_found") return json({ error: "part_not_found", partNumber: result.partNumber }, 404);
    if (result.status === "not_enough_stock") return json({ error: "not_enough_stock", partNumber: result.partNumber, available: result.available }, 409);
    if (result.status === "just_added") return json({ error: "just_added" }, 409);
    return json({ error: "failed", reason: result.reason }, 502);
  } catch (error) {
    console.error("worldpac cart failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "upstream" }, 502);
  }
}
