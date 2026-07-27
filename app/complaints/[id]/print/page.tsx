import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import { PageLanguageToggle } from "@/components/complaints/page-language-toggle";
import { DetailRow } from "@/components/detail-row";
import { getComplaint, listComplaintTimeline, listComplaintDocuments } from "@/lib/queries";
import { formatDate, formatDateTime, orDash } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLocale } from "@/lib/i18n/get-locale";
import { translate } from "@/lib/i18n/translate";
import { translateEnum } from "@/lib/i18n/translate-enum";
// Side-effect: register every dictionary namespace (translate()/translateEnum()
// do not import these themselves — only the getTranslations() helper does).
import "@/lib/i18n/dictionaries";
import { translateToEnglish } from "@/lib/ai/translate";
import type { Locale } from "@/lib/i18n/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Complaint case file" };

// Timeline event_type values that live in the "status" dictionary rather than
// "workflow" (see lib/i18n/dictionaries/status.ts vs workflow.ts).
const STATUS_EVENT_TYPES = new Set(["Filed", "Acknowledged", "Reply Received", "Reopened"]);

export default async function ComplaintPrintPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { id } = await params;
  const { lang } = await searchParams;
  const [c, timeline, documents] = await Promise.all([
    getComplaint(id),
    listComplaintTimeline(id),
    listComplaintDocuments(id),
  ]);
  if (!c) notFound();
  const pageLang: Locale = lang === "en" || lang === "kn" ? lang : await getLocale();
  const t = (key: string, p?: Record<string, string | number>) => translate("complaints", key, pageLang, p);

  // English mode: translate the case's own free-text (often Kannada) content.
  let trMap = new Map<string, string>();
  if (pageLang === "en") {
    const strings: string[] = [];
    for (const s of [c.title, c.description, c.requested_action, c.latest_reply_summary, c.latest_action_taken_summary, c.location, c.assigned_engineer?.full_name, c.assigned_engineer?.designation]) if (s) strings.push(s);
    for (const e of timeline) { if (e.title) strings.push(e.title); if (e.summary) strings.push(e.summary); }
    for (const d of documents) { if (d.title) strings.push(d.title); if (d.document_type) strings.push(d.document_type); }
    if (strings.length) trMap = await translateToEnglish(createAdminClient(), strings);
  }

  // Timeline event_type is a fixed enum split across two dictionaries (see
  // status.ts / workflow.ts); route directly instead of guessing from output,
  // since an English dictionary entry can equal its own key (e.g. "Created" ->
  // "Created"), making a real hit indistinguishable from a miss.
  const trEvent = (v: string): string =>
    translateEnum(STATUS_EVENT_TYPES.has(v) ? "status" : "workflow", v, pageLang);
  const tr = (s: string | null | undefined): string => {
    const v = (s ?? "").trim();
    if (!v) return "";
    return pageLang === "en" ? (trMap.get(v) ?? v) : v;
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href={`/complaints/${id}`}><ArrowLeft className="h-4 w-4" /> {t("detailPage.print.back")}</Link></Button>
        <div className="flex items-center gap-2">
          <PageLanguageToggle current={pageLang} />
          <PrintButton />
        </div>
      </div>

      <div className="print-card rounded-lg border p-6">
        <div className="mb-4 border-b pb-3">
          <p className="font-mono text-xs text-muted-foreground">{c.internal_case_number ?? "—"}</p>
          <h1 className="text-2xl font-semibold">{tr(c.title)}</h1>
          <p className="text-sm text-muted-foreground">{t("detailPage.print.subtitle")}</p>
        </div>

        <div className="grid gap-x-8 sm:grid-cols-2">
          <DetailRow label={t("detailPage.print.externalComplaintNo")}>{orDash(c.complaint_number)}</DetailRow>
          <DetailRow label={t("detailPage.print.type")}>{translateEnum("workflow", c.type, pageLang)}{c.complaint_subtype ? ` / ${c.complaint_subtype}` : ""}</DetailRow>
          <DetailRow label={t("detailPage.print.status")}>{translateEnum("status", c.status, pageLang)}</DetailRow>
          <DetailRow label={t("detailPage.print.priority")}>{c.priority ? translateEnum("workflow", c.priority, pageLang) : "—"}</DetailRow>
          <DetailRow label={t("detailPage.print.complaintGiven")}>{formatDate(c.date_submitted)}</DetailRow>
          <DetailRow label={t("detailPage.print.acknowledged")}>{formatDate(c.acknowledgment_date)}</DetailRow>
          <DetailRow label={t("detailPage.print.wardDivision")}>{c.ward ? `${c.ward.new_no} ${c.ward.new_name}` : "—"}{c.division ? ` · ${c.division.name}` : ""}</DetailRow>
          <DetailRow label={t("detailPage.print.engineerOfficer")}>{c.assigned_engineer ? `${tr(c.assigned_engineer.full_name)} (${tr(c.assigned_engineer.designation)})` : "—"}</DetailRow>
          <DetailRow label={t("detailPage.print.nextFollowUp")}>{formatDate(c.next_follow_up_date)}</DetailRow>
          <DetailRow label={t("detailPage.print.location")}>{c.location ? tr(c.location) : "—"}</DetailRow>
        </div>

        <Block title={t("detailPage.print.complaintSummary")}>{c.description ? tr(c.description) : "—"}</Block>
        <Block title={t("detailPage.print.requestedAction")}>{c.requested_action ? tr(c.requested_action) : "—"}</Block>
        <Block title={t("detailPage.print.latestReply")}>{c.latest_reply_date ? `${formatDate(c.latest_reply_date)} — ${c.latest_reply_summary ? tr(c.latest_reply_summary) : "—"}` : t("detailPage.print.noReplyReceived")}</Block>
        <Block title={t("detailPage.print.latestActionTaken")}>{c.latest_action_taken_date ? `${formatDate(c.latest_action_taken_date)} — ${c.latest_action_taken_summary ? tr(c.latest_action_taken_summary) : "—"}` : t("detailPage.print.noneRecorded")}</Block>

        <div className="mt-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("detailPage.print.timeline")}</h2>
          {timeline.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
            <ul className="space-y-1.5 text-sm">
              {timeline.slice().reverse().map((tl) => (
                <li key={tl.id}><span className="text-muted-foreground">{formatDateTime(tl.event_date)}</span> — <strong>{trEvent(tl.event_type)}</strong>: {tr(tl.title)}{tl.summary ? ` — ${tr(tl.summary)}` : ""}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("detailPage.print.documentsCount", { count: documents.length })}</h2>
          {documents.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
            <ul className="space-y-1 text-sm">
              {documents.map((d) => (
                <li key={d.id}>{d.document_type ? tr(d.document_type) : t("detailPage.print.documentFallback")} — {tr(d.title) || d.original_file_name || "file"} ({formatDate(d.uploaded_at)}) · {t("detailPage.print.ocrStatus", { status: d.ocr_status })}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <p className="whitespace-pre-wrap text-sm">{children}</p>
    </div>
  );
}
