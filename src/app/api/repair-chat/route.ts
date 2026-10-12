import { handleDefaultChat } from "@/lib/repair-chat/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleDefaultChat(request);
}
