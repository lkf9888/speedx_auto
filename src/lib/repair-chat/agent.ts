import type Anthropic from "@anthropic-ai/sdk";
import { decodeVehicleKey, describeVehicle, type CatalogApi } from "@/lib/worldpac/catalog";
import { WorldpacError } from "@/lib/worldpac/client";
import { SYSTEM_PROMPT, turnContext } from "./prompt";
import { runTool, statusForTool, TOOLS, type ChatEvent } from "./tools";

/**
 * Model for the chat and the follow-up summary. Override with
 * REPAIR_CHAT_MODEL (e.g. claude-opus-5-5) without a code change.
 */
export const MODEL = process.env.REPAIR_CHAT_MODEL || "claude-haiku-5-5";

/** Server-side refusal fallback exists for Opus/Sonnet/Fable, not Haiku 5.5 (400). */
export function fallbackOptions(model: string) {
  return model.startsWith("claude-haiku")
    ? {}
    : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };
}
const MAX_STEPS = 8;

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

/** The slice of the SDK this module uses, so tests can pass a fake. */
export interface MessagesClient {
  beta: {
    messages: {
      create(
        params: Anthropic.Beta.MessageCreateParamsNonStreaming,
      ): Promise<Anthropic.Beta.BetaMessage>;
    };
  };
}

export interface ChatRequest {
  history: ChatTurn[];
  message: string;
  locale: string;
  vehicleKey: string | null;
}

export interface ChatResult {
  text: string;
  events: ChatEvent[];
}

const SAFE_LABEL = /[^A-Za-z0-9 .,/()+-]/g;

/** Only server-shaped vehicle data reaches the system message. */
function knownVehicle(vehicleKey: string | null) {
  if (!vehicleKey) return null;
  const vehicle = decodeVehicleKey(vehicleKey);
  if (!vehicle) return null;
  return { key: vehicleKey, label: describeVehicle(vehicle).replace(SAFE_LABEL, "").slice(0, 100) };
}

export async function runChat(
  client: MessagesClient,
  api: CatalogApi,
  request: ChatRequest,
  onEvent: (event: ChatEvent) => void,
  newEstimateId: () => string,
): Promise<ChatResult> {
  // Text-only history: no thinking or tool blocks from earlier turns are
  // replayed, so nothing in the prefix can be invalidated between requests.
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...request.history.map((turn) => ({ role: turn.role, content: turn.text })),
    { role: "user", content: request.message },
    { role: "system", content: turnContext(request.locale, knownVehicle(request.vehicleKey)) },
  ];
  const events: ChatEvent[] = [];
  const emit = (event: ChatEvent) => {
    events.push(event);
    onEvent(event);
  };

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
      output_config: { effort: "low" },
      ...fallbackOptions(MODEL),
    });

    if (response.stop_reason === "refusal") {
      return { text: "", events };
    }

    // Append the full content unchanged so thinking blocks stay valid in this turn.
    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter(
      (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use",
    );
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const text = response.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      return { text, events };
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of toolUses) {
      emit({ type: "status", status: statusForTool(use.name) });
      try {
        const outcome = await runTool(
          api,
          use.name,
          (use.input ?? {}) as Record<string, unknown>,
          newEstimateId,
        );
        outcome.events.forEach(emit);
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: outcome.content,
          is_error: outcome.isError,
        });
      } catch (error) {
        const message =
          error instanceof WorldpacError
            ? "The parts catalog is temporarily unavailable. Offer to have the team confirm the price by WhatsApp or phone."
            : "Lookup failed. Offer to have the team confirm by WhatsApp or phone.";
        if (!(error instanceof WorldpacError)) console.error("repair-chat tool error", error);
        else console.error("repair-chat worldpac error", error.kind, error.message);
        results.push({ type: "tool_result", tool_use_id: use.id, content: message, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }

  return { text: "", events };
}
