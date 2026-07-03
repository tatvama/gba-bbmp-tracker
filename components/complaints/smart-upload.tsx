"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { FileType2, ArrowRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ForensicZipImport } from "@/components/forensic/forensic-zip-import";
import { ComplaintIntakeImport } from "@/components/complaints/complaint-intake-import";
import { ImportQueue } from "@/components/import/import-queue";

/**
 * One upload entry that AUTO-DIFFERENTIATES:
 *   • .zip files      → the chunked import QUEUE (resumable, live progress,
 *                       one complaint per job code — handles multi-GB files)
 *   • PDF / image(s)  → AI letter intake (recognise department/subject → one complaint)
 * ?import=<batchId> resumes a ZIP batch on its review screen (auto-commit off,
 * or older imports).
 */
export function SmartUpload() {
  const searchParams = useSearchParams();
  const reviewingBatch = Boolean(searchParams.get("import"));
  const [letterFiles, setLetterFiles] = React.useState<File[]>([]);
  const [letterStarted, setLetterStarted] = React.useState(false);

  // Review screen for an analyzed batch (auto-commit off / legacy links).
  if (reviewingBatch) return <ForensicZipImport />;

  if (letterStarted && letterFiles.length) return <ComplaintIntakeImport presetFiles={letterFiles} />;

  return (
    <div className="space-y-5">
      {/* ZIPs: the resumable queue (drop zone + live cards live inside). */}
      <ImportQueue />

      {/* Letters: single complaint via AI intake. */}
      <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-2.5 rounded-lg border border-emerald-100 bg-emerald-50/30 p-3.5 dark:border-slate-800 dark:bg-slate-950/30">
            <FileType2 className="h-4.5 w-4.5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Got just a <span className="font-semibold">letter or acknowledgement</span> (PDF or photos) instead of a
              ZIP? Drop it here — AI reads it, recognises the department and subject, and creates one complaint.
            </p>
          </div>

          <label
            htmlFor="letter-upload-file"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/40 px-4 py-6 text-center transition-colors hover:border-emerald-400/60 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/30 dark:hover:bg-slate-900/50"
          >
            <FileType2 className="h-6 w-6 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Choose a letter (PDF / photos)</span>
            <span className="text-xs text-slate-400">JPEG, PNG, WebP or PDF · multiple pages allowed</span>
            <input
              id="letter-upload-file"
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                setLetterFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>

          {letterFiles.length > 0 && (
            <>
              <ul className="space-y-1.5">
                {letterFiles.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{f.name}</span>
                    <span className="ml-auto shrink-0 text-slate-400">{(f.size / 1_048_576).toFixed(1)} MB</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end">
                <Button type="button" onClick={() => setLetterStarted(true)} className="h-10 font-bold">
                  Read the letter with AI <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
