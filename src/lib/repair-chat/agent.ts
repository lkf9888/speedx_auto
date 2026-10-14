import type Anthropic from "@anthropic-ai/sdk";
import { decodeVehicleKey, describeVehicle, type CatalogApi } from "@/lib/worldpac/catalog";
import { WorldpacError } from "@/lib/worldpac/client";
import { detectCustomerLanguage, safetyWarning, SYSTEM_PROMPT, turnContext } from "./prompt";
import { matchScript } from "./script";
import { runTool, statusForTool, TOOLS, type ChatEvent, type ToolOutcome } from "./tools";

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

const LANGUAGE_LOCALE: Record<string, "en" | "zh-CN" | "zh-TW"> = {
  English: "en",
  "Simplified Chinese": "zh-CN",
  "Traditional Chinese": "zh-TW",
};

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

export interface ChatResult<E = ChatEvent> {
  text: string;
  events: E[];
}

/**
 * How a chat behaves: the public estimate assistant and the staff workbench
 * share the loop below and differ only here (model, instructions, tools).
 */
export interface ChatProfile<E extends { type: string }> {
  model: string;
  effort: "low" | "medium" | "high";
  system: string;
  tools: Anthropic.Beta.BetaTool[];
  /** Per-turn system note (language, known vehicle, date…). */
  turnContext(request: ChatRequest, earlierCustomerMessages: string[], vehicle: { key: string; label: string } | null): string;
  runTool(
    api: CatalogApi,
    name: string,
    input: Record<string, unknown>,
    newEstimateId: () => string,
    cardLocale: "en" | "zh-CN" | "zh-TW",
    knownVehicleKey: string | null,
  ): Promise<{ content: string; isError: boolean; events: E[] }>;
  statusEvent(toolName: string): E;
  /** Fixed text shown above the reply (public: safety warning). */
  preface?(message: string, language: string): string | null;
  /** What the model is told when a lookup fails. */
  toolFailure(catalogDown: boolean): string;
}

export const PUBLIC_PROFILE: ChatProfile<ChatEvent> = {
  model: MODEL,
  effort: "low",
  system: SYSTEM_PROMPT,
  tools: TOOLS,
  turnContext: (request, earlier, vehicle) => turnContext(request.locale, vehicle, request.message, earlier),
  runTool: async (api, name, input, newEstimateId, cardLocale, knownVehicleKey): Promise<ToolOutcome> => {
    const outcome = await runTool(api, name, input, newEstimateId, cardLocale, knownVehicleKey);
    return {
      ...outcome,
      events: outcome.events.map((event) =>
        event.type === "estimate" ? { ...event, estimate: { ...event.estimate, lang: cardLocale } } : event,
      ),
    };
  },
  statusEvent: (name) => ({ type: "status", status: statusForTool(name) }),
  preface: (message, language) => safetyWarning(message, language),
  toolFailure: (catalogDown) =>
    catalogDown
      ? "The parts catalog is temporarily unavailable. Offer to have the team confirm the price by WhatsApp or phone."
      : "Lookup failed. Offer to have the team confirm by WhatsApp or phone.",
};

const SAFE_LABEL = /[^A-Za-z0-9 .,/()+-]/g;

/** The chat renders plain text: strip markdown the model sometimes adds. */
export function toPlainText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

/** Only server-shaped vehicle data reaches the system message. */
function knownVehicle(vehicleKey: string | null) {
  if (!vehicleKey) return null;
  const vehicle = decodeVehicleKey(vehicleKey);
  if (!vehicle) return null;
  return { key: vehicleKey, label: describeVehicle(vehicle).replace(SAFE_LABEL, "").slice(0, 100) };
}

export async function runChat<E extends { type: string } = ChatEvent>(
  client: MessagesClient,
  api: CatalogApi,
  request: ChatRequest,
  onEvent: (event: E) => void,
  newEstimateId: () => string,
  profile: ChatProfile<E> = PUBLIC_PROFILE as unknown as ChatProfile<E>,
): Promise<ChatResult<E>> {
  const earlierCustomerMessages = request.history.filter((t) => t.role === "user").map((t) => t.text).reverse();
  const language = detectCustomerLanguage(request.message, request.locale, earlierCustomerMessages);
  // Cards are labelled in the customer's language, which can differ from the page's.
  const cardLocale = LANGUAGE_LOCALE[language] ?? "en";
  // Text-only history: no thinking or tool blocks from earlier turns are
  // replayed, so nothing in the prefix can be invalidated between requests.
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...request.history.map((turn) => ({ role: turn.role, content: turn.text })),
    { role: "user", content: request.message },
    { role: "system", content: profile.turnContext(request, earlierCustomerMessages, knownVehicle(request.vehicleKey)) },
  ];
  const events: E[] = [];
  const emit = (event: E) => {
    events.push(event);
    onEvent(event);
  };

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const response = await client.beta.messages.create({
      model: profile.model,
      max_tokens: 8000,
      system: [{ type: "text", text: profile.system, cache_control: { type: "ephemeral" } }],
      tools: profile.tools,
      messages,
      output_config: { effort: profile.effort },
      ...fallbackOptions(profile.model),
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
      const warning = profile.preface?.(request.message, language) ?? null;
      const answer = matchScript(
        toPlainText(
          response.content
            .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
            .map((block) => block.text)
            .join("\n"),
        ),
        language,
      );
      const text = warning ? `${warning}\n\n${answer}` : answer;
      return { text, events };
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of toolUses) {
      // The vehicle confirmed so far (earlier turns or this one), so rules that
      // depend on it don't rely on the model remembering to pass it along.
      const lastVehicle = [...events].reverse().find((e) => e.type === "vehicle") as
        | { vehicle?: { key?: string } }
        | undefined;
      const knownVehicleKey = lastVehicle?.vehicle?.key ?? request.vehicleKey;
      emit(profile.statusEvent(use.name));
      try {
        const outcome = await profile.runTool(
          api,
          use.name,
          (use.input ?? {}) as Record<string, unknown>,
          newEstimateId,
          cardLocale,
          knownVehicleKey,
        );
        outcome.events.forEach(emit);
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: outcome.content,
          is_error: outcome.isError,
        });
      } catch (error) {
        const message = profile.toolFailure(error instanceof WorldpacError);
        if (!(error instanceof WorldpacError)) console.error("repair-chat tool error", error);
        else console.error("repair-chat worldpac error", error.kind, error.message);
        results.push({ type: "tool_result", tool_use_id: use.id, content: message, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }

  return { text: "", events };
}
