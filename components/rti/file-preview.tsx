"use client";

import * as React from "react";
import { FileImage, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface FilePreviewProps {
  imageUrl: string | null;
  isPdf: boolean;
  alt?: string;
  className?: string;
}

type PdfLoadState = "placeholder" | "loading" | "loaded";

/**
 * Renders the acknowledgement file preview.
 *
 * - Images are shown directly with lazy loading.
 * - PDFs use a two-step lazy load (placeholder → click → iframe) to avoid
 *   blocking the main thread on large documents.
 * - A skeleton is shown while imageUrl is null (signed URL not yet available).
 * - Sticky on md+ screens so the preview stays in view while scrolling.
 *
 * Wrapped in React.memo because imageUrl is stable between uploads and
 * re-rendering after an iframe has loaded is expensive.
 */
export const FilePreview = React.memo(function FilePreview({
  imageUrl,
  isPdf,
  alt = "RTI Acknowledgement Copy",
  className,
}: FilePreviewProps) {
  const [pdfState, setPdfState] = React.useState<PdfLoadState>("placeholder");

  // Reset PDF state when a new URL arrives (e.g. after replace).
  React.useEffect(() => {
    if (isPdf) setPdfState("placeholder");
  }, [imageUrl, isPdf]);

  return (
    <div className={cn("space-y-3", className)}>
      <span className="block text-[10px] font-mono font-semibold uppercase tracking-widest text-muted-foreground">
        Acknowledgement File
      </span>

      {/* Preview box */}
      <div className="relative flex min-h-[220px] w-full items-center justify-center overflow-hidden rounded-lg border bg-slate-50/50 p-2 dark:border-slate-800 dark:bg-slate-900/20">
        {/* No URL yet — skeleton */}
        {!imageUrl && (
          <Skeleton className="absolute inset-0 rounded-lg" />
        )}

        {/* Image */}
        {imageUrl && !isPdf && (
          <img
            src={imageUrl}
            alt={alt}
            loading="lazy"
            className="max-h-full max-w-full rounded-md object-contain shadow-sm"
          />
        )}

        {/* PDF — placeholder state */}
        {imageUrl && isPdf && pdfState === "placeholder" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <FileText className="h-10 w-10 text-slate-400" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">PDF document uploaded</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPdfState("loading")}
              aria-label="Load PDF preview"
            >
              Load PDF Preview
            </Button>
          </div>
        )}

        {/* PDF — loading state */}
        {imageUrl && isPdf && pdfState === "loading" && (
          <>
            <Skeleton className="absolute inset-0 rounded-lg" />
            <iframe
              src={imageUrl}
              title="PDF Preview"
              aria-label="PDF Preview"
              className="absolute inset-0 h-full w-full rounded-md border-0 opacity-0"
              onLoad={() => setPdfState("loaded")}
            />
          </>
        )}

        {/* PDF — loaded state */}
        {imageUrl && isPdf && pdfState === "loaded" && (
          <iframe
            src={imageUrl}
            title="PDF Preview"
            aria-label="PDF Preview"
            className="h-full w-full rounded-md border-0"
            style={{ minHeight: 220 }}
          />
        )}

        {/* Explicit no-preview fallback (imageUrl truthy but rendering failed) */}
        {!imageUrl && (
          <div className="flex flex-col items-center text-muted-foreground">
            <FileImage className="mb-1 h-10 w-10" aria-hidden="true" />
            <span className="text-xs">No preview available</span>
          </div>
        )}
      </div>

    </div>
  );
});
