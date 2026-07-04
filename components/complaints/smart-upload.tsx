"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, X, FileText, FileType2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ForensicZipImport } from "@/components/forensic/forensic-zip-import";
import { ComplaintIntakeImport } from "@/components/complaints/complaint-intake-import";
import { ImportQueue } from "@/components/import/import-queue";

/**
 * Redesigned smart upload workspace controller.
 * Auto-differentiates file drops/selections, routes ZIPs to chunked queue,
 * and routes letters/PDFs to the AI Intake editor review screen.
 */
export function SmartUpload() {
  const searchParams = useSearchParams();
  const reviewingBatch = Boolean(searchParams.get("import"));
  const [letterFiles, setLetterFiles] = React.useState<File[]>([]);
  const [letterStarted, setLetterStarted] = React.useState(false);
  const [showGuidelines, setShowGuidelines] = React.useState(false);

  // Review screen for an analyzed batch (auto-commit off / legacy links).
  if (reviewingBatch) return <ForensicZipImport />;

  if (letterStarted && letterFiles.length) {
    return (
      <ComplaintIntakeImport
        presetFiles={letterFiles}
        onReset={() => {
          setLetterFiles([]);
          setLetterStarted(false);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header Area */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/40 pb-5 no-print">
        <div className="space-y-1.5">
          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground/80 font-medium">
            <Link href="/complaints" className="hover:text-foreground transition-colors">Complaints</Link>
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/45" />
            <span className="text-foreground font-semibold">Upload ZIP / Letter</span>
          </nav>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl leading-none">
            Upload Complaint Documents
          </h1>
          <p className="max-w-3xl text-xs sm:text-sm leading-relaxed text-muted-foreground/95 font-medium">
            Upload forensic ZIP archives or individual letters for AI analysis. Documents are processed automatically in the background while you continue working.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="h-9 font-semibold hover:scale-[1.01] transition-all cursor-pointer" onClick={() => setShowGuidelines(true)}>
            Upload Guidelines
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9 font-semibold hover:scale-[1.01] transition-all cursor-pointer">
            <Link href="/docs/ingestion" target="_blank">
              Documentation
            </Link>
          </Button>
        </div>
      </div>

      {/* Main Unified Ingestion Workspace */}
      <ImportQueue
        onLetterUpload={(files) => {
          setLetterFiles(files);
          setLetterStarted(true);
        }}
      />

      {/* Guidelines Modal dialog */}
      {showGuidelines && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4 no-print animate-fade-in">
          <Card className="max-w-lg w-full border border-border shadow-2xl bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Upload Guidelines &amp; Intake Rules</span>
              <button onClick={() => setShowGuidelines(false)} className="text-slate-400 hover:text-slate-650 p-1.5 rounded-full hover:bg-muted transition-colors">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            <CardContent className="p-5 space-y-4 text-xs text-foreground/90 leading-relaxed">
              <div className="space-y-1">
                <h4 className="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[10px]">ZIP Forensic Archives</h4>
                <p className="text-slate-500">
                  Must be compressed in standard ZIP format. The archive should contain folders organized by job/case codes (e.g., <code>JOB-104</code>). The server decompresses the file and registers each folder as a separate child case automatically.
                </p>
              </div>
              <div className="space-y-1">
                <h4 className="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[10px]">Individual Letters &amp; PDFs</h4>
                <p className="text-slate-500">
                  Drop single-page or multi-page documents (PDFs, scans, or camera photos of letters). The AI scanning pipeline will automatically perform OCR transcription, identify department codes, extract subject text, and prepare draft complaint entries for review.
                </p>
              </div>
              <div className="space-y-1">
                <h4 className="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[10px]">File Slices &amp; Chunking</h4>
                <p className="text-slate-500">
                  Archives can be up to 4 GB. The client uploading engine automatically splits the file into 8 MB chunks. If your internet connection drops, you can reopen the page to resume from the last successful byte using IndexedDB handles.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
