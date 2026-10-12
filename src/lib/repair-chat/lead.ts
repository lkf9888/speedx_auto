/**
 * Contact details a visitor gives before the estimate assistant opens.
 *
 * Name and phone go to the shop only — they are never sent to the AI model.
 * Each lead event is POSTed to REPAIR_LEAD_WEBHOOK_URL (Zapier, Make, a
 * Google Apps Script, Slack, …). Until a webhook is configured, the event is
 * written to the server log so no lead is lost.
 */
import type { EstimateCard } from "./pricing";

export interface Lead {
  name: string;
  phone: string;
}

export function parseLead(raw: unknown): Lead | null {
  if (!raw || typeof raw !== "object") return null;
  const { name, phone } = raw as Record<string, unknown>;
  if (typeof name !== "string" || typeof phone !== "string") return null;
  const cleanName = name.replace(/\s+/g, " ").trim();
  if (cleanName.length < 1 || cleanName.length > 60 || /[<>{}\\]/.test(cleanName)) return null;
  const cleanPhone = phone.trim();
  if (cleanPhone.length > 25 || !/^\+?[\d\s().-]+$/.test(cleanPhone)) return null;
  const digits = cleanPhone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return { name: cleanName, phone: cleanPhone };
}

export type LeadEvent =
  | { type: "lead_started"; lead: Lead; locale: string; at: string }
  | {
      type: "estimate_shown";
      lead: Lead;
      locale: string;
      at: string;
      estimate: Pick<
        EstimateCard,
        "id" | "vehicle" | "service" | "position" | "laborHours" | "totalLow" | "totalHigh"
      >;
    };

export type LeadNotifier = (event: LeadEvent) => Promise<void>;

export function createLeadNotifier(
  webhookUrl: string | undefined = process.env.REPAIR_LEAD_WEBHOOK_URL,
  fetchImpl: typeof fetch = fetch,
): LeadNotifier {
  return async (event) => {
    if (!webhookUrl) {
      console.info("repair-lead", JSON.stringify(event));
      return;
    }
    try {
      const response = await fetchImpl(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`webhook ${response.status}`);
    } catch (error) {
      // Keep the lead in the log if delivery fails.
      console.error("repair-lead delivery failed", (error as Error).message, JSON.stringify(event));
    }
  };
}

export function estimateLeadEvent(lead: Lead, locale: string, card: EstimateCard): LeadEvent {
  return {
    type: "estimate_shown",
    lead,
    locale,
    at: new Date().toISOString(),
    estimate: {
      id: card.id,
      vehicle: card.vehicle,
      service: card.service,
      position: card.position,
      laborHours: card.laborHours,
      totalLow: card.totalLow,
      totalHigh: card.totalHigh,
    },
  };
}
