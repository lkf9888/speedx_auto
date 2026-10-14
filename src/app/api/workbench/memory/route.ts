import { handleMemory } from "@/lib/workbench/memory-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request): Promise<Response> => handleMemory(request);
export const POST = (request: Request): Promise<Response> => handleMemory(request);
export const PATCH = (request: Request): Promise<Response> => handleMemory(request);
export const DELETE = (request: Request): Promise<Response> => handleMemory(request);
