import { handleBookingSlots, handleDefaultBooking } from "@/lib/repair-chat/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return handleBookingSlots();
}

export function POST(request: Request): Promise<Response> {
  return handleDefaultBooking(request);
}
