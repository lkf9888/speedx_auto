import { handleStatus } from "@/lib/workbench/status-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request): Promise<Response> => handleStatus(request);
