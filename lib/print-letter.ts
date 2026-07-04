/**
 * Print just the on-screen letter preview. Adds `printing-letter` to <body> so
 * the @media print rules in globals.css isolate the `.print-letter` block, calls
 * print(), then removes the class (on afterprint, with a timeout fallback).
 * Requires a `.print-letter` element to be visible (i.e. the preview is showing).
 */
export function printLetter(): void {
  if (typeof window === "undefined") return;
  const body = document.body;
  body.classList.add("printing-letter");
  const cleanup = () => {
    body.classList.remove("printing-letter");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  setTimeout(cleanup, 1500);
}

/**
 * Open a drafted letter as a REAL, server-rendered PDF in a new tab. Preferred
 * over printLetter() for anything printed from a modal/dialog: window.print()
 * of an on-screen preview produced blank pages depending on the browser and
 * whether the surrounding container was scrollable/fixed-position. Reuses the
 * same government-format renderer as the filed counter-reply and RTI PDFs.
 * Returns null on success, or an error message.
 */
export async function openDraftPdf(title: string, text: string): Promise<string | null> {
  try {
    const res = await fetch("/api/pdf/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, text }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return d.error || `Could not generate the PDF (HTTP ${res.status}).`;
    }
    const url = URL.createObjectURL(await res.blob());
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Could not generate the PDF.";
  }
}
