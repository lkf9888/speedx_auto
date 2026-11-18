import { handleOpLog } from "@/lib/workbench/alldata-oplog-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request): Promise<Response> => handleOpLog(request);
export const POST = (request: Request): Promise<Response> => handleOpLog(request);
