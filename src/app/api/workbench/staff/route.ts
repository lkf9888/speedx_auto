import { handleStaff } from "@/lib/workbench/staff-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request): Promise<Response> => handleStaff(request);
export const POST = (request: Request): Promise<Response> => handleStaff(request);
export const PATCH = (request: Request): Promise<Response> => handleStaff(request);
export const DELETE = (request: Request): Promise<Response> => handleStaff(request);
