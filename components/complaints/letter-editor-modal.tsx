"use client";

import * as React from "react";
import {
  Bold, Italic, Heading2, ListOrdered, List, Eye, Pencil, Save, Printer,
  Info, Check, AlertTriangle, Sparkles, BookOpen, Type, CheckSquare,
  Maximize2, Minimize2, Link2, Table as TableIcon, Minus, Quote,
  Undo2, Redo2, Search, HelpCircle, Code, AlignLeft, Underline, Strikethrough
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { LetterPreview } from "@/components/complaints/letter-preview";
import { openDraftPdf } from "@/lib/print-letter";
import { transformDraft } from "@/lib/actions/ai";
import { cn } from "@/lib/utils";

/** Wrap the selection in markdown markers. */
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

/** Prefix the line with a block marker. */
function prefixLine(ta: HTMLTextAreaElement, value: string, onChange: (v: string) => void, prefix: string) {
  const start = ta.selectionStart;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  onChange(value.slice(0, lineStart) + prefix + value.slice(lineStart));
  const caret = start + prefix.length;
  requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(caret, caret); });
}

/** Prefix every line touched by the selection. */
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
  `flex items-center gap-1 rounded px-2.5 py-1 font-semibold transition-all duration-200 ${
    active ? "bg-background text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
  }`;

export function LetterEditorModal({
  open,
  onOpenChange,
  title,
  value,
  onChange,
  onSave,
  saving = false,
  savedAt,
  reference,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void | Promise<void>;
  saving?: boolean;
  savedAt?: string | null;
  /** Complaint internal case number — stamped (text + QR) on the printed PDF. */
  reference?: string | null;
}) {
  const [mode, setMode] = React.useState<"edit" | "preview">("edit");
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const [pdfError, setPdfError] = React.useState<string | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [showFindReplace, setShowFindReplace] = React.useState(false);
  const [findText, setFindText] = React.useState("");
  const [replaceText, setReplaceText] = React.useState("");
  const [savedScrollPos, setSavedScrollPos] = React.useState(0);
  const [history, setHistory] = React.useState<string[]>([value]);
  const [historyIndex, setHistoryIndex] = React.useState(0);

  const taRef = React.useRef<HTMLTextAreaElement>(null);

  // Lock body scroll and restore on close
  React.useEffect(() => {
    if (open) {
      setSavedScrollPos(window.scrollY);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      window.scrollTo(0, savedScrollPos);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Track history for undo/redo
  const handleContentChange = (newValue: string) => {
    onChange(newValue);
    const nextHistory = history.slice(0, historyIndex + 1);
    setHistory([...nextHistory, newValue]);
    setHistoryIndex(nextHistory.length);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const idx = historyIndex - 1;
      setHistoryIndex(idx);
      onChange(history[idx] || "");
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const idx = historyIndex + 1;
      setHistoryIndex(idx);
      onChange(history[idx] || "");
    }
  };

  function act(fn: (ta: HTMLTextAreaElement) => void) {
    const ta = taRef.current;
    if (!ta) return;
    fn(ta);
  }

  async function handlePrint() {
    setPdfBusy(true);
    setPdfError(null);
    const err = await openDraftPdf(title, value, { reference });
    setPdfBusy(false);
    if (err) setPdfError(err);
  }

  const handleAiRefinement = async (action: string) => {
    if (!value.trim()) return;
    setAiLoading(true);
    setPdfError(null);
    try {
      let instruction = "";
      if (action === "rewrite") instruction = "Rewrite the document to make it clear, concise, and professional.";
      else if (action === "grammar") instruction = "Fix all grammar, spelling, punctuation, and structural issues.";
      else if (action === "simplify") instruction = "Simplify the language to be clear and easy to understand.";
      else if (action === "formal") instruction = "Rewrite this document in a formal tone.";
      else if (action === "legal") instruction = "Rewrite this document in a precise legal tone, referencing standard policies.";
      else if (action === "professional") instruction = "Rewrite this document in a professional business tone.";
      else if (action === "shorten") instruction = "Shorten the document while preserving all critical information.";
      else if (action === "expand") instruction = "Expand on the details and context to make it comprehensive.";

      if (instruction) {
        const r = await transformDraft(value, instruction);
        if (r.ok && r.text) {
          handleContentChange(r.text);
        } else {
          setPdfError(r.error || "AI transformation failed.");
        }
      }
    } catch (e) {
      setPdfError("AI transformation failed due to server error.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleFindReplace = () => {
    if (!findText) return;
    const regex = new RegExp(findText, "gi");
    const newValue = value.replace(regex, replaceText);
    handleContentChange(newValue);
  };

  // Stats calculation
  const charCount = value.length;
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex flex-col gap-3 p-4 sm:p-6 transition-all duration-300 bg-background border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden",
          isFullscreen
            ? "w-screen h-screen max-w-none max-h-none rounded-none inset-0 translate-x-0 translate-y-0"
            : "h-[88vh] w-[90vw] max-w-5xl max-h-[88vh] rounded-2xl"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3.5 bg-slate-50/50 dark:bg-slate-900/30 -mx-6 px-6 -mt-6 pt-5">
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
            <DialogTitle className="font-extrabold text-slate-800 dark:text-slate-100 text-sm tracking-tight">{title}</DialogTitle>
          </div>

          <div className="flex items-center gap-2">
            {/* View / Edit Toggle */}
            <div className="flex items-center gap-0.5 border rounded-lg bg-muted/40 p-0.5 text-xs mr-2">
              <button type="button" onClick={() => setMode("edit")} className={toggleCls(mode === "edit")}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button type="button" onClick={() => setMode("preview")} className={toggleCls(mode === "preview")}>
                <Eye className="h-3.5 w-3.5" /> Preview
              </button>
            </div>

            {/* Actions */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="h-8 w-8 text-slate-500 hover:text-slate-700"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Rich Text Editor Toolbar */}
        {mode === "edit" && (
          <div className="no-print flex flex-wrap items-center gap-1.5 border-b pb-3 -mx-2">
            <div className="flex flex-wrap items-center gap-1">
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Bold" onClick={() => act((ta) => wrapSelection(ta, value, handleContentChange, "**", "bold text"))}>
                <Bold className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Italic" onClick={() => act((ta) => wrapSelection(ta, value, handleContentChange, "*", "italic text"))}>
                <Italic className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Underline" onClick={() => act((ta) => wrapSelection(ta, value, handleContentChange, "<u>", "underlined text"))}>
                <Underline className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Strikethrough" onClick={() => act((ta) => wrapSelection(ta, value, handleContentChange, "~~", "strikethrough text"))}>
                <Strikethrough className="h-3.5 w-3.5" />
              </Button>

              <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1" />

              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Heading H2" onClick={() => act((ta) => prefixLine(ta, value, handleContentChange, "## "))}>
                <Heading2 className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Numbered list" onClick={() => act((ta) => prefixLines(ta, value, handleContentChange, (i) => `${i + 1}. `))}>
                <ListOrdered className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Bulleted list" onClick={() => act((ta) => prefixLines(ta, value, handleContentChange, () => "- "))}>
                <List className="h-3.5 w-3.5" />
              </Button>

              <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1" />

              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Insert Link" onClick={() => act((ta) => wrapSelection(ta, value, handleContentChange, "[link](url)", ""))}>
                <Link2 className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Insert Table" onClick={() => act((ta) => wrapSelection(ta, value, handleContentChange, "\n| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |\n", ""))}>
                <TableIcon className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Horizontal Line" onClick={() => act((ta) => wrapSelection(ta, value, handleContentChange, "\n---\n", ""))}>
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Block Quote" onClick={() => act((ta) => prefixLine(ta, value, handleContentChange, "> "))}>
                <Quote className="h-3.5 w-3.5" />
              </Button>

              <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1" />

              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Undo" onClick={handleUndo} disabled={historyIndex === 0}>
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Redo" onClick={handleRedo} disabled={historyIndex === history.length - 1}>
                <Redo2 className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className={cn("h-7 w-7", showFindReplace && "bg-muted text-primary")} onClick={() => setShowFindReplace(!showFindReplace)} title="Find & Replace">
                <Search className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* AI Refinements */}
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">AI Refine</span>
              <select
                disabled={aiLoading}
                onChange={(e) => {
                  if (e.target.value) {
                    void handleAiRefinement(e.target.value);
                    e.target.value = "";
                  }
                }}
                className="h-7 rounded border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 text-[11px] font-bold px-1.5 focus:outline-none text-primary cursor-pointer hover:bg-blue-50 transition-colors"
              >
                <option value="">Choose action...</option>
                <option value="rewrite">🔄 Rewrite Document</option>
                <option value="grammar">✍️ Improve Grammar</option>
                <option value="simplify">💡 Simplify Language</option>
                <option value="formal">👔 Formal Tone</option>
                <option value="legal">⚖️ Legal Tone</option>
                <option value="professional">💼 Professional Tone</option>
                <option value="shorten">✂️ Shorten text</option>
                <option value="expand">➕ Expand content</option>
              </select>
            </div>
          </div>
        )}

        {/* Find & Replace bar */}
        {showFindReplace && mode === "edit" && (
          <div className="flex items-center gap-2 pb-2 border-b bg-slate-50/50 dark:bg-slate-900/30 p-2 rounded-lg">
            <input
              type="text"
              placeholder="Find text..."
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              className="h-8 rounded border px-2.5 text-xs w-48 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              type="text"
              placeholder="Replace with..."
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              className="h-8 rounded border px-2.5 text-xs w-48 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Button size="sm" className="h-8" onClick={handleFindReplace}>Replace All</Button>
          </div>
        )}

        {/* Main Content Area */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/15 dark:bg-slate-950/5 relative rounded-xl border p-1">
          {aiLoading && (
            <div className="absolute inset-0 bg-white/60 dark:bg-black/60 backdrop-blur-xs z-50 flex flex-col items-center justify-center gap-3">
              <Sparkles className="h-8 w-8 text-primary animate-pulse" />
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200 animate-pulse">AI is refining your document...</p>
            </div>
          )}

          {mode === "edit" ? (
            <textarea
              ref={taRef}
              value={value}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="The generated letter appears here and is fully editable…"
              className="h-full w-full resize-none bg-background p-6 font-mono text-sm leading-relaxed focus-visible:outline-none border-none"
            />
          ) : (
            <div className="p-4">
              <LetterPreview markdown={value} />
            </div>
          )}
        </div>

        {pdfError && (
          <p className="flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> {pdfError}</p>
        )}

        {/* Sticky Footer */}
        <div className="border-t pt-3 flex flex-col md:flex-row md:items-center justify-between gap-4 -mx-6 px-6 -mb-6 pb-5 bg-slate-50/50 dark:bg-slate-900/30">
          {/* Document Stats */}
          <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <Type className="h-3.5 w-3.5" /> {charCount} Characters
            </span>
            <span className="flex items-center gap-1">
              <CheckSquare className="h-3.5 w-3.5" /> {wordCount} Words
            </span>
            <span className="flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" /> {readingTime} Min Read
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {savedAt && (
              <span className="mr-3 flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                <Check className="h-3.5 w-3.5 text-emerald-600" /> Saved {savedAt}
              </span>
            )}
            <Button type="button" variant="outline" onClick={() => void handlePrint()} loading={pdfBusy}>
              <Printer className="h-4 w-4" /> {pdfBusy ? "Generating…" : "Print / PDF"}
            </Button>
            <Button type="button" onClick={() => void onSave()} loading={saving}>
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
