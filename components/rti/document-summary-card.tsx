"use client";

import * as React from "react";
import { Eye, FileText, Copy, Check, Printer, FileDown, Clock, HelpCircle, AlignLeft, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import type { SummaryData } from "@/lib/utils/summary-generator";

interface DocumentSummaryCardProps {
  title: string;
  content: string;
  summary: SummaryData;
  documentType?: string;
  lastUpdatedDate?: string;
  printUrl?: string;
  pdfUrl?: string;
  variant?: "standalone" | "nested";
}

export function DocumentSummaryCard({
  title,
  content,
  summary,
  documentType = "Document",
  lastUpdatedDate,
  printUrl,
  pdfUrl,
  variant = "standalone",
}: DocumentSummaryCardProps) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const hasHighlights = summary.highlights && summary.highlights.length > 0;
  const showStats = summary.wordCount > 0 || summary.totalQuestions > 0;

  // Adaptive Grid Column Spans
  let summarySpan = "md:col-span-7";
  let topicsSpan = "md:col-span-3";
  let statsSpan = "md:col-span-2";

  if (!hasHighlights && showStats) {
    summarySpan = "md:col-span-9";
    statsSpan = "md:col-span-3";
  } else if (hasHighlights && !showStats) {
    summarySpan = "md:col-span-9";
    topicsSpan = "md:col-span-3";
  } else if (!hasHighlights && !showStats) {
    summarySpan = "md:col-span-12";
  }

  // Topic limits (+N More)
  const maxTopics = 5;
  const displayedTopics = summary.highlights ? summary.highlights.slice(0, maxTopics) : [];
  const remainingCount = summary.highlights ? Math.max(0, summary.highlights.length - maxTopics) : 0;

  const contentMarkup = (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 leading-relaxed">
      {/* 1. Executive Summary Column */}
      <div className={`space-y-2.5 ${summarySpan}`}>
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Executive Summary
        </h4>
        <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-sans font-normal whitespace-normal break-words">
          {summary.summaryText || "No summary details available."}
        </div>
      </div>

      {/* 2. Topics Covered Column */}
      {hasHighlights && (
        <div className={`space-y-2.5 border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-800/80 pt-6 md:pt-0 md:pl-6 ${topicsSpan}`}>
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Topics Covered
          </h4>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {displayedTopics.map((topic, idx) => (
              <Badge
                key={idx}
                variant="secondary"
                className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-slate-100/80 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 border border-slate-200/50 dark:border-slate-700/50 transition-all hover:bg-slate-200/60 dark:hover:bg-slate-750"
              >
                {topic}
              </Badge>
            ))}
            {remainingCount > 0 && (
              <Badge
                variant="outline"
                className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/50"
              >
                +{remainingCount} more
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* 3. Document Statistics Column */}
      {showStats && (
        <div className={`space-y-2.5 border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-800/80 pt-6 md:pt-0 md:pl-6 ${statsSpan}`}>
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Statistics
          </h4>
          <div className="space-y-2.5 pt-0.5 text-xs font-sans text-slate-500 dark:text-slate-400">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-slate-400" />
                <span>Type</span>
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">{documentType}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
                <span>Questions</span>
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">{summary.totalQuestions}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlignLeft className="h-3.5 w-3.5 text-slate-400" />
                <span>Words</span>
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">{summary.wordCount.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                <span>Reading Time</span>
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">{summary.readingTimeMin} min</span>
            </div>
            {lastUpdatedDate && (
              <div className="flex items-center justify-between border-t border-slate-100/50 dark:border-slate-800/50 pt-2 mt-2">
                <span className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>Updated</span>
                </span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{formatDate(lastUpdatedDate)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const viewDetailsButton = (
    <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800/80">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!content}
        className="shrink-0 gap-1.5 text-xs px-3.5 h-8 font-medium rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Eye className="h-3.5 w-3.5" /> View Details
      </Button>
    </div>
  );

  return (
    <>
      {variant === "standalone" ? (
        <Card className="w-full border border-slate-200 dark:border-slate-800/80 shadow-sm rounded-xl overflow-hidden bg-white dark:bg-slate-950">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/30 dark:bg-slate-900/10 py-3.5 px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100 font-sans">
                {title}
              </CardTitle>
              {documentType && (
                <Badge variant="outline" className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800">
                  {documentType}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {contentMarkup}
            {viewDetailsButton}
          </CardContent>
        </Card>
      ) : (
        <div className="w-full bg-slate-50/50 dark:bg-slate-900/10 p-5 rounded-xl border border-slate-100 dark:border-slate-850 space-y-6">
          {contentMarkup}
          {viewDetailsButton}
        </div>
      )}

      {/* Responsive View Details Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="fixed left-0 top-0 translate-x-0 translate-y-0 w-full h-full max-h-full rounded-none sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[90vw] sm:h-[90vh] md:w-[85vw] md:h-[85vh] md:max-w-4xl sm:rounded-xl flex flex-col p-6 overflow-hidden bg-white dark:bg-slate-950 border dark:border-slate-800 shadow-lg">
          <DialogHeader className="border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0 flex flex-row items-center justify-between">
            <DialogTitle className="text-base font-semibold font-sans flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <FileText className="h-4 w-4 text-indigo-500" />
              {title} Details
            </DialogTitle>
          </DialogHeader>

          {/* Preserves formatting in standard serif body font */}
          <div className="flex-1 overflow-y-auto my-4 pr-1 select-text scrollbar-thin">
            <div className="font-serif text-sm md:text-base text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words leading-relaxed bg-slate-50/50 dark:bg-slate-900/10 p-6 rounded-xl border border-slate-100 dark:border-slate-900">
              {content || <span className="italic text-slate-400">No document content available.</span>}
            </div>
          </div>

          {/* Sticky Footer with Copy, Print, and PDF actions */}
          <DialogFooter className="border-t border-slate-100 dark:border-slate-800/80 pt-3 shrink-0 flex flex-wrap items-center justify-between sm:justify-between gap-3 bg-white dark:bg-slate-950">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={handleCopy}
                variant="outline"
                size="sm"
                className="gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-xs"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
                <span>{copied ? "Copied" : "Copy Text"}</span>
              </Button>
              {printUrl ? (
                <Button asChild variant="outline" size="sm" className="gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-xs">
                  <a href={printUrl} target="_blank" rel="noopener noreferrer">
                    <Printer className="h-3.5 w-3.5 text-slate-400" /> Print
                  </a>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled className="gap-1.5 opacity-40 cursor-not-allowed text-xs">
                  <Printer className="h-3.5 w-3.5 text-slate-400" /> Print
                </Button>
              )}
              {pdfUrl ? (
                <Button asChild variant="outline" size="sm" className="gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-xs">
                  <a href={pdfUrl} download>
                    <FileDown className="h-3.5 w-3.5 text-slate-400" /> PDF
                  </a>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled className="gap-1.5 opacity-40 cursor-not-allowed text-xs">
                  <FileDown className="h-3.5 w-3.5 text-slate-400" /> PDF
                </Button>
              )}
            </div>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="sm" className="hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors text-xs">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

