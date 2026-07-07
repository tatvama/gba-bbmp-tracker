import "server-only";
import type AnthropicSDK from "@anthropic-ai/sdk";
import { isPromptCacheEnabled } from "./cache-config";

/**
 * Provider-agnostic AI wrapper. Env-gated: the app works fully without a key —
 * every caller gets a clear "AI not configured" result and the manual templates
 * still function (spec §22). Defaults to Anthropic (Claude); set AI_PROVIDER to
 * switch. Keys live ONLY in env vars, never in the database.
 *
 *   AI_PROVIDER          anthropic (default) | openai | local
 *   ANTHROPIC_API_KEY    required when provider=anthropic
 *   AI_MODEL             default claude-sonnet-4-6
 *   AI_TEMPERATURE       default 0.4
 *   ANTHROPIC_PROMPT_CACHE  default true — see cache-config.ts
 */

export const AI_NOT_CONFIGURED = "AI not configured";

/**
 * Opt-in prompt caching for a single call. Only set by callers where a real
 * repeat-call pattern exists (see the prompt-caching plan) — everything else
 * omits `cache` entirely and gets today's exact request shape.
 */
export interface CacheOptions {
  /** Mark `system` as a cache breakpoint. */
  system?: boolean;
  /** TTL for every breakpoint in this call. Default "5m". */
  ttl?: "5m" | "1h";
}

/** One block of a multi-part prompt — segments concatenate in array order
 *  (identical resulting text to a plain string), with `cache: true` marking
 *  a segment as a breakpoint for everything up to and including it. */
export type PromptSegment = { text: string; cache?: boolean };

export interface GenerateParams {
  system: string;
  prompt: string | PromptSegment[];
  maxTokens?: number;
  temperature?: number;
  cache?: CacheOptions;
}

export interface GenerateResult {
  ok: boolean;
  text?: string;
  error?: string;
  provider?: string;
  model?: string;
  /** True when the model hit max_tokens — `text` is a real but incomplete prefix. */
  truncated?: boolean;
}

/** Anthropic's stable SDK types don't yet declare `ttl` on CacheControlEphemeral
 *  (installed SDK: 0.39.0) even though the API accepts it — this is the shape we
 *  actually send, cast at the call site rather than bumping the SDK for one field. */
type AnthropicCacheControl = { type: "ephemeral"; ttl?: "5m" | "1h" };
type CacheableTextBlock = { type: "text"; text: string; cache_control?: AnthropicCacheControl };

const EXTENDED_TTL_BETA_HEADER = "extended-cache-ttl-2025-04-11";

/** Exported for unit tests (__tests__/prompt-cache.test.ts) — pure, no I/O. */
export function cacheControl(ttl: CacheOptions["ttl"]): AnthropicCacheControl {
  return ttl === "1h" ? { type: "ephemeral", ttl: "1h" } : { type: "ephemeral" };
}

/** `system` as either a plain string (no caching requested / disabled) or a
 *  single cacheable text block — never changes the actual system text. */
export function buildSystemParam(system: string, cache: CacheOptions | undefined): string | CacheableTextBlock[] {
  if (!cache?.system || !isPromptCacheEnabled()) return system;
  return [{ type: "text", text: system, cache_control: cacheControl(cache.ttl) }];
}

/** `prompt` as either a plain string or an array of text blocks in the SAME
 *  order — when caching is off, segments are rejoined into one string so the
 *  request is byte-identical to the pre-caching shape. */
export function buildUserContent(prompt: GenerateParams["prompt"], cache: CacheOptions | undefined): string | CacheableTextBlock[] {
  if (typeof prompt === "string") return prompt;
  if (!isPromptCacheEnabled()) return prompt.map((seg) => seg.text).join("");
  return prompt.map((seg) => ({
    type: "text" as const,
    text: seg.text,
    ...(seg.cache ? { cache_control: cacheControl(cache?.ttl) } : {}),
  }));
}

/** Extra beta header only for the extended 1h TTL — harmless to send even if
 *  the feature has since gone GA and the flag is no longer required. */
export function requestOptionsFor(cache: CacheOptions | undefined): { headers: Record<string, string> } | undefined {
  if (cache?.ttl === "1h" && isPromptCacheEnabled()) {
    return { headers: { "anthropic-beta": EXTENDED_TTL_BETA_HEADER } };
  }
  return undefined;
}

/** Dev-only visibility into cache effectiveness (never shown to end users —
 *  spec explicitly calls for console output in development, nothing stored). */
function logCacheUsage(
  fn: string,
  cache: CacheOptions | undefined,
  usage: { cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null; input_tokens?: number | null } | undefined,
): void {
  if (process.env.NODE_ENV === "production" || !usage) return;
  if (!cache || !isPromptCacheEnabled()) {
    console.log(`[ai-cache] ${fn}: caching disabled or not requested for this call`);
    return;
  }
  const read = usage.cache_read_input_tokens ?? 0;
  const written = usage.cache_creation_input_tokens ?? 0;
  const plain = usage.input_tokens ?? 0;
  const status = read > 0 ? "HIT" : written > 0 ? "WRITE (first call, priming cache)" : "no-op (below cache minimum, or nothing matched)";
  // Cache reads are billed at ~0.1x base input price -> ~90% off those tokens.
  const savingsNote = read > 0 ? ` (~90% cost cut on ${read} of this call's input tokens)` : "";
  console.log(`[ai-cache] ${fn}: ${status} — cache_read=${read} cache_write=${written} plain_input=${plain}${savingsNote}`);
}

export function aiProvider(): string {
  return (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
}

export function aiModel(): string {
  return process.env.AI_MODEL ?? "claude-sonnet-4-6";
}

/** True only when the selected provider has a usable API key. */
export function isAiConfigured(): boolean {
  switch (aiProvider()) {
    case "anthropic":
      return !!process.env.ANTHROPIC_API_KEY;
    case "openai":
      return !!process.env.OPENAI_API_KEY;
    default:
      return false;
  }
}

export async function generateText(params: GenerateParams): Promise<GenerateResult> {
  if (!isAiConfigured()) return { ok: false, error: AI_NOT_CONFIGURED };

  const provider = aiProvider();
  const model = aiModel();
  const temperature = params.temperature ?? Number(process.env.AI_TEMPERATURE ?? "0.4");
  const maxTokens = params.maxTokens ?? 2500;

  try {
    if (provider === "anthropic") {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msg = await client.messages.create(
        {
          model,
          max_tokens: maxTokens,
          temperature,
          system: buildSystemParam(params.system, params.cache) as string | AnthropicSDK.TextBlockParam[],
          messages: [{ role: "user", content: buildUserContent(params.prompt, params.cache) as string | AnthropicSDK.TextBlockParam[] }],
        },
        requestOptionsFor(params.cache),
      );
      logCacheUsage("generateText", params.cache, msg.usage);
      const text = (msg.content as { type: string; text?: string }[])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n")
        .trim();
      return { ok: true, text, provider, model, truncated: msg.stop_reason === "max_tokens" };
    }

    // Other providers can be added by installing their SDK and adding a branch.
    return {
      ok: false,
      error: `AI provider "${provider}" is not wired in this build. Set AI_PROVIDER=anthropic.`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI request failed" };
  }
}

/**
 * Streaming variant of generateText — calls onDelta with the accumulated text
 * after every chunk so a caller can surface live progress (e.g. a background
 * job persisting partial text for the client to poll). Falls back to a single
 * non-streaming call (one final onDelta) for providers without a stream API.
 */
export async function generateTextStream(
  params: GenerateParams,
  onDelta: (accumulatedText: string) => void,
): Promise<GenerateResult> {
  if (!isAiConfigured()) return { ok: false, error: AI_NOT_CONFIGURED };

  const provider = aiProvider();
  const model = aiModel();
  const temperature = params.temperature ?? Number(process.env.AI_TEMPERATURE ?? "0.4");
  const maxTokens = params.maxTokens ?? 2500;

  if (provider !== "anthropic") {
    const r = await generateText(params);
    if (r.ok && r.text) onDelta(r.text);
    return r;
  }

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const stream = client.messages.stream(
      {
        model,
        max_tokens: maxTokens,
        temperature,
        system: buildSystemParam(params.system, params.cache) as string | AnthropicSDK.TextBlockParam[],
        messages: [{ role: "user", content: buildUserContent(params.prompt, params.cache) as string | AnthropicSDK.TextBlockParam[] }],
      },
      requestOptionsFor(params.cache),
    );
    let acc = "";
    stream.on("text", (delta) => {
      acc += delta;
      onDelta(acc);
    });
    const msg = await stream.finalMessage();
    logCacheUsage("generateTextStream", params.cache, msg.usage);
    const text = (msg.content as { type: string; text?: string }[])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();
    return { ok: true, text, provider, model, truncated: msg.stop_reason === "max_tokens" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI request failed" };
  }
}

export interface VisionImage {
  /** image/jpeg | image/png | image/webp | image/gif */
  mediaType: string;
  /** base64-encoded image bytes (no data: prefix) */
  dataBase64: string;
}

/** Multimodal generation — sends image(s) + a prompt to a vision-capable model. */
export async function generateVision(params: {
  system: string;
  prompt: string | PromptSegment[];
  images: VisionImage[];
  maxTokens?: number;
  temperature?: number;
  cache?: CacheOptions;
}): Promise<GenerateResult> {
  if (!isAiConfigured()) return { ok: false, error: AI_NOT_CONFIGURED };
  const provider = aiProvider();
  if (provider !== "anthropic") {
    return { ok: false, error: `Vision is wired only for anthropic in this build.` };
  }
  const model = aiModel();
  const temperature = params.temperature ?? 0;
  const maxTokens = params.maxTokens ?? 1500;
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const imageBlocks = params.images.map((img) => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: img.mediaType as "image/jpeg", data: img.dataBase64 },
    }));
    const userText = buildUserContent(params.prompt, params.cache);
    const textBlocks: AnthropicSDK.TextBlockParam[] = typeof userText === "string" ? [{ type: "text", text: userText }] : userText;
    const msg = await client.messages.create(
      {
        model,
        max_tokens: maxTokens,
        temperature,
        system: buildSystemParam(params.system, params.cache) as string | AnthropicSDK.TextBlockParam[],
        messages: [{ role: "user", content: [...imageBlocks, ...textBlocks] }],
      },
      requestOptionsFor(params.cache),
    );
    logCacheUsage("generateVision", params.cache, msg.usage);
    const text = (msg.content as { type: string; text?: string }[])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();
    return { ok: true, text, provider, model, truncated: msg.stop_reason === "max_tokens" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Vision request failed" };
  }
}
