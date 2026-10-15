import { handleConversation } from "@/lib/workbench/conversations-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = async (request: Request, { params }: Context): Promise<Response> => handleConversation(request, (await params).id);
export const PATCH = async (request: Request, { params }: Context): Promise<Response> => handleConversation(request, (await params).id);
export const DELETE = async (request: Request, { params }: Context): Promise<Response> => handleConversation(request, (await params).id);
