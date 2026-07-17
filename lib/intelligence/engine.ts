import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAiConfigured } from "@/lib/ai/provider";
import { ENGINE_VERSION, type CaseIntelligence, type BuildCaseIntelligenceResult } from "./types";
import { PROMPT_VERSIONS } from "./prompts";
import { createStore } from "./builder";
import { computeCaseContextHash, lastId, type CaseHashSignal } from "./case-hash";
import { buildGraph } from "./graph";
import { ingestCaseMaterial } from "./stages/ingest";
import { extractEntities } from "./stages/extract";
import { analyzeCase } from "./stages/analyze";
import { correlateDocuments } from "./stages/correlate";
import { buildDocumentFacts } from "./stages/document-facts";
import { buildLegalFramework } from "./stages/legal-map";
import { synthesizeCase } from "./stages/synthesis";
import { verifyGroundedness } from "./stages/verify";

/**
 * A build is considered dead (reclaimable) once its row hasn't advanced for this
 * long. A real build takes ~90s; anything past this window means the process
 * that owned it died mid-build (e.g. a redeploy inside the after() window) or a
 * non-throwing internal failure left the status frozen. Concurrent callers
 * within this window coalesce onto the in-flight build instead of duplicating it.
 */
export const STALE_BUILD_MS = 5 * 60 * 1000;

/**
 * Case Intelligence Engine entry point. Investigates a complaint's complete
 * document set and returns ONE versioned, evidence-linked CaseIntelligence
 * artifact (knowledge graph + findings + financials + chronology + compliance +
 * legal framework + grounded synthesis + verification). Cached per complaint by
 * context hash; recomputed only when the case changes or a version bumps. Never
 * throws — degrades to deterministic-only output when AI is off.
 *
 * Reusable by ANY document consumer (letters, counter-replies, RTI, appeals,
 * Lokayukta, court petitions) — drafting is just the first caller.
 */
export async function buildCaseIntelligence(
  admin: SupabaseClient,
  complaintId: string,
  opts?: { force?: boolean },
): Promise<BuildCaseIntelligenceResult> {
  try {
    const material = await ingestCaseMaterial(admin, complaintId);
    if (!material) return { ok: false, intel: null, fromCache: false, error: "Complaint not found." };

    const promptVersions = { synthesis: PROMPT_VERSIONS.synthesis, draftStructure: PROMPT_VERSIONS.draftStructure, documentFacts: PROMPT_VERSIONS.documentFacts };
    const aiConfigured = isAiConfigured();
    const signal: CaseHashSignal = {
      engineVersion: ENGINE_VERSION,
      promptVersions,
      status: material.complaint.status,
      jobNumber: material.jobNumber,
      latestReplyDate: material.complaint.latest_reply_date ?? null,
      latestActionTakenDate: material.complaint.latest_action_taken_date ?? null,
      complaintDocs: { count: material.complaintDocs.length, lastId: lastId(material.complaintDocs) },
      jobDocs: { count: material.jobDocs.length, lastId: lastId(material.jobDocs) },
      jobAuditId: material.jobAudit?.id ?? null,
      jobAuditAt: null,
      billAudits: material.billAudits.length,
      replies: { count: material.replies.length, lastId: lastId(material.replies) },
      actions: { count: material.actions.length, lastId: lastId(material.actions) },
      escalations: { count: material.escalations.length, lastId: lastId(material.escalations) },
      timeline: { count: material.timeline.length, lastId: lastId(material.timeline) },
    };
    const contextHash = computeCaseContextHash(signal);

    // Cache gate. A cached artifact whose synthesis fell back to deterministic
    // (ai_synthesis_used=false) is treated as stale once AI is available, so the
    // engine self-heals after an AI-off window or a transient API outage.
    if (!opts?.force) {
      const { data: cached } = await admin
        .from("case_intelligence")
        .select("artifact, context_hash, engine_version, build_status, ai_synthesis_used, updated_at")
        .eq("complaint_id", complaintId)
        .maybeSingle();
      const degraded = cached?.ai_synthesis_used === false && aiConfigured;
      if (cached?.build_status === "done" && cached.context_hash === contextHash && cached.engine_version === ENGINE_VERSION && cached.artifact && !degraded) {
        return { ok: true, intel: cached.artifact as CaseIntelligence, fromCache: true };
      }
      // Single-flight: if another builder has CLAIMED this case ('running') and
      // is still fresh, coalesce onto it instead of running a duplicate ~90s
      // build. Return the previous artifact if we have one; otherwise signal
      // "not ready yet" (callers show an in-progress state / fall back). Only
      // 'running' coalesces — 'queued' just means "requested", so a builder must
      // still claim it below, or two queued callers would both skip and nobody
      // would build. A 'running' older than STALE_BUILD_MS is treated as dead
      // and reclaimed (the claim below overwrites it).
      const fresh = !!cached?.updated_at && Date.now() - Date.parse(cached.updated_at as string) < STALE_BUILD_MS;
      if (cached?.build_status === "running" && fresh) {
        return cached.artifact
          ? { ok: true, intel: cached.artifact as CaseIntelligence, fromCache: true }
          : { ok: false, intel: null, fromCache: false, error: "Case intelligence build already in progress." };
      }
    }

    // Claim the build so late-arriving concurrent callers coalesce (above), and
    // so the dossier / advisor can show an accurate "analysing…" state. The
    // engine only wrote 'done' before, leaving no interim signal. Best-effort:
    // a failed claim is non-fatal (the build still runs; coalescing just degrades
    // to possibly-duplicated work in a rare race).
    try {
      await admin
        .from("case_intelligence")
        .upsert({ complaint_id: complaintId, build_status: "running" }, { onConflict: "complaint_id" });
    } catch (e) {
      console.warn("[case-intelligence] could not claim build", complaintId, e);
    }

    // ── Run the pipeline ─────────────────────────────────────────────────────
    const store = createStore();
    const extracted = extractEntities(material, store);
    const analyzed = analyzeCase(material, store);
    const correlations = correlateDocuments(material, store);
    // Unconditional AA/TS/agreement(KW-4)/tender/MDP/royalty/insurance facts —
    // surfaced whether or not anything is wrong with them (unlike findings).
    // Cached per document (mig 0041): a new document is the only one reprocessed.
    const docFacts = await buildDocumentFacts(admin, material, store);
    const references = [...extracted.references, ...docFacts.references];
    const compliance = [...analyzed.compliance, ...docFacts.compliance];
    const legalFramework = buildLegalFramework(analyzed.findings, compliance);
    const synth = await synthesizeCase({
      project: extracted.project,
      contractor: extracted.contractor,
      officers: extracted.officers,
      references,
      financials: analyzed.financials,
      findings: analyzed.findings,
      correlations,
      compliance,
      timeline: analyzed.timeline,
      riskAssessment: { band: analyzed.riskAssessment.band, score: analyzed.riskAssessment.score },
      replies: material.replies,
      actions: material.actions,
    });
    const verified = verifyGroundedness({ evidence: store.evidence, findings: analyzed.findings, correlations, synthesis: synth.synthesis });

    const documents = [...material.complaintDocs, ...material.jobDocs].map((d) => ({ id: d.id, type: d.documentType, name: d.name }));
    const graph = buildGraph({
      evidence: store.evidence,
      documents,
      contractor: extracted.contractor,
      officers: extracted.officers,
      references,
      project: extracted.project,
      timeline: analyzed.timeline,
      findings: analyzed.findings,
      correlations,
      compliance,
      legalFramework,
    });

    const intel: CaseIntelligence = {
      meta: {
        complaintId,
        jobNumber: material.jobNumber,
        source: material.jobNumber ? "forensic_import" : "manual",
        engineVersion: ENGINE_VERSION,
        promptVersions,
        builtAt: new Date().toISOString(),
        contextHash,
        aiConfigured,
        coverage: material.coverage,
      },
      graph,
      evidence: store.evidence,
      parties: { contractor: extracted.contractor, officers: extracted.officers, recipients: extracted.recipients },
      references,
      project: extracted.project,
      timeline: analyzed.timeline,
      financials: analyzed.financials,
      findings: analyzed.findings,
      correlations,
      compliance,
      insuranceCoverage: docFacts.insuranceCoverage,
      scheduleBTables: docFacts.scheduleBTables,
      legalFramework,
      synthesis: verified.synthesis,
      verification: verified.report,
      riskAssessment: analyzed.riskAssessment,
    };

    // Persist (best-effort cache write).
    try {
      await admin.from("case_intelligence").upsert(
        {
          complaint_id: complaintId,
          artifact: intel,
          context_hash: contextHash,
          engine_version: ENGINE_VERSION,
          model: null,
          ai_configured_at_build: aiConfigured,
          ai_synthesis_used: synth.usedAi,
          build_status: "done",
          build_error: null,
          built_at: intel.meta.builtAt,
        },
        { onConflict: "complaint_id" },
      );
    } catch (e) {
      console.warn("[case-intelligence] cache write failed", complaintId, e);
    }

    return { ok: true, intel, fromCache: false };
  } catch (e) {
    console.error("[case-intelligence] build failed", complaintId, e);
    // Advance the status off the 'running' claim so the row isn't stuck in-flight
    // forever (which would keep the dossier polling and never retry). 'failed' is
    // reclaimable — the dossier / triggers re-kick a build on the next view/mutation.
    try {
      await admin
        .from("case_intelligence")
        .upsert(
          { complaint_id: complaintId, build_status: "failed", build_error: e instanceof Error ? e.message : "Case intelligence build failed" },
          { onConflict: "complaint_id" },
        );
    } catch { /* ignore — best-effort */ }
    return { ok: false, intel: null, fromCache: false, error: e instanceof Error ? e.message : "Case intelligence build failed" };
  }
}
