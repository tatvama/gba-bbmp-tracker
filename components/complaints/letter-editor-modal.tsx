"use client";

import * as React from "react";
import { Bold, Italic, Heading2, ListOrdered, List, Eye, Pencil, Save, Printer, Info, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { LetterPreview } from "@/components/complaints/letter-preview";
import { openDraftPdf } from "@/lib/print-letter";

/** Wrap the selection (or a placeholder word) in a markdown marker, e.g. **bold**. */
function wrapSelection(ta: HTMLTextAreaElement, value: string, onChange: (v: string) => void, marker: string, placeholder: string) {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const before = value.slice(0, start);
  const selected = value.slice(start, end) || placeholder;
  const after = value.slice(end);
  onChange(`${before}${marker}${selected}${marker}${after}`);
  const selStart = before.length + marker.length;
  const selEnd = selStart + selected.length;
  requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(selStart, selEnd); });
}

/** Prefix the current line with a markdown block marker, e.g. ## heading. */
function prefixLine(ta: HTMLTextAreaElement, value: string, onChange: (v: string) => void, prefix: string) {
  const start = ta.selectionStart;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  onChange(value.slice(0, lineStart) + prefix + value.slice(lineStart));
  const caret = start + prefix.length;
  requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(caret, caret); });
}

/** Prefix every line touched by the selection, e.g. turning 3 lines into a numbered/bulleted list. */
function prefixLines(ta: HTMLTextAreaElement, value: string, onChange: (v: string) => void, makePrefix: (i: number) => string) {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const blockStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = value.indexOf("\n", end);
  const blockEnd = nextBreak === -1 ? value.length : nextBreak;
  const block = value.slice(blockStart, blockEnd);
  const newBlock = block.split("\n").map((l, i) => `${makePrefix(i)}${l}`).join("\n");
  onChange(value.slice(0, blockStart) + newBlock + value.slice(blockEnd));
  const caret = blockStart + newBlock.length;
  requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(caret, caret); });
}

const toggleCls = (active: boolean) =>
  `flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors ${active ? "bg-background shadow-sm" : "text-muted-foreground"}`;

/**
 * Full-screen editor for an AI-drafted letter: a small markdown formatting
 * toolbar, an Edit / Preview toggle (reusing LetterPreview for the print-ready
 * render), and Save / Print actions. The parent owns `value` — every toolbar
 * action and keystroke flows back through `onChange` immediately.
 */
export function LetterEditorModal({
  open,
  onOpenChange,
  title,
  value,
  onChange,
  onSave,
  saving = false,
  savedAt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void | Promise<void>;
  saving?: boolean;
  savedAt?: string | null;
}) {
  const [mode, setMode] = React.useState<"edit" | "preview">("edit");
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const [pdfError, setPdfError] = React.useState<string | null>(null);
  const taRef = React.useRef<HTMLTextAreaElement>(null);

  function act(fn: (ta: HTMLTextAreaElement) => void) {
    const ta = taRef.current;
    if (!ta) return;
    fn(ta);
  }

  async function handlePrint() {
    setPdfBusy(true);
    setPdfError(null);
    const err = await openDraftPdf(title, value);
    setPdfBusy(false);
    if (err) setPdfError(err);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] w-[95vw] max-w-5xl max-h-[88vh] flex-col gap-3 p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="no-print flex flex-wrap items-center gap-2 border-b pb-3">
          <div className="flex items-center gap-1 rounded-md border bg-muted/40 p-0.5 text-xs">
            <button type="button" onClick={() => setMode("edit")} className={toggleCls(mode === "edit")}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button type="button" onClick={() => setMode("preview")} className={toggleCls(mode === "preview")}>
              <Eye className="h-3.5 w-3.5" /> Preview
            </button>
          </div>

          {mode === "edit" && (
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" size="icon-sm" title="Bold" onClick={() => act((ta) => wrapSelection(ta, value, onChange, "**", "bold text"))}>
                <Bold className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="outline" size="icon-sm" title="Italic" onClick={() => act((ta) => wrapSelection(ta, value, onChange, "*", "italic text"))}>
                <Italic className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="outline" size="icon-sm" title="Heading" onClick={() => act((ta) => prefixLine(ta, value, onChange, "## "))}>
                <Heading2 className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="outline" size="icon-sm" title="Numbered list" onClick={() => act((ta) => prefixLines(ta, value, onChange, (i) => `${i + 1}. `))}>
                <ListOrdered className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="outline" size="icon-sm" title="Bulleted list" onClick={() => act((ta) => prefixLines(ta, value, onChange, () => "- "))}>
                <List className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          <span className="ml-auto hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
            <Info className="h-3.5 w-3.5 shrink-0" />
            {mode === "edit"
              ? "Select text, then click a button to format. Switch to Preview to see the final letter."
              : "This is exactly how the letter will print. Switch to Edit to make changes."}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {mode === "edit" ? (
            <textarea
              ref={taRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="The generated letter appears here and is fully editable…"
              className="h-full w-full resize-none rounded-md border border-input bg-background p-4 font-mono text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          ) : (
            <LetterPreview markdown={value} />
          )}
        </div>

        {pdfError && (
          <p className="flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> {pdfError}</p>
        )}
        <DialogFooter className="border-t pt-3">
          {savedAt && (
            <span className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-emerald-600" /> Saved {savedAt}
            </span>
          )}
          <Button type="button" variant="outline" onClick={() => void handlePrint()} loading={pdfBusy}>
            <Printer className="h-4 w-4" /> {pdfBusy ? "Generating…" : "Print / PDF"}
          </Button>
          <Button type="button" onClick={() => void onSave()} loading={saving}>
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
