import { handleHouseRules } from "@/lib/workbench/house-rules-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request): Promise<Response> => handleHouseRules(request);
export const POST = (request: Request): Promise<Response> => handleHouseRules(request);
export const DELETE = (request: Request): Promise<Response> => handleHouseRules(request);
