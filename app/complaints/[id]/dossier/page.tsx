import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/components/print-button";
import { PageLanguageToggle } from "@/components/complaints/page-language-toggle";
import { DetailGrid, DetailRow } from "@/components/detail-row";
import { getComplaint, listComplaintDocuments } from "@/lib/queries";
import { getDivisionResponsibleOfficers } from "@/lib/dedupe-photos";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";
import { formatDate, orDash } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { triggerCaseIntelligenceRebuild } from "@/lib/actions/case-intelligence";
import { STALE_BUILD_MS } from "@/lib/intelligence/engine";
import { AutoRefresh } from "@/components/auto-refresh";
import { getLocale } from "@/lib/i18n/get-locale";
import { translate } from "@/lib/i18n/translate";
import { translateEnum } from "@/lib/i18n/translate-enum";
// Side-effect: register every dictionary namespace. translate() (unlike the
// getTranslations() helper) does not import these itself, so a page calling
// translate() directly with an explicit locale must ensure registration.
import "@/lib/i18n/dictionaries";
import { translateToEnglish } from "@/lib/ai/translate";
import type { Locale } from "@/lib/i18n/types";
import type { CaseIntelligence } from "@/lib/intelligence/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Evidence Dossier" };

const REFERENCE_LABELS = [
  "Administrative Approval (AA)", "Technical Sanction (TS)", "Agreement (KW-4)",
  "Work Order", "Tender Notification", "Mineral Dispatch Permit (MDP)",
  "Royalty Challan", "Insurance Policy",
];
const SEVERITY_BADGE = { High: "destructive", Medium: "warning", Low: "muted" } as const;

export default async function DossierPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { id } = await params;
  const { lang } = await searchParams;
  const [user, complaint] = await Promise.all([getSessionUser(), getComplaint(id)]);
  const pageLang: Locale = lang === "en" || lang === "kn" ? lang : await getLocale();
  const t = (key: string, p?: Record<string, string | number>) => translate("complaints", key, pageLang, p);

  if (!hasRole(user, COMPLAINT_VERIFY_ROLES)) {
    return (
      <div>
        <PageHeader title={t("detailPage.dossierPage.title")} />
        <EmptyState title={t("detailPage.dossierPage.notPermittedTitle")} description={t("detailPage.dossierPage.notPermittedDescription")} />
      </div>
    );
  }
  if (!complaint) notFound();

  const [docs, officers, intelRow] = await Promise.all([
    listComplaintDocuments(id),
    complaint.division_id ? getDivisionResponsibleOfficers(complaint.division_id) : Promise.resolve([]),
    createAdminClient().from("case_intelligence").select("artifact, build_status, updated_at").eq("complaint_id", id).maybeSingle(),
  ]);

  const flagged = docs.filter((d) => d.is_duplicate || (d.vision_verdict && d.vision_verdict !== "ok") || d.geo_flag === "far");
  const intel = (intelRow.data?.artifact as CaseIntelligence | null) ?? null;
  const buildStatus = intelRow.data?.build_status ?? null;
  const buildUpdatedAt = intelRow.data?.updated_at ?? null;

  // Is a build genuinely in flight (claimed recently)? A 'queued'/'running' row
  // older than STALE_BUILD_MS means the build that owned it died (a redeploy in
  // the after() window, or a non-throwing failure) — treat it as dead so it gets
  // re-kicked rather than leaving the dossier stuck on "analysing…" forever.
  const freshInFlight =
    (buildStatus === "queued" || buildStatus === "running") &&
    !!buildUpdatedAt &&
    Date.now() - Date.parse(buildUpdatedAt as string) < STALE_BUILD_MS;

  // Self-heal: the analysis is generated automatically when case files are
  // uploaded, but a complaint imported before that wiring existed (or one whose
  // build died) can still have no artifact. Kick a build the moment its dossier
  // is opened, unless one is genuinely in flight. Loop-safe: once the artifact
  // exists this never runs again, the trigger itself skips a fresh in-flight
  // build, and the engine's context-hash gate no-ops an unchanged rebuild.
  // after()-based, so it needs a request scope — which a Server Component is.
  if (!intel && !freshInFlight) {
    await triggerCaseIntelligenceRebuild(id);
  }

  const references = intel ? REFERENCE_LABELS.map((label) => ({ label, refs: intel.references.filter((r) => r.label === label) })).filter((r) => r.refs.length) : [];
  const keyFindings = intel ? [...intel.findings, ...intel.correlations].sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.severity] - { High: 0, Medium: 1, Low: 2 }[b.severity])) : [];

  // In English mode, translate the extracted (often Kannada) free-text content.
  // Passthrough + cache means already-English strings and repeat views are free.
  let trMap = new Map<string, string>();
  if (pageLang === "en") {
    const strings: string[] = [];
    if (complaint.title) strings.push(complaint.title);
    if (complaint.location) strings.push(complaint.location);
    if (complaint.contractor) strings.push(complaint.contractor);
    for (const o of officers) { if (o.full_name) strings.push(o.full_name); if (o.designation) strings.push(o.designation); }
    for (const r of references) for (const ref of r.refs) strings.push(ref.value);
    for (const f of keyFindings) { strings.push(f.statement); if (f.recordToDemand) strings.push(f.recordToDemand); }
    for (const l of intel?.legalFramework ?? []) { strings.push(l.instrument); strings.push(l.relevance); }
    for (const d of docs) { if (d.title) strings.push(d.title); if (d.original_file_name) strings.push(d.original_file_name); if (d.document_type) strings.push(d.document_type); }
    if (strings.length) trMap = await translateToEnglish(createAdminClient(), strings);
  }
  const tr = (s: string | null | undefined): string => {
    const v = (s ?? "").trim();
    if (!v) return "";
    return pageLang === "en" ? (trMap.get(v) ?? v) : v;
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/complaints/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("detailPage.nav.backToCase")}
        </Link>
        <div className="flex items-center gap-2">
          <PageLanguageToggle current={pageLang} />
          <Button asChild size="sm" variant="outline"><Link href={`/complaints/${id}/forensics`}>{t("detailPage.dossierPage.runForensicAudit")}</Link></Button>
          <PrintButton />
        </div>
      </div>

      <PageHeader
        title={t("detailPage.dossierPage.pageTitle")}
        description={t("detailPage.dossierPage.pageDescription")}
        badge={flagged.length ? <Badge variant="destructive">{t("detailPage.dossierPage.flaggedItemsBadge", { count: flagged.length })}</Badge> : undefined}
      />

      {/* Case identity */}
      <section className="mb-6 rounded-xl border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("detailPage.dossierPage.caseSectionHeading")}</h2>
        <DetailGrid cols={2}>
          <DetailRow label={t("detailPage.dossierPage.caseNumberLabel")}>{orDash(complaint.internal_case_number)}</DetailRow>
          <DetailRow label={t("detailPage.dossierPage.jobWorkOrderNoLabel")}>{orDash(complaint.job_number)}</DetailRow>
          <DetailRow label={t("detailPage.dossierPage.titleLabel")}>{tr(complaint.title)}</DetailRow>
          <DetailRow label={t("detailPage.dossierPage.roadLocationLabel")}>{complaint.location ? tr(complaint.location) : "—"}</DetailRow>
          <DetailRow label={t("detailPage.dossierPage.contractorLabel")}>{complaint.contractor ? tr(complaint.contractor) : "—"}</DetailRow>
          <DetailRow label={t("detailPage.dossierPage.divisionLabel")}>{orDash(complaint.division?.name ?? null)}</DetailRow>
          <DetailRow label={t("detailPage.dossierPage.statusLabel")}>{translateEnum("status", complaint.status, pageLang)}</DetailRow>
          <DetailRow label={t("detailPage.dossierPage.submittedLabel")}>{complaint.date_submitted ? formatDate(complaint.date_submitted) : "—"}</DetailRow>
        </DetailGrid>
      </section>

      {/* Responsible officers */}
      {officers.length > 0 && (
        <section className="mb-6 rounded-xl border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("detailPage.dossierPage.accountableOfficersHeading")}</h2>
          <ul className="space-y-1 text-sm">
            {officers.map((o) => (
              <li key={o.id}>
                <span className="font-medium">{o.role_level ? `${o.role_level} · ` : ""}{tr(o.full_name)}</span>
                {o.designation ? <span className="text-muted-foreground"> — {tr(o.designation)}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Legal & administrative references */}
      <section className="mb-6 rounded-xl border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("detailPage.dossierPage.legalRefsHeading")}</h2>
        {!intel ? (
          <>
            <EmptyState
              compact
              title={t("detailPage.dossierPage.analysisInProgressTitle")}
              description={t("detailPage.dossierPage.analysisInProgressDesc")}
            />
            {/* Auto-refreshes the page until the background build lands, then
                unmounts itself (this branch stops rendering once intel exists). */}
            <AutoRefresh />
          </>
        ) : references.length === 0 ? (
          <EmptyState compact title={t("detailPage.dossierPage.noReferencesTitle")} description={t("detailPage.dossierPage.noReferencesDesc")} />
        ) : (
          <ul className="space-y-2 text-sm">
            {references.map((r) => (
              <li key={r.label}>
                <span className="font-semibold">{r.label}:</span>{" "}
                {r.refs.map((ref, i) => <span key={i} className="text-muted-foreground">{i > 0 ? "; " : ""}{tr(ref.value)}</span>)}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Documented suspicions */}
      {intel && keyFindings.length > 0 && (
        <section className="mb-6 rounded-xl border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("detailPage.dossierPage.documentedSuspicionsHeading", { count: keyFindings.length })}</h2>
          <ol className="space-y-3 text-sm">
            {keyFindings.map((f) => (
              <li key={f.id} className="border-b border-border/50 pb-2 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  {f.code && <span className="font-mono text-xs text-muted-foreground">[{f.code}]</span>}
                  <Badge variant={SEVERITY_BADGE[f.severity]}>{f.severity}</Badge>
                  <span className="font-medium">{tr(f.statement)}</span>
                </div>
                {f.recordToDemand && <div className="mt-0.5 text-xs text-muted-foreground">{t("detailPage.dossierPage.recordToDemandLabel")}: {tr(f.recordToDemand)}</div>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Applicable legal framework */}
      {intel && intel.legalFramework.length > 0 && (
        <section className="mb-6 rounded-xl border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("detailPage.dossierPage.legalFrameworkHeading")}</h2>
          <ul className="space-y-1 text-sm">
            {intel.legalFramework.map((l, i) => (
              <li key={i}>
                <span className="font-medium">{tr(l.instrument)}</span>
                <span className="text-muted-foreground"> — {tr(l.relevance)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Evidence manifest */}
      <section className="mb-6 rounded-xl border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("detailPage.dossierPage.evidenceManifestHeading", { count: docs.length, plural: docs.length === 1 ? "" : "s" })}
        </h2>
        {docs.length === 0 ? (
          <EmptyState compact title={t("detailPage.dossierPage.noDocumentsTitle")} description={t("detailPage.dossierPage.noDocumentsDescription")} />
        ) : (
          <ol className="space-y-3 text-sm">
            {docs.map((d, i) => (
              <li key={d.id} className="border-b border-border/50 pb-2 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{i + 1}. {tr(d.title) || tr(d.original_file_name) || "Document"}</span>
                  <span className="text-xs text-muted-foreground">{d.document_type ? tr(d.document_type) : "—"} · {formatDate(d.uploaded_at)}</span>
                  {d.is_duplicate && <Badge variant="destructive">{t("detailPage.dossierPage.duplicateBadge")}</Badge>}
                  {d.vision_verdict && d.vision_verdict !== "ok" && <Badge variant="warning">{t("detailPage.dossierPage.visionBadge", { verdict: d.vision_verdict })}</Badge>}
                  {d.geo_flag === "far" && <Badge variant="destructive">{t("detailPage.dossierPage.gpsOffSite")}</Badge>}
                </div>
                <div className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">
                  {d.file_sha256 ? t("detailPage.dossierPage.shaLabel", { hash: d.file_sha256 }) : `SHA-256: ${t("detailPage.dossierPage.shaMissing")}`}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="text-xs text-muted-foreground">{t("detailPage.dossierPage.generatedFooter", { date: formatDate(new Date().toISOString()) })}</p>
    </div>
  );
}
