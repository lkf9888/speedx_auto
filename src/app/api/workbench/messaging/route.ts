import { handleMessagingInfo } from "@/lib/messaging/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request): Promise<Response> => handleMessagingInfo(request);
