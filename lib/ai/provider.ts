import "server-only";

/**
 * Provider-agnostic AI wrapper. Env-gated: the app works fully without a key —
 * every caller gets a clear "AI not configured" result and the manual templates
 * still function (spec §22). Defaults to Anthropic (Claude); set AI_PROVIDER to
 * switch. Keys live ONLY in env vars, never in the database.
 *
 *   AI_PROVIDER       anthropic (default) | openai | local
 *   ANTHROPIC_API_KEY required when provider=anthropic
 *   AI_MODEL          default claude-sonnet-4-6
 *   AI_TEMPERATURE    default 0.4
 */

export const AI_NOT_CONFIGURED = "AI not configured";

export interface GenerateParams {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateResult {
  ok: boolean;
  text?: string;
  error?: string;
  provider?: string;
  model?: string;
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
      const msg = await client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: params.system,
        messages: [{ role: "user", content: params.prompt }],
      });
      const text = (msg.content as { type: string; text?: string }[])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n")
        .trim();
      return { ok: true, text, provider, model };
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

export interface VisionImage {
  /** image/jpeg | image/png | image/webp | image/gif */
  mediaType: string;
  /** base64-encoded image bytes (no data: prefix) */
  dataBase64: string;
}

/** Multimodal generation — sends image(s) + a prompt to a vision-capable model. */
export async function generateVision(params: {
  system: string;
  prompt: string;
  images: VisionImage[];
  maxTokens?: number;
  temperature?: number;
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
    const msg = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: params.system,
      messages: [{ role: "user", content: [...imageBlocks, { type: "text", text: params.prompt }] }],
    });
    const text = (msg.content as { type: string; text?: string }[])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();
    return { ok: true, text, provider, model };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Vision request failed" };
  }
}
