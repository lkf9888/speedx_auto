import { handleFollowUp } from "@/lib/workbench/followup-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const POST = async (request: Request, { params }: Context): Promise<Response> => handleFollowUp(request, (await params).id);
