import { handleWhatsAppWebhook } from "@/lib/messaging/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request): Promise<Response> => handleWhatsAppWebhook(request);
export const POST = (request: Request): Promise<Response> => handleWhatsAppWebhook(request);
