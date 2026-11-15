import { handleUnsubscribe } from "@/lib/workbench/unsubscribe-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One-click unsubscribe (mail apps) and the unsubscribe page's button. */
export const POST = (request: Request): Promise<Response> => handleUnsubscribe(request);
