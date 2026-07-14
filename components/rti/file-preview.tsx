import * as React from "react";
import { Eye, FileDown, FileImage, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n/client";

interface FilePreviewProps {
  imageUrl: string | null;
  isPdf: boolean;
  isLoading: boolean;
  originalFileName?: string;
}

export function FilePreview({
  imageUrl,
  isPdf,
  isLoading,
  originalFileName = "acknowledgement",
}: FilePreviewProps) {
  const [loadPdf, setLoadPdf] = React.useState(false);
  const [hasError, setHasError] = React.useState(false);
  const { t } = useTranslation("rti");
  const { t: tCommon } = useTranslation("common");

  // Reset states when URL changes
  React.useEffect(() => {
    setLoadPdf(false);
    setHasError(false);
  }, [imageUrl]);

  if (isLoading) {
    return (
      <div className="space-y-3 md:sticky md:top-6 self-start w-full">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block font-mono">
          {t("advanced.filePreview.ackFileLabel")}
        </span>
        <Skeleton className="w-full aspect-[4/3] min-h-[250px] rounded-xl" />
        <Skeleton className="h-8 w-full rounded-md" />
      </div>
    );
  }

  const handleDownload = async () => {
    if (!imageUrl) return;
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = originalFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      // Fallback: open in new tab if blob download fails
      window.open(imageUrl, "_blank");
    }
  };

  return (
    <div className="space-y-3 md:sticky md:top-6 self-start w-full">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block font-mono">
        Acknowledgement File
      </span>

      <div className="relative border border-slate-200/80 rounded-xl bg-slate-50/50 p-2 overflow-hidden aspect-[4/3] flex flex-col items-center justify-center dark:border-slate-800 dark:bg-slate-900/20 w-full min-h-[250px] shadow-sm">
        {hasError ? (
          <div className="flex flex-col items-center text-center p-4 text-rose-500">
            <AlertCircle className="h-10 w-10 mb-2" />
            <span className="text-xs font-semibold">{t("advanced.filePreview.failedToLoad")}</span>
            <p className="text-[10px] text-slate-400 mt-1">{t("advanced.filePreview.tryOriginal")}</p>
          </div>
        ) : !imageUrl ? (
          <div className="flex flex-col items-center text-muted-foreground text-center p-4">
            <FileImage className="h-10 w-10 mb-2 text-slate-300 dark:text-slate-700" />
            <span className="text-xs font-medium">{t("advanced.filePreview.noPreview")}</span>
          </div>
        ) : isPdf ? (
          !loadPdf ? (
            <div className="flex flex-col items-center text-center p-4">
              <FileText className="h-10 w-10 mb-3 text-indigo-500" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t("advanced.filePreview.pdfDocument")}</span>
              <p className="text-[10px] text-slate-400 mt-1 mb-4">{t("advanced.filePreview.clickToLoad")}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLoadPdf(true)}
                className="text-xs font-medium"
              >
                {t("advanced.filePreview.loadPreview")}
              </Button>
            </div>
          ) : (
            <iframe
              src={imageUrl}
              className="w-full h-full border-0 rounded-lg bg-white"
              title={t("advanced.filePreview.pdfPreviewTitle")}
              onError={() => setHasError(true)}
            />
          )
        ) : (
          <img
            src={imageUrl}
            alt={t("advanced.filePreview.altAckCopy")}
            className="max-h-full max-w-full object-contain rounded-lg shadow-sm"
            onError={() => setHasError(true)}
          />
        )}
      </div>

      {imageUrl && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs font-medium gap-1.5 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            onClick={() => window.open(imageUrl, "_blank")}
            aria-label={t("advanced.filePreview.viewOriginalAria")}
          >
            <Eye className="h-3.5 w-3.5 text-slate-400" />
            <span>{t("advanced.filePreview.fullSize")}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs font-medium gap-1.5 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            onClick={handleDownload}
            aria-label={t("advanced.filePreview.downloadOriginalAria")}
          >
            <FileDown className="h-3.5 w-3.5 text-slate-400" />
            <span>{tCommon("action.download")}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
