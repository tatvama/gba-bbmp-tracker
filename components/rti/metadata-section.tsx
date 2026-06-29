import * as React from "react";
import { DescriptionRow } from "./description-row";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { FileText, Cpu, User } from "lucide-react";
import type { RtiApplication } from "@/lib/types";
import type { FileMetadata } from "./types";

interface MetadataSectionProps {
  meta: FileMetadata | null;
  rti: RtiApplication;
  isLoading: boolean;
}

export function MetadataSection({ meta, rti, isLoading }: MetadataSectionProps) {
  const formatBytes = React.useCallback((bytes?: number) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const dm = 1;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  }, []);

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch((err) => {
      console.error("Failed to copy: ", err);
    });
  };

  const formattedDate = React.useMemo(() => {
    if (!meta) return "—";
    const dateStr = meta.uploadTimestamp || meta.uploadedAt;
    return dateStr ? new Date(dateStr).toLocaleString() : "—";
  }, [meta]);

  const docTypeDisplay = React.useMemo(() => {
    if (!meta) return "—";
    return `${meta.mimeType || "—"} (${meta.fileType || "Image"})`;
  }, [meta]);

  const durationDisplay = React.useMemo(() => {
    if (!meta) return "—";
    return meta.processingDuration || (meta.processingDurationMs !== undefined ? `${(meta.processingDurationMs / 1000).toFixed(2)}s` : "—");
  }, [meta]);

  if (isLoading) {
    return (
      <div className="space-y-6 w-full">
        {/* Document Info Skeleton */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="border border-slate-150 dark:border-slate-800 p-4 rounded-xl space-y-4 bg-white dark:bg-slate-900/40">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="grid grid-cols-12 gap-4">
                <Skeleton className="h-3.5 col-span-4" />
                <Skeleton className="h-3.5 col-span-8" />
              </div>
            ))}
          </div>
        </div>

        {/* Processing Info Skeleton */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="border border-slate-150 dark:border-slate-800 p-4 rounded-xl space-y-4 bg-white dark:bg-slate-900/40">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="grid grid-cols-12 gap-4">
                <Skeleton className="h-3.5 col-span-4" />
                <Skeleton className="h-3.5 col-span-8" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      {/* 1. Document Information Section */}
      {meta && (
        <div className="space-y-3">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400 shrink-0" />
              Document Information
            </h4>
            <Separator className="mt-2 bg-slate-100 dark:bg-slate-850" />
          </div>
          <dl className="space-y-0.5 bg-white dark:bg-slate-900/45 p-4 rounded-xl border border-slate-250/35 dark:border-slate-800/80 shadow-sm">
            <DescriptionRow
              label="File Name"
              value={meta.originalFileName || meta.fileName || "—"}
              onCopy={() => handleCopyToClipboard(meta.originalFileName || meta.fileName || "")}
            />
            <DescriptionRow
              label="File Type"
              value={docTypeDisplay}
              onCopy={() => handleCopyToClipboard(docTypeDisplay)}
            />
            <DescriptionRow
              label="File Size"
              value={formatBytes(meta.fileSize)}
              onCopy={() => handleCopyToClipboard(formatBytes(meta.fileSize))}
            />
            <DescriptionRow
              label="Pages"
              value={meta.totalPages !== undefined ? String(meta.totalPages) : "—"}
            />
            <DescriptionRow
              label="Uploaded On"
              value={formattedDate}
              onCopy={() => handleCopyToClipboard(formattedDate)}
            />
          </dl>
        </div>
      )}

      {/* 2. Processing Information Section */}
      {meta && (
        <div className="space-y-3">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Cpu className="h-4 w-4 text-slate-400 shrink-0" />
              Processing Information
            </h4>
            <Separator className="mt-2 bg-slate-100 dark:bg-slate-850" />
          </div>
          <dl className="space-y-0.5 bg-white dark:bg-slate-900/45 p-4 rounded-xl border border-slate-250/35 dark:border-slate-800/80 shadow-sm">
            <DescriptionRow
              label="OCR Engine"
              value={meta.ocrEngine || "—"}
              onCopy={() => handleCopyToClipboard(meta.ocrEngine || "")}
            />
            <DescriptionRow
              label="AI Model"
              value={meta.aiModel || "—"}
              onCopy={() => handleCopyToClipboard(meta.aiModel || "")}
            />
            <DescriptionRow
              label="Duration"
              value={durationDisplay}
              onCopy={() => handleCopyToClipboard(durationDisplay)}
            />
            <DescriptionRow
              label="Version"
              value={meta.processingVersion || "—"}
            />
            <DescriptionRow
              label="Uploaded By"
              value={meta.uploaderName || meta.uploadedBy || "—"}
              onCopy={() => handleCopyToClipboard(meta.uploaderName || meta.uploadedBy || "")}
            />
          </dl>
        </div>
      )}

      {/* 3. Applicant Information Section */}
      <div className="space-y-3">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <User className="h-4 w-4 text-slate-400 shrink-0" />
            Applicant Information
          </h4>
          <Separator className="mt-2 bg-slate-100 dark:bg-slate-850" />
        </div>
        <dl className="space-y-0.5 bg-white dark:bg-slate-900/45 p-4 rounded-xl border border-slate-250/35 dark:border-slate-800/80 shadow-sm">
          <DescriptionRow
            label="Name"
            value={rti.applicant_name || "—"}
            onCopy={rti.applicant_name ? () => handleCopyToClipboard(rti.applicant_name || "") : undefined}
          />
          <DescriptionRow
            label="Phone"
            value={rti.applicant_phone || "—"}
            onCopy={rti.applicant_phone ? () => handleCopyToClipboard(rti.applicant_phone || "") : undefined}
          />
          <DescriptionRow
            label="Email"
            value={rti.applicant_email || "—"}
            onCopy={rti.applicant_email ? () => handleCopyToClipboard(rti.applicant_email || "") : undefined}
          />
        </dl>
      </div>
    </div>
  );
}
