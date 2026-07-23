/**
 * Re-address a complaint letter to the TVCC (PURE, framework-free, unit-tested).
 *
 * The app's letters are drafted to a fixed structure (see complaint-document-
 * analyzer.ts): the recipient "To" block sits at the very top, followed by the
 * Date, a bold Subject line, salutation, numbered body, and the sender/signature
 * block at the very bottom. To produce a faithful COPY addressed to the TVCC we
 * swap only that top "To" block for the TVCC addressee and leave everything from
 * the Date/Subject onward — subject, body, requests, and signature — untouched.
 *
 * Deterministic, line-based, and defensive: if the expected structure isn't
 * found we degrade to prepending the TVCC addressee (so the copy is still
 * addressed to the TVCC) and report `readdressed: false` so the caller can warn.
 */

// A line that opens the addressee block: "To", "To,", "To:", "To The …", or the
// Kannada "ಗೆ". Anchored to line start; \b after "To" avoids matching "Today"/"Total".
const TO_LINE = /^\s*(?:>?\s*)?(?:\*\*\s*)?(?:To\b[,:]?|ಗೆ[,:]?)/i;
// The Subject line — every letter has one; it bounds the end of the header.
const SUBJECT_LINE = /^\s*(?:>?\s*)?(?:#{1,6}\s*)?(?:\*\*\s*)?(?:Sub(?:ject)?\b|ವಿಷಯ)/i;
// The Date/Ref line that sits between the To block and the Subject.
const DATE_LINE = /^\s*(?:>?\s*)?(?:\*\*\s*)?(?:Date\b|Dated\b|Ref\b|ದಿನಾಂಕ)/i;

export interface ReaddressResult {
  /** The re-addressed letter markdown. */
  content: string;
  /** True when the original To block was located and replaced; false when we
   *  fell back to prepending (structure not recognised). */
  readdressed: boolean;
}

function firstMatch(lines: string[], re: RegExp, from = 0): number {
  for (let i = from; i < lines.length; i++) {
    if (re.test(lines[i]!)) return i;
  }
  return -1;
}

/**
 * Replace the letter's top "To" addressee block with `toBlock` (the TVCC
 * addressee, e.g. from tvccAddresseeBlock). `toBlock` is inserted as its own
 * paragraph; the Date and Subject that followed the old block are preserved.
 */
export function readdressLetterToTvcc(markdown: string, toBlock: string): ReaddressResult {
  const src = (markdown ?? "").replace(/\r\n/g, "\n");
  const block = toBlock.split("\n");
  const lines = src.split("\n");

  const subjectIdx = firstMatch(lines, SUBJECT_LINE);
  // Only treat a "To" line as the addressee when it appears before the Subject
  // (i.e. in the header) — this avoids matching a body sentence like "To ensure…".
  const toLimit = subjectIdx >= 0 ? subjectIdx : lines.length;
  const toIdx = firstMatch(lines.slice(0, toLimit), TO_LINE);

  if (toIdx >= 0) {
    // End of the old To block = the Date or Subject line, whichever comes first
    // after it. Everything in [toIdx, endIdx) is the old addressee.
    const dateIdx = firstMatch(lines, DATE_LINE, toIdx + 1);
    const candidates = [dateIdx, subjectIdx].filter((i) => i > toIdx);
    const endIdx = candidates.length ? Math.min(...candidates) : toIdx + 1;
    const rebuilt = [...lines.slice(0, toIdx), ...block, "", ...lines.slice(endIdx)];
    return { content: collapseBlankRun(rebuilt).join("\n"), readdressed: true };
  }

  if (subjectIdx >= 0) {
    // No recognisable To block, but there is a Subject — insert the TVCC
    // addressee just above it so the copy is properly addressed.
    const rebuilt = [...lines.slice(0, subjectIdx), ...block, "", ...lines.slice(subjectIdx)];
    return { content: collapseBlankRun(rebuilt).join("\n"), readdressed: false };
  }

  // Nothing to anchor on — prepend the addressee to the whole letter.
  return { content: `${toBlock}\n\n${src}`.trimEnd() + "\n", readdressed: false };
}

/** Collapse 3+ consecutive blank lines down to one, and trim leading blanks. */
function collapseBlankRun(lines: string[]): string[] {
  const out: string[] = [];
  let blanks = 0;
  for (const l of lines) {
    if (l.trim() === "") {
      blanks++;
      if (blanks > 1) continue;
    } else {
      blanks = 0;
    }
    out.push(l);
  }
  while (out.length && out[0]!.trim() === "") out.shift();
  return out;
}
