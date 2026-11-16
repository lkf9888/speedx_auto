import { handleSmsWebhook } from "@/lib/messaging/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = (request: Request): Promise<Response> => handleSmsWebhook(request);
