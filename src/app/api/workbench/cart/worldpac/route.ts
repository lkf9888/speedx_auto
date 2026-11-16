import { handleWorldpacCart } from "@/lib/workbench/cart-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = (request: Request): Promise<Response> => handleWorldpacCart(request);
