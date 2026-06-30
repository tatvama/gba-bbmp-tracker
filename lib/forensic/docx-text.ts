import "server-only";
import mammoth from "mammoth";

/**
 * Extract plain text from the skill's .docx complaint letter, so the AI fallback
 * (deriveDatasetFromLetter) and the realigned preview have text to work with.
 * Best-effort: returns "" on any failure rather than throwing.
 */
export async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return (result?.value || "").trim();
  } catch (e) {
    console.warn("[forensic] extractDocxText failed", e);
    return "";
  }
}
