import { handleConversationList } from "@/lib/workbench/conversations-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request): Promise<Response> => handleConversationList(request);
export const POST = (request: Request): Promise<Response> => handleConversationList(request);
