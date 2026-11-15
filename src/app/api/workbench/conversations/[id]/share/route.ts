import { handleShare } from "@/lib/workbench/shares-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const POST = async (request: Request, { params }: Context): Promise<Response> => handleShare(request, (await params).id);
export const DELETE = async (request: Request, { params }: Context): Promise<Response> => handleShare(request, (await params).id);
