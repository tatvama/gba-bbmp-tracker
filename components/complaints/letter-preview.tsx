"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Eye, Pencil } from "lucide-react";

/**
 * Renders a Markdown letter as a formatted, print-ready document (letterhead
 * paper look, real headings/bold/lists). The `.print-letter` class lets the
 * global @media print rules isolate just this block on Print/PDF.
 */
export function LetterPreview({ markdown, className = "" }: { markdown: string; className?: string }) {
  return (
    <div
      className={`print-letter mx-auto max-w-[820px] rounded-md border bg-white text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-50 ${className}`}
    >
      <div className="px-8 py-10 text-[13.5px] leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 className="mb-3 text-center text-lg font-bold uppercase tracking-wide">{children}</h1>,
            h2: ({ children }) => <h2 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-slate-800">{children}</h2>,
            h3: ({ children }) => <h3 className="mb-1.5 mt-4 text-sm font-semibold">{children}</h3>,
            p: ({ children }) => <p className="mb-3 whitespace-pre-wrap">{children}</p>,
            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
            ul: ({ children }) => <ul className="mb-3 ml-5 list-disc space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="mb-3 ml-5 list-decimal space-y-1">{children}</ol>,
            li: ({ children }) => <li className="pl-1">{children}</li>,
            hr: () => <hr className="my-4 border-slate-300" />,
            blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-slate-300 pl-3 italic text-slate-600">{children}</blockquote>,
            a: ({ children, href }) => <a href={href} className="underline">{children}</a>,
            table: ({ children }) => <table className="my-3 w-full border-collapse text-xs">{children}</table>,
            th: ({ children }) => <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-semibold">{children}</th>,
            td: ({ children }) => <td className="border border-slate-300 px-2 py-1 align-top">{children}</td>,
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  );
}

/**
 * Editable letter area with a Preview / Edit toggle — formatted preview by
 * default, raw Markdown editing on toggle. Reused by the workflow's counter-reply
 * and escalation panels so drafts render as letters, not raw markdown.
 */
export function LetterDraftArea({
  value,
  onChange,
  rows = 16,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  const [view, setView] = React.useState<"preview" | "edit">("preview");
  return (
    <div className="space-y-2">
      <div className="no-print flex w-fit items-center gap-1 rounded-md border bg-muted/40 p-0.5 text-xs">
        <button type="button" onClick={() => setView("preview")} className={`flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors ${view === "preview" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
          <Eye className="h-3.5 w-3.5" /> Preview
        </button>
        <button type="button" onClick={() => setView("edit")} className={`flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors ${view === "edit" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
      </div>
      {view === "preview" ? (
        <LetterPreview markdown={value} />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className="w-full rounded-md border border-input bg-background p-3 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}
    </div>
  );
}
