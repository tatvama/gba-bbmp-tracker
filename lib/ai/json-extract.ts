import "server-only";
import { generateText, isAiConfigured } from "@/lib/ai/provider";

/**
 * Shared strict-JSON extraction for the forensic AI extractors. Extraction only
 * (temperature 0) — the model transcribes what it sees; the deterministic
 * engines judge. Env-gated: returns the fallback (+ ok:false) with no API key.
 */
export interface ExtractResult<T> {
  ok: boolean;
  data: T;
  error?: string;
}

export async function extractJson<T>(args: {
  system: string;
  prompt: string;
  fallback: T;
  maxTokens?: number;
}): Promise<ExtractResult<T>> {
  if (!isAiConfigured()) return { ok: false, error: "AI not configured", data: args.fallback };
  const r = await generateText({ system: args.system, prompt: args.prompt, temperature: 0, maxTokens: args.maxTokens ?? 3000 });
  if (!r.ok || !r.text) return { ok: false, error: r.error ?? "AI request failed", data: args.fallback };
  const cleaned = r.text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return { ok: true, data: JSON.parse(cleaned) as T };
  } catch {
    return { ok: false, error: "Could not parse AI output", data: args.fallback };
  }
}

const EXTRACT_RULE =
  "You transcribe Indian government civil-works documents (BBMP/PWD, Bengaluru) from OCR text into structured JSON. Transcribe ONLY what is visible — never compute, correct, judge, or decide legality. Use null/empty when a value is not clearly present. Output STRICT JSON only, no prose, no markdown.";

export function extractorSystem(role: string): string {
  return `${EXTRACT_RULE}\n${role}`;
}
