import { handleWorkbenchChat } from "@/lib/workbench/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleWorkbenchChat(request);
}
