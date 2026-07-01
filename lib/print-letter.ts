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
