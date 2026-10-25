import { handleHostingLead } from "@/lib/hosting-estimate/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleHostingLead(request);
}
