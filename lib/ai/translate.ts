import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractJson, extractorSystem } from "@/lib/ai/json-extract";
import { isAiConfigured } from "@/lib/ai/provider";
import { fnv1a64Hex } from "@/lib/intelligence/case-hash";

/**
 * On-demand translation of civic-works free text, in either direction:
 *  - Kannada → English (translateToEnglish): the Case File / Evidence Dossier
 *    pages render extracted content in English, not just switch UI labels.
 *  - English → Kannada (translateToKannada): the AI Advisor generates its
 *    narrative once in English and derives the Kannada view by TRANSLATION,
 *    so it never pays for a second full AI reasoning run per language.
 *
 * Distinct from lib/i18n, which is static-chrome-only by design.
 *
 * Cached in translation_cache (mig 0042) by content hash so a repeated string
 * and a repeat page view never re-hit the model. Strings that don't need the
 * target language (English→Kannada: text with no Latin letters; Kannada→English:
 * text with no Kannada script) pass through unchanged. Best-effort: on any
 * failure (AI off, parse error) a string maps to itself — never throws, never
 * renders blank.
 */

const KANNADA = /[ಀ-೿]/; // Kannada Unicode block
const LATIN = /[A-Za-z]/;
const CHUNK = 40;

const SYSTEM_EN =
  "Translate BBMP / PWD (Karnataka government civil-works) text from Kannada, or mixed Kannada-English, into clear English. Preserve ALL numbers, dates, amounts, GSTIN/PAN and reference codes EXACTLY as written. Keep official term names recognizable (e.g. Technical Sanction, Work Order, KW-4 agreement). Do not add commentary or omit anything.";

const SYSTEM_KN =
  "Translate BBMP / PWD (Karnataka government civil-works) text into formal Kannada (ಕನ್ನಡ). Preserve ALL numbers, dates, amounts, percentages, GSTIN/PAN and reference codes EXACTLY as written, using standard Arabic numerals (0,1,2,3,4,5,6,7,8,9) — NEVER Kannada-script digits (೦೧೨೩೪೫೬೭೮೯). Keep official English term names recognizable (e.g. Technical Sanction, Work Order, KW-4 agreement, RTI). Do not add commentary or omit anything.";

/** One translation direction: which strings need translating, the model prompt,
 *  and the cache key (namespaced by target so the two directions never collide). */
interface Direction {
  target: "en" | "kn";
  targetName: string;
  system: string;
  needs: (s: string) => boolean;
  key: (s: string) => string;
}

const DIR_EN: Direction = {
  target: "en",
  targetName: "English",
  system: SYSTEM_EN,
  needs: (s) => KANNADA.test(s),
  // Unchanged from the original one-directional implementation, so every
  // English translation already cached keeps hitting.
  key: (s) => fnv1a64Hex(s),
};

const DIR_KN: Direction = {
  target: "kn",
  targetName: "Kannada",
  system: SYSTEM_KN,
  needs: (s) => LATIN.test(s),
  // Namespaced so an English source's Kannada translation can never collide
  // with a Kannada source's English translation in the shared cache table.
  key: (s) => fnv1a64Hex(`kn:${s}`),
};

/**
 * Translate one group of strings, writing successes into `result`. If some
 * inputs come back missing (a common cause is one very long string truncating
 * the whole batch's JSON output), the group is SPLIT and retried so one
 * oversized string can no longer poison up to 39 others — it isolates down to a
 * single string, which then simply falls back to identity upstream. Recursion
 * strictly shrinks the group, so it always terminates.
 */
async function translateChunk(dir: Direction, strings: string[], result: Map<string, string>): Promise<void> {
  if (!strings.length) return;
  const items = strings.map((src, id) => ({ id, src }));
  const r = await extractJson<{ items?: { id: number; out: string }[] }>({
    system: extractorSystem(dir.system),
    prompt: `Translate each item's "src" text to ${dir.targetName}. Output STRICT JSON of EXACTLY this shape, one entry per input id:\n{"items":[{"id":0,"out":"translated text"}]}\n\nINPUT:\n${JSON.stringify(items)}`,
    fallback: {},
    maxTokens: 8000,
  });
  const got = new Set<number>();
  for (const it of r.data?.items ?? []) {
    const orig = strings[it.id];
    if (orig != null && typeof it.out === "string" && it.out.trim()) { result.set(orig, it.out.trim()); got.add(it.id); }
  }
  const missing = strings.filter((_, i) => !got.has(i));
  if (missing.length && strings.length > 1) {
    const mid = Math.ceil(missing.length / 2);
    await translateChunk(dir, missing.slice(0, mid), result);
    if (missing.length > 1) await translateChunk(dir, missing.slice(mid), result);
  }
  // strings.length === 1 and still missing → give up (identity fallback upstream).
}

async function aiTranslateBatch(dir: Direction, strings: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (let i = 0; i < strings.length; i += CHUNK) {
    await translateChunk(dir, strings.slice(i, i + CHUNK), result);
  }
  return result;
}

/**
 * Core: returns a Map from each input string to its rendering in `dir.target`.
 * Every non-empty input is present in the map (mapping to itself if it needs no
 * translation, is uncached and AI is off/failed).
 */
async function translateBatch(admin: SupabaseClient, texts: string[], dir: Direction): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(texts.map((t) => (t ?? "").trim()).filter(Boolean))];
  if (!unique.length) return out;

  // Passthrough anything already in / not needing the target language.
  const toTranslate: string[] = [];
  for (const t of unique) {
    if (dir.needs(t)) toTranslate.push(t);
    else out.set(t, t);
  }
  if (!toTranslate.length) return out;

  const hashByText = new Map(toTranslate.map((t) => [t, dir.key(t)] as const));

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

  const missing = toTranslate.filter((t) => !out.has(t));
  if (missing.length && isAiConfigured()) {
    const translated = await aiTranslateBatch(dir, missing);
    const rows: { source_hash: string; target_lang: string; translated_text: string }[] = [];
    for (const t of missing) {
      const tr = translated.get(t);
      if (tr) {
        out.set(t, tr);
        rows.push({ source_hash: hashByText.get(t)!, target_lang: dir.target, translated_text: tr });
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
  for (const t of toTranslate) if (!out.has(t)) out.set(t, t);
  return out;
}

/** Kannada (or mixed) → English. Map keys are the trimmed source strings. */
export function translateToEnglish(admin: SupabaseClient, texts: string[]): Promise<Map<string, string>> {
  return translateBatch(admin, texts, DIR_EN);
}

/** English (or mixed) → formal Kannada. Map keys are the trimmed source strings. */
export function translateToKannada(admin: SupabaseClient, texts: string[]): Promise<Map<string, string>> {
  return translateBatch(admin, texts, DIR_KN);
}

/** Convenience: translate one string to English (or return it unchanged). */
export async function translateOne(admin: SupabaseClient, text: string | null | undefined): Promise<string> {
  const t = (text ?? "").trim();
  if (!t) return "";
  const map = await translateToEnglish(admin, [t]);
  return map.get(t) ?? t;
}
