"use client";

import * as React from "react";
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, AlertCircle, Lock, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { RtiApplication } from "@/lib/types";
import {
  uploadRtiAcknowledgementAction,
  runAiVerificationOnlyAction,
  confirmRtiFiledAction,
  deleteRtiAcknowledgementAction,
  getSignedUrlAction,
} from "@/lib/actions/rti";

// Import modular sub-components
import { FilePreview } from "./file-preview";
import { MetadataSection } from "./metadata-section";
import { VerificationSection } from "./verification-section";
import { OcrPreview } from "./ocr-preview";
import { ActionToolbar } from "./action-toolbar";
import { AckHistoryTimeline } from "./ack-history-timeline";
import { ArchiveAccordion } from "./archive-accordion";

interface RtiAcknowledgementCardProps {
  rti: RtiApplication;
  canEdit: boolean;
  initialSignedUrl: string | null;
}

export function RtiAcknowledgementCard({
  rti,
  canEdit,
  initialSignedUrl,
}: RtiAcknowledgementCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [processingMsg, setProcessingMsg] = useState<string>("");
  const [imageUrl, setImageUrl] = useState<string | null>(initialSignedUrl);

  useEffect(() => {
    setImageUrl(initialSignedUrl);
  }, [initialSignedUrl]);

  // Unified Status Colors Mapping
  const statusColorMap: Record<string, string> = {
    "Not Uploaded": "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
    "Uploaded": "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-95/20 dark:text-blue-400 dark:border-blue-900/50",
    "OCR Processing": "bg-blue-50 text-blue-700 animate-pulse border border-blue-200 dark:bg-blue-95/20 dark:text-blue-400 dark:border-blue-900/50",
    "OCR Completed": "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-95/20 dark:text-blue-400 dark:border-blue-900/50",
    "AI Processing": "bg-blue-50 text-blue-700 animate-pulse border border-blue-200 dark:bg-blue-95/20 dark:text-blue-400 dark:border-blue-900/50",
    "Verified": "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-95/20 dark:text-emerald-400 dark:border-emerald-900/50",
    "Manual Review Required": "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-95/20 dark:text-amber-400 dark:border-amber-900/50",
    "Verification Failed": "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-95/20 dark:text-rose-400 dark:border-rose-900/50",
    "Filed": "bg-emerald-600 text-white border border-emerald-700 dark:bg-emerald-700 dark:text-emerald-100 dark:border-emerald-650",
  };

  const statusLabelMap: Record<string, string> = {
    "Not Uploaded": "Not Uploaded",
    "Uploaded": "Uploaded",
    "OCR Processing": "OCR Processing",
    "OCR Completed": "OCR Completed",
    "AI Processing": "AI Verification Running",
    "Verified": "Verification Completed",
    "Manual Review Required": "Ready for Manual Review",
    "Verification Failed": "Verification Failed",
    "Filed": "Filed",
  };

  const isFiled = rti.status === "Filed" || rti.status === "First Appeal Filed" || rti.status === "Second Appeal Filed";
  const currentStatus = isFiled ? "Filed" : (rti.ack_status || "Not Uploaded");
  const fileMetadata = rti.ack_file_metadata as any;
  
  const isPdf = React.useMemo(() => {
    return fileMetadata?.fileType === "PDF" ||
           fileMetadata?.mimeType === "application/pdf" ||
           (rti.ack_image_path ? rti.ack_image_path.toLowerCase().endsWith(".pdf") : false);
  }, [fileMetadata, rti.ack_image_path]);

  const canEditAck = canEdit && !isFiled;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    const fileIsPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
    setProcessingMsg(fileIsPdf ? "Uploading PDF document…" : "Uploading image…");

    const fd = new FormData();
    fd.append("file", file);

    startTransition(async () => {
      const interval = setInterval(() => {
        setProcessingMsg((prev) => {
          if (prev.includes("Uploading")) return "Running OCR text extraction…";
          if (prev.includes("OCR")) return "Running AI Vision verification…";
          return "Completing verification…";
        });
      }, 3500);

      const res = await uploadRtiAcknowledgementAction(rti.id, fd);
      clearInterval(interval);

      if (res.error) {
        setErrorMsg(res.error);
        setProcessingMsg("");
      } else {
        setProcessingMsg("");
        router.refresh();
      }
    });
  };

  const handleReRunVerification = () => {
    setErrorMsg(null);
    setProcessingMsg("Retrieving image and starting AI re-analysis…");

    startTransition(async () => {
      const res = await runAiVerificationOnlyAction(rti.id);
      setProcessingMsg("");
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        router.refresh();
      }
    });
  };

  const handleConfirmFiled = () => {
    if (!confirm("Are you sure you want to mark this RTI as Filed? This will update the status and lock the filing date.")) {
      return;
    }
    setErrorMsg(null);
    setProcessingMsg("Updating RTI status to Filed…");

    startTransition(async () => {
      const res = await confirmRtiFiledAction(rti.id);
      setProcessingMsg("");
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        router.refresh();
      }
    });
  };

  const handleDeleteAcknowledgement = () => {
    if (!confirm("Are you sure you want to remove the current acknowledgement? It will be archived and superseded instead of permanently removed.")) {
      return;
    }
    setErrorMsg(null);
    setProcessingMsg("Archiving and resetting acknowledgement…");

    startTransition(async () => {
      const res = await deleteRtiAcknowledgementAction(rti.id);
      setProcessingMsg("");
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        router.refresh();
      }
    });
  };

  const viewArchivedImage = async (path: string) => {
    try {
      const url = await getSignedUrlAction(path);
      if (url) {
        window.open(url, "_blank");
      } else {
        alert("Failed to generate viewing URL for the archived copy.");
      }
    } catch {
      alert("Error generating URL.");
    }
  };

  return (
    <Card className="mt-6 border-slate-200/80 shadow-md transition-all duration-300 hover:shadow-lg dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-950">
      <CardHeader className="border-b border-slate-100 dark:border-slate-900 bg-slate-50/40 dark:bg-slate-900/15 pb-4 px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100 flex items-center gap-2 font-sans">
              <FileText className="h-5 w-5 text-indigo-500" />
              RTI Acknowledgement & AI Verification
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Optional verification layer to validate official public authority receipts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">Status:</span>
            <Badge className={statusColorMap[currentStatus] || "bg-slate-100 text-slate-700"}>
              {statusLabelMap[currentStatus] || currentStatus}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-6 space-y-6">
        {/* Error notification */}
        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3.5 text-sm flex items-start gap-2.5 dark:bg-rose-950/20 dark:border-rose-900 dark:text-rose-450">
            <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold">Verification Alert</span>
              <p className="text-xs text-rose-700/90 dark:text-rose-400/90 leading-relaxed">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* Loader status for processing */}
        {processingMsg && (
          <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-6 flex flex-col items-center justify-center gap-3 text-center dark:bg-indigo-950/10 dark:border-indigo-900/30">
            <Spinner size="lg" className="text-indigo-600 dark:text-indigo-400" />
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 animate-pulse">
              {processingMsg || "Processing, please wait…"}
            </p>
          </div>
        )}

        {/* Stage 0: No file uploaded yet */}
        {!processingMsg && currentStatus === "Not Uploaded" && (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-10 bg-slate-50/30 text-center hover:bg-slate-50/80 transition-all duration-300 dark:border-slate-800 dark:bg-slate-900/10 dark:hover:bg-slate-900/30">
            <UploadCloud className="h-10 w-10 text-indigo-500 mb-3" />
            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200">
              Upload Acknowledgement Document
            </h3>
            <p className="text-xs text-muted-foreground max-w-xs mt-1 mb-4">
              Drag and drop or select a copy of the acknowledgement. Supports PDF, JPG, JPEG, PNG, and WebP (Max 5MB).
            </p>
            {canEditAck ? (
              <div className="relative">
                <Button variant="outline" size="sm" className="pointer-events-none">
                  Choose File
                </Button>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  aria-label="Upload acknowledgement file"
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground flex items-center gap-1 bg-slate-100 px-3 py-1.5 rounded-full dark:bg-slate-800">
                <Lock className="h-3 w-3" /> View-only access
              </p>
            )}
          </div>
        )}

        {/* Stage 1: File uploaded (displays preview, metadata, verifications, logs) */}
        {currentStatus !== "Not Uploaded" && (
          <div className="grid gap-6 grid-cols-1 md:grid-cols-5 items-start">
            {/* Left Column (Sticky Preview & Metadata details) */}
            <div className="md:col-span-2 space-y-6">
              <FilePreview
                imageUrl={imageUrl}
                isPdf={isPdf}
                isLoading={isPending && !imageUrl}
                originalFileName={fileMetadata?.originalFileName || fileMetadata?.fileName}
              />
              <MetadataSection
                meta={fileMetadata}
                rti={rti}
                isLoading={isPending && !fileMetadata}
              />
            </div>

            {/* Right Column (Verification, OCR, History, Archives) */}
            <div className="md:col-span-3 space-y-6">
              <VerificationSection
                rti={rti}
                isPending={isPending}
              />
              <OcrPreview
                ocrText={rti.ack_ocr_text}
                isLoading={isPending}
              />
              <ActionToolbar
                canEdit={canEditAck}
                isPending={isPending}
                onConfirmFiled={handleConfirmFiled}
                onReRunVerification={handleReRunVerification}
                onReplaceUpload={handleUpload}
                onDeleteAcknowledgement={handleDeleteAcknowledgement}
              />
              <AckHistoryTimeline
                history={rti.ack_history as any}
              />
              <ArchiveAccordion
                archive={rti.ack_archive as any}
                onViewCopy={viewArchivedImage}
                onDownloadCopy={async (path) => {
                  try {
                    const url = await getSignedUrlAction(path);
                    if (url) {
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = path.split("/").pop() || "archive";
                      a.target = "_blank";
                      a.click();
                    } else {
                      alert("Failed to download.");
                    }
                  } catch {
                    alert("Error downloading.");
                  }
                }}
                isPending={isPending}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
