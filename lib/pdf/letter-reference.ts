/**
 * Reference stamping for OUTGOING letters (Phase 2 future-proofing).
 *
 * Every letter drafted in-app can carry the complaint's internal reference —
 * printed as text AND as a QR code — so that when its BBMP acknowledgment (which
 * is usually a stamped photocopy of the very letter we submitted) is later scanned
 * back in, the reconciliation pipeline reads that reference straight off the page
 * and matches it to the right complaint with certainty. The QR survives poor
 * photocopies (error correction) where OCR of the printed text might not.
 *
 * Encoding is deliberately trivial so a future scanner just does string equality:
 *   payload = "ACK:<internal_case_number>"  (e.g. "ACK:DM-CMP-2026-000027")
 */

/** Build the QR payload for a complaint's case number. */
export function qrPayloadForCase(caseNumber: string): string {
  return `ACK:${caseNumber}`;
}

/**
 * Pull the case number out of a scanned QR / stamped text. Accepts the "ACK:" QR
 * payload we print, and also a bare case number a scanner/OCR might return.
 */
export function parseAckReference(raw: string | null | undefined): string | null {
  const s = (raw || "").trim();
  if (!s) return null;
  const m = s.match(/^ACK:(.+)$/i);
  if (m && m[1]) return m[1].trim();
  // Bare case-number heuristic (…-CMP-YYYY-NNNNNN and similar).
  if (/-CMP-\d{4}-\d{3,}/i.test(s)) return s;
  return null;
}

/** Render a small PNG data-URI QR for `payload`. Null if encoding fails. */
export async function buildQrDataUrl(payload: string): Promise<string | null> {
  try {
    const QRCode = (await import("qrcode")).default;
    return await QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 220 });
  } catch (e) {
    console.warn("[letter-reference] QR generation failed", e);
    return null;
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A right-aligned header block placed at the very top of a drafted letter:
 * "Our Ref: <reference>" + a QR of the same reference. Returned as an HTML string
 * to prepend to the letter markup (the letter renders HTML → PDF via Puppeteer).
 */
export function buildReferenceHeaderHtml(reference: string, qrDataUrl: string | null): string {
  const qr = qrDataUrl
    ? `<img src="${qrDataUrl}" alt="reference QR" style="width:64px;height:64px;display:block;margin-left:auto" />`
    : "";
  return `<div style="display:flex;justify-content:flex-end;align-items:flex-start;gap:10px;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #e2e8f0;">
    <div style="text-align:right;font-size:9.5pt;line-height:1.35;color:#334155;">
      <div style="font-weight:bold;text-transform:uppercase;letter-spacing:0.03em;color:#0f172a;">Our Ref</div>
      <div style="font-family:monospace;font-size:11pt;font-weight:bold;">${esc(reference)}</div>
      <div style="font-size:8pt;color:#64748b;">Quote this reference on any acknowledgment</div>
    </div>
    ${qr}
  </div>`;
}

/** Convenience: build the full header HTML for a case number in one call.
 *  QR image removed from the rendered header (kept as text-only "Our Ref"). */
export async function referenceHeaderForCase(caseNumber: string): Promise<string> {
  return buildReferenceHeaderHtml(caseNumber, null);
}
