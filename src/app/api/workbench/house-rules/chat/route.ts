import { handleHouseRulesChat } from "@/lib/workbench/house-rules-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = (request: Request): Promise<Response> => handleHouseRulesChat(request);
