import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractJson, extractorSystem } from "@/lib/ai/json-extract";
import { isAiConfigured } from "@/lib/ai/provider";
import { fnv1a64Hex } from "@/lib/intelligence/case-hash";

/**
 * On-demand English rendering of Kannada (or mixed) free text — for the Case
 * File and Evidence Dossier pages, which must show the actual extracted content
 * (forensic findings, AA/TS/KW-4/tender references, complaint narrative,
 * timeline) in English, not just switch UI labels. Distinct from lib/i18n,
 * which is static-chrome-only by design.
 *
 * Cached in translation_cache (mig 0042) by content hash so a repeated string
 * and a repeat page view never re-hit the model. Strings with no Kannada script
 * are passed through unchanged (already English/numeric). Best-effort: on any
 * failure (AI off, parse error) a string maps to itself — never throws, never
 * renders blank.
 */

const KANNADA = /[ಀ-೿]/; // Kannada Unicode block
const CHUNK = 40;

function needsTranslation(s: string): boolean {
  return KANNADA.test(s);
}

const TRANSLATE_SYSTEM =
  "Translate BBMP / PWD (Karnataka government civil-works) text from Kannada, or mixed Kannada-English, into clear English. Preserve ALL numbers, dates, amounts, GSTIN/PAN and reference codes EXACTLY as written. Keep official term names recognizable (e.g. Technical Sanction, Work Order, KW-4 agreement). Do not add commentary or omit anything.";

/**
 * Translate one group of strings, writing successes into `result`. If some
 * inputs come back missing (a common cause is one very long string truncating
 * the whole batch's JSON output), the group is SPLIT and retried so one
 * oversized string can no longer poison up to 39 others — it isolates down to a
 * single string, which then simply falls back to identity upstream. Recursion
 * strictly shrinks the group, so it always terminates.
 */
async function translateChunk(strings: string[], result: Map<string, string>): Promise<void> {
  if (!strings.length) return;
  const items = strings.map((kn, id) => ({ id, kn }));
  const r = await extractJson<{ items?: { id: number; en: string }[] }>({
    system: extractorSystem(TRANSLATE_SYSTEM),
    prompt: `Translate each item's "kn" text to English. Output STRICT JSON of EXACTLY this shape, one entry per input id:\n{"items":[{"id":0,"en":"english text"}]}\n\nINPUT:\n${JSON.stringify(items)}`,
    fallback: {},
    maxTokens: 8000,
  });
  const got = new Set<number>();
  for (const it of r.data?.items ?? []) {
    const orig = strings[it.id];
    if (orig != null && typeof it.en === "string" && it.en.trim()) { result.set(orig, it.en.trim()); got.add(it.id); }
  }
  const missing = strings.filter((_, i) => !got.has(i));
  if (missing.length && strings.length > 1) {
    const mid = Math.ceil(missing.length / 2);
    await translateChunk(missing.slice(0, mid), result);
    if (missing.length > 1) await translateChunk(missing.slice(mid), result);
  }
  // strings.length === 1 and still missing → give up (identity fallback upstream).
}

async function aiTranslateBatch(strings: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (let i = 0; i < strings.length; i += CHUNK) {
    await translateChunk(strings.slice(i, i + CHUNK), result);
  }
  return result;
}

/**
 * Returns a Map from each input string to its English rendering. Every non-empty
 * input is present in the map (mapping to itself if it needs no translation, is
 * uncached and AI is off/failed).
 */
export async function translateToEnglish(admin: SupabaseClient, texts: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(texts.map((t) => (t ?? "").trim()).filter(Boolean))];
  if (!unique.length) return out;

  // Passthrough anything already English/numeric.
  const kannada: string[] = [];
  for (const t of unique) {
    if (needsTranslation(t)) kannada.push(t);
    else out.set(t, t);
  }
  if (!kannada.length) return out;

  const hashByText = new Map(kannada.map((t) => [t, fnv1a64Hex(t)] as const));

  // Cache lookup.
  try {
    const { data } = await admin
      .from("translation_cache")
      .select("source_hash, translated_text")
      .in("source_hash", [...hashByText.values()]);
    const byHash = new Map((data ?? []).map((r) => [r.source_hash as string, r.translated_text as string]));
    for (const [text, hash] of hashByText) {
      const hit = byHash.get(hash);
      if (hit) out.set(text, hit);
    }
  } catch {
    /* cache table absent / query failed — fall through to translate */
  }

  const missing = kannada.filter((t) => !out.has(t));
  if (missing.length && isAiConfigured()) {
    const translated = await aiTranslateBatch(missing);
    const rows: { source_hash: string; target_lang: string; translated_text: string }[] = [];
    for (const t of missing) {
      const en = translated.get(t);
      if (en) {
        out.set(t, en);
        rows.push({ source_hash: hashByText.get(t)!, target_lang: "en", translated_text: en });
      }
    }
    if (rows.length) {
      try {
        await admin.from("translation_cache").upsert(rows, { onConflict: "source_hash" });
      } catch (e) {
        console.warn("[translate] cache write failed", e);
      }
    }
  }

  // Anything still unresolved (AI off / failed) → identity, so nothing renders blank.
  for (const t of kannada) if (!out.has(t)) out.set(t, t);
  return out;
}

/** Convenience: translate one string (or return it unchanged). */
export async function translateOne(admin: SupabaseClient, text: string | null | undefined): Promise<string> {
  const t = (text ?? "").trim();
  if (!t) return "";
  const map = await translateToEnglish(admin, [t]);
  return map.get(t) ?? t;
}
