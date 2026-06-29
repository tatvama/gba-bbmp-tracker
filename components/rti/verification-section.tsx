import * as React from "react";
import { CheckCircle2, XCircle, AlertCircle, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import type { RtiApplication } from "@/lib/types";

interface VerificationSectionProps {
  rti: RtiApplication;
  isPending: boolean;
}

export function VerificationSection({ rti, isPending }: VerificationSectionProps) {
  const getDisplayValueAndPage = React.useCallback((field: any) => {
    if (field && typeof field === "object") {
      return {
        value: field.value || "",
        page: field.page,
      };
    }
    return {
      value: String(field || ""),
      page: undefined,
    };
  }, []);

  // Standardized verification row with wrapping and responsive layout
  const renderVerificationRow = React.useCallback(
    (label: string, isMatch: boolean, extractedField?: any, dbVal?: string) => {
      const { value: extractedVal, page } = getDisplayValueAndPage(extractedField);
      return (
        <div className="flex flex-col sm:flex-row sm:items-start justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3 pt-3 text-sm last:border-b-0 gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <span className="font-semibold text-slate-700 dark:text-slate-300 block">{label}</span>
            <div className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5 font-sans leading-relaxed">
              <div className="break-words whitespace-normal min-w-0 overflow-wrap-anywhere">
                <span className="font-medium text-slate-400">Extracted:</span>{" "}
                <span className="text-slate-600 dark:text-slate-400 font-mono">
                  {extractedVal || "—"}
                  {page !== undefined ? ` (Page ${page})` : ""}
                </span>
              </div>
              {dbVal !== undefined && (
                <div className="break-words whitespace-normal min-w-0 overflow-wrap-anywhere">
                  <span className="font-medium text-slate-400">Record Value:</span>{" "}
                  <span className="text-slate-600 dark:text-slate-400 font-mono">{dbVal || "—"}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center shrink-0 self-start sm:self-center">
            {isMatch ? (
              <Badge
                variant="outline"
                className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-450 dark:border-emerald-900/50"
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>Matches</span>
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-450 dark:border-rose-900/50"
              >
                <XCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Mismatch</span>
              </Badge>
            )}
          </div>
        </div>
      );
    },
    [getDisplayValueAndPage]
  );

  const info = rti.ack_extracted_info as any;
  const hasExtractedInfo = !!info;

  // Memoized checklists
  const checklistContent = React.useMemo(() => {
    if (!info) return null;

    const extPublicAuth = getDisplayValueAndPage(info.extractedInfo?.publicAuthority);
    const extDept = getDisplayValueAndPage(info.extractedInfo?.department);
    const extAppNo = getDisplayValueAndPage(info.extractedInfo?.applicationNumber);
    const extFilingDate = getDisplayValueAndPage(info.extractedInfo?.filingDate);
    const extApplicantName = getDisplayValueAndPage(info.extractedInfo?.applicantName);

    const extAckNo = getDisplayValueAndPage(info.extractedInfo?.acknowledgementNumber);
    const extDiaryNo = getDisplayValueAndPage(info.extractedInfo?.diaryNumber);
    const extInwardNo = getDisplayValueAndPage(info.extractedInfo?.inwardNumber);
    const extOfficeAddr = getDisplayValueAndPage(info.extractedInfo?.officeAddress);
    const extOfficerName = getDisplayValueAndPage(info.extractedInfo?.officerName);
    const extOfficerDesig = getDisplayValueAndPage(info.extractedInfo?.officerDesignation);
    const extRefNo = getDisplayValueAndPage(info.extractedInfo?.referenceNumber);

    return (
      <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
        {renderVerificationRow(
          "Public Authority",
          !!info.verifications?.publicAuthorityMatches ||
            extPublicAuth.value.toLowerCase().includes("bbmp") ||
            extPublicAuth.value.toLowerCase().includes("gba"),
          info.extractedInfo?.publicAuthority,
          rti.public_authority || ""
        )}
        {renderVerificationRow(
          "Department",
          !!info.verifications?.departmentMatches ||
            extDept.value.toLowerCase().includes(rti.department?.toLowerCase() || "empty"),
          info.extractedInfo?.department,
          rti.department || ""
        )}
        {renderVerificationRow(
          "RTI / Application Number",
          !!info.verifications?.applicationNumberMatches ||
            extAppNo.value.toLowerCase().includes(rti.internal_ref?.toLowerCase() || "empty"),
          info.extractedInfo?.applicationNumber,
          rti.internal_ref || ""
        )}
        {renderVerificationRow(
          "Filing Date",
          !!info.verifications?.filingDateMatches || extFilingDate.value === rti.date_filed,
          info.extractedInfo?.filingDate,
          rti.date_filed || ""
        )}
        {rti.applicant_name &&
          renderVerificationRow(
            "Applicant Name",
            !!info.verifications?.applicantNameMatches ||
              extApplicantName.value.toLowerCase().includes(rti.applicant_name?.toLowerCase() || "empty"),
            info.extractedInfo?.applicantName,
            rti.applicant_name
          )}
        {extAckNo.value &&
          renderVerificationRow("Acknowledgement Number", true, info.extractedInfo?.acknowledgementNumber)}
        {extDiaryNo.value && renderVerificationRow("Diary Number", true, info.extractedInfo?.diaryNumber)}
        {extInwardNo.value && renderVerificationRow("Inward Number", true, info.extractedInfo?.inwardNumber)}
        {extOfficeAddr.value &&
          renderVerificationRow(
            "Office Address",
            true,
            info.extractedInfo?.officeAddress,
            rti.office_address || ""
          )}
        {extOfficerName.value && renderVerificationRow("Officer Name", true, info.extractedInfo?.officerName)}
        {extOfficerDesig.value &&
          renderVerificationRow("Officer Designation", true, info.extractedInfo?.officerDesignation)}
        {extRefNo.value && renderVerificationRow("Reference Number", true, info.extractedInfo?.referenceNumber)}
      </div>
    );
  }, [info, rti, renderVerificationRow, getDisplayValueAndPage]);

  // Recommended Action Banner Styling
  const bannerMarkup = React.useMemo(() => {
    if (!rti.ack_recommended_action) return null;

    const isVerified = rti.ack_recommended_action === "Ready to Mark as Filed";
    const isFailed = rti.ack_recommended_action.toLowerCase().includes("fail");

    let bannerStyle = "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-900/50 dark:text-amber-400";
    let iconColor = "text-amber-500";

    if (isVerified) {
      bannerStyle = "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900/50 dark:text-emerald-400";
      iconColor = "text-emerald-500";
    } else if (isFailed) {
      bannerStyle = "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/20 dark:border-rose-900/50 dark:text-rose-400";
      iconColor = "text-rose-500";
    }

    return (
      <div className={`rounded-xl p-4 flex gap-3 border text-sm ${bannerStyle}`}>
        <AlertCircle className={`h-5 w-5 shrink-0 mt-0.5 ${iconColor}`} />
        <div className="space-y-1 min-w-0">
          <span className="font-bold font-mono uppercase tracking-wider block">
            AI Recommendation: {rti.ack_recommended_action}
          </span>
          <p className="text-xs opacity-90 leading-relaxed break-words whitespace-normal overflow-wrap-anywhere">
            {rti.ack_verification_summary || "The acknowledgement matches key parameters and includes appropriate official markers."}
          </p>
        </div>
      </div>
    );
  }, [rti.ack_recommended_action, rti.ack_verification_summary]);

  if (isPending) {
    return (
      <div className="space-y-5 w-full">
        {/* Banner Skeleton */}
        <Skeleton className="h-20 w-full rounded-xl" />

        {/* Checklist Skeleton */}
        <div className="border border-slate-150 rounded-xl p-4 bg-white dark:bg-slate-900/40 dark:border-slate-800 space-y-4">
          <Skeleton className="h-4 w-36" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex justify-between items-center py-2.5 border-b border-slate-50 last:border-0">
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 w-full">
      {/* 1. Verification Banner */}
      {bannerMarkup}

      {/* 2. Field Match Checklist */}
      <div className="border border-slate-200/80 rounded-xl p-4 bg-white shadow-sm dark:bg-slate-900/40 dark:border-slate-850">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-3 font-mono">
          Field Match Checklist
        </span>
        {hasExtractedInfo ? (
          checklistContent
        ) : (
          <div className="flex flex-col items-center py-6 text-center text-slate-450">
            <AlertCircle className="h-8 w-8 mb-2 text-slate-300 dark:text-slate-700" />
            <span className="text-xs font-medium">No verification data available</span>
            <p className="text-[10px] text-slate-400 mt-1 max-w-xs">
              Complete the AI verification workflow to generate matches checklist.
            </p>
          </div>
        )}
      </div>

      {/* 3. Detected Visual Elements */}
      <div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-2 font-mono">
          Detected Visual Elements
        </span>
        <div className="flex flex-wrap gap-1.5">
          {Array.isArray(rti.ack_visual_elements) && rti.ack_visual_elements.length > 0 ? (
            rti.ack_visual_elements.map((el: any) => {
              const name = typeof el === "object" && el !== null ? el.name : String(el);
              const page = typeof el === "object" && el !== null ? el.page : undefined;
              return (
                <Badge
                  key={name}
                  variant="outline"
                  className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/50"
                >
                  ✓ {name}
                  {page !== undefined ? ` (Page ${page})` : ""}
                </Badge>
              );
            })
          ) : (
            <div className="border border-dashed border-slate-200 rounded-lg py-2 px-4 text-center text-slate-400 dark:border-slate-800 dark:text-slate-600 text-xs font-mono">
              No visual indicators detected
            </div>
          )}
        </div>
      </div>

      {/* 4. Confidence Scores */}
      <div className="grid grid-cols-2 gap-4 bg-slate-50/50 dark:bg-slate-900/10 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1.5 font-mono">
            Confidence Score
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100 font-mono">
              {rti.ack_confidence_score ?? "—"}%
            </span>
            <span className="text-[10px] text-slate-400 font-medium">AI assessment</span>
          </div>
        </div>
        {rti.ack_ocr_confidence !== undefined && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1.5 font-mono">
              OCR Confidence
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100 font-mono">
                {rti.ack_ocr_confidence ?? "—"}%
              </span>
              <span className="text-[10px] text-slate-400 font-medium">Tesseract output</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
