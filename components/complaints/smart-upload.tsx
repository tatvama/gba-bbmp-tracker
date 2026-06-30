"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { UploadCloud, FileText, FolderArchive, FileType2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ForensicZipImport } from "@/components/forensic/forensic-zip-import";
import { ComplaintIntakeImport } from "@/components/complaints/complaint-intake-import";

/**
 * One upload entry that AUTO-DIFFERENTIATES:
 *   • a .zip  → forensic ZIP import (one complaint per job code, with letter fallback)
 *   • a PDF / image(s) → AI letter intake (recognise department/subject → one complaint)
 * The user just drops a file; the right pipeline runs automatically.
 */
export function SmartUpload() {
  const searchParams = useSearchParams();
  const resuming = Boolean(searchParams.get("import")); // a ZIP import is in-flight → resume it
  const [files, setFiles] = React.useState<File[]>([]);
  const [started, setStarted] = React.useState(false);

  const zipFile = files.find((f) => f.name.toLowerCase().endsWith(".zip")) ?? null;
  const mode: "zip" | "letter" = zipFile ? "zip" : "letter";

  // Resume an in-flight ZIP import after a refresh (?import= in the URL).
  if (resuming) return <ForensicZipImport />;

  if (started) {
    return mode === "zip" && zipFile ? <ForensicZipImport presetFile={zipFile} /> : <ComplaintIntakeImport presetFiles={files} />;
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  }

  return (
    <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl">
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start gap-2.5 rounded-lg border border-blue-100 bg-blue-50/30 p-3.5 dark:border-slate-800 dark:bg-slate-950/30">
          <UploadCloud className="h-4.5 w-4.5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Drop <span className="font-semibold">either</span> a forensic-audit <span className="font-semibold">ZIP</span>{" "}
            (one folder per job code) <span className="font-semibold">or</span> a single complaint{" "}
            <span className="font-semibold">letter / acknowledgement</span> (PDF or photos). The system detects which it
            is and runs the right task automatically — bulk forensic import, or AI letter-intake when the ZIP&apos;s
            forensic report isn&apos;t available.
          </p>
        </div>

        <label
          htmlFor="smart-upload-file"
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-250 bg-slate-50/40 px-4 py-10 text-center transition-colors hover:border-primary/50 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/30 dark:hover:bg-slate-900/50"
        >
          <UploadCloud className="h-8 w-8 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Choose a file</span>
          <span className="text-xs text-slate-400">ZIP (forensic packet) · or PDF / JPEG / PNG / WebP (a letter)</span>
          <input
            id="smart-upload-file"
            type="file"
            accept=".zip,application/zip,application/pdf,image/*"
            multiple
            className="hidden"
            onChange={onPick}
          />
        </label>

        {files.length > 0 && (
          <>
            <div
              className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
                mode === "zip"
                  ? "border-indigo-200 bg-indigo-50/40 dark:border-indigo-900/40 dark:bg-indigo-950/20"
                  : "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20"
              }`}
            >
              {mode === "zip" ? <FolderArchive className="h-5 w-5 text-indigo-600 dark:text-indigo-400" /> : <FileType2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
              <span>
                Detected: <span className="font-semibold">{mode === "zip" ? "forensic ZIP" : "complaint letter (AI)"}</span>
                {mode === "zip" ? " — will create a complaint per job code." : " — AI will read it and create one complaint."}
              </span>
            </div>
            <ul className="space-y-1.5">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg border border-slate-150 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{f.name}</span>
                  <span className="ml-auto shrink-0 text-slate-400">{(f.size / 1_048_576).toFixed(1)} MB</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="flex justify-end border-t border-slate-150 dark:border-slate-800/85 pt-4">
          <Button type="button" onClick={() => setStarted(true)} disabled={files.length === 0} className="h-10 font-bold">
            Continue <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
