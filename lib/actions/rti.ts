"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { writeAudit, diffFields } from "@/lib/audit";
import {
  rtiSchema,
  rtiFirstAppealSchema,
  rtiSecondAppealSchema,
} from "@/lib/validators";
import { RTI_WRITE_ROLES, RTI_STATUSES, RTI_DOCUMENT_TYPES, STORAGE_BUCKETS } from "@/lib/constants";
import { getDeadlineRules } from "@/lib/settings";
import { computeRtiDeadlines } from "@/lib/rti-deadlines";
import type { ActionState } from "@/lib/actions/contacts";
import { uploadBuffer, downloadBuffer, getSignedUrl, removeObject } from "@/lib/storage/supabase-upload";
import { runOcr } from "@/lib/ocr/ocr-service";
import { analyzeRtiAcknowledgement } from "@/lib/ai/rti-acknowledgement-analyzer";
import { summarizeRtiDocument } from "@/lib/ai/rti-document-summarizer";
import { detectRtiLetters } from "@/lib/ai/rti-letter-detector";
import { isAiConfigured } from "@/lib/ai/provider";
import { buildMergedPdf, extractPdfPages } from "@/lib/pdf/merge";
import { pdfRenderer } from "@/lib/pdf/pdf-renderer";
import { uploadToR2, downloadFromR2, deleteFromR2, isR2Url } from "@/lib/storage/r2-upload";
import { randomUUID } from "node:crypto";
import type {
  AnalyzeRtiResult,
  AnalyzedLetter,
  CommitLetterInput,
  CommitRtiLettersResult,
  StartRtiImportResult,
  RtiImportBatch,
} from "@/lib/rti/letter-import";

function genRef(prefix: string): string {
  const year = new Date().getFullYear();
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}-${year}-${suffix}`;
}

function fieldErrors(error: { issues: { path: (string | number)[]; message: string }[] }) {
  const out: Record<string, string> = {};
  for (const i of error.issues) {
    const k = String(i.path[0] ?? "form");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

// ── RTI applications ────────────────────────────────────────────────────────

function parseRti(formData: FormData) {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) obj[k] = v;
  // checkboxes: real booleans (z.coerce.boolean treats "false" as true)
  obj.isLifeLiberty = formData.get("isLifeLiberty") === "on" || formData.get("isLifeLiberty") === "true";
  obj.applicationFeePaid = formData.get("applicationFeePaid") === "on" || formData.get("applicationFeePaid") === "true";
  obj.reminderEnabled = formData.get("reminderEnabled") === "on" || formData.get("reminderEnabled") === "true";
  return rtiSchema.safeParse(obj);
}

async function rtiToRow(
  supabase: any,
  input: Record<string, any>,
  deadlines: { normalDue: string | null; lifeLibertyDue: string | null; firstAppealDue: string | null; secondAppealDue: string | null },
) {
  const tags =
    typeof input.tags === "string" && input.tags.trim()
      ? input.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
      : [];

  let divisionId = input.divisionId ?? null;
  let engSubDivisionId = input.engSubDivisionId ?? null;
  let gbaWardId = null;
  let gbaDivision = null;
  let gbaSubdivision = null;
  const wardType = input.wardType || "BBMP";

  if (wardType === "GBA") {
    gbaWardId = input.wardId ?? null;
    gbaDivision = input.divisionId ?? null;
    gbaSubdivision = input.engSubDivisionId ?? null;

    if (gbaDivision) {
      const { data: d } = await supabase
        .from("divisions")
        .select("id")
        .eq("name", gbaDivision)
        .maybeSingle();
      divisionId = d?.id ?? null;
    }
    if (gbaSubdivision) {
      const { data: s } = await supabase
        .from("eng_subdivisions")
        .select("id")
        .eq("name", gbaSubdivision)
        .maybeSingle();
      engSubDivisionId = s?.id ?? null;
    }
  }

  return {
    subject: input.subject,
    info_requested: input.infoRequested ?? null,
    category: input.category ?? null,
    status: input.status,
    priority: input.priority,
    filing_mode: input.filingMode ?? null,
    satisfaction_status: input.satisfactionStatus ?? null,
    applicant_name: input.applicantName ?? null,
    applicant_address: input.applicantAddress ?? null,
    applicant_phone: input.applicantPhone ?? null,
    applicant_email: input.applicantEmail ?? null,
    public_authority: input.publicAuthority ?? null,
    department: input.department ?? null,
    office_address: input.officeAddress ?? null,
    pio_name: input.pioName ?? null,
    pio_designation: input.pioDesignation ?? null,
    pio_phone: input.pioPhone ?? null,
    pio_email: input.pioEmail ?? null,
    faa_name: input.faaName ?? null,
    faa_designation: input.faaDesignation ?? null,
    faa_phone: input.faaPhone ?? null,
    faa_email: input.faaEmail ?? null,
    corporation_id: input.corporationId ?? null,
    division_id: divisionId,
    eng_subdivision_id: engSubDivisionId,
    ward_id: wardType === "BBMP" ? (input.wardId ?? null) : null,
    contact_id: input.contactId ?? null,
    application_fee_paid: input.applicationFeePaid ?? false,
    fee_mode: input.feeMode ?? null,
    postal_receipt_no: input.postalReceiptNo ?? null,
    online_reg_no: input.onlineRegNo ?? null,
    job_number: input.jobNumber ?? null,
    date_drafted: input.dateDrafted ?? null,
    date_filed: input.dateFiled ?? null,
    date_received: input.dateReceived ?? null,
    is_life_liberty: input.isLifeLiberty ?? false,
    reply_date: input.replyDate ?? null,
    reply_summary: input.replySummary ?? null,
    next_action: input.nextAction ?? null,
    next_action_date: input.nextActionDate ?? null,
    reminder_enabled: input.reminderEnabled ?? false,
    tags,
    internal_notes: input.internalNotes ?? null,
    public_notes: input.publicNotes ?? null,
    normal_due: deadlines.normalDue,
    life_liberty_due: deadlines.lifeLibertyDue,
    first_appeal_due: deadlines.firstAppealDue,
    second_appeal_due: deadlines.secondAppealDue,

    // GBA columns
    ward_type: wardType,
    gba_ward_id: gbaWardId,
    gba_division: gbaDivision,
    gba_subdivision: gbaSubdivision,
  };
}

async function deadlinesFor(input: Record<string, any>) {
  const rules = await getDeadlineRules();
  return computeRtiDeadlines(
    {
      dateReceived: input.dateReceived ?? null,
      dateFiled: input.dateFiled ?? null,
      isLifeLiberty: input.isLifeLiberty ?? false,
      replyDate: input.replyDate ?? null,
    },
    rules,
  );
}

export async function createRti(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const parsed = parseRti(formData);
  if (!parsed.success)
    return { error: "Please fix the errors below.", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const deadlines = await deadlinesFor(parsed.data);
  const row = {
    ...await rtiToRow(supabase, parsed.data, deadlines),
    internal_ref: genRef("RTI"),
    created_by: user.id,
    updated_by: user.id,
  };
  const { data, error } = await supabase
    .from("rti_applications")
    .insert(row)
    .select("id")
    .single();
  if (error) return { error: error.message };

  await writeAudit(supabase, {
    entityType: "rti",
    entityId: data.id,
    changedBy: user.id,
    changes: [{ field: "created", oldValue: null, newValue: parsed.data.subject }],
  });
  revalidatePath("/rti");
  return { success: true, id: data.id };
}

export async function updateRti(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const parsed = parseRti(formData);
  if (!parsed.success)
    return { error: "Please fix the errors below.", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: before } = await supabase.from("rti_applications").select("*").eq("id", id).single();
  const deadlines = await deadlinesFor(parsed.data);
  const row = { ...await rtiToRow(supabase, parsed.data, deadlines), updated_by: user.id };
  const { error } = await supabase.from("rti_applications").update(row).eq("id", id);
  if (error) return { error: error.message };

  await writeAudit(supabase, {
    entityType: "rti",
    entityId: id,
    changedBy: user.id,
    changes: diffFields(before ?? null, row),
  });
  revalidatePath(`/rti/${id}`);
  revalidatePath("/rti");
  return { success: true, id };
}

export async function setRtiStatus(id: string, status: string): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  if (!RTI_STATUSES.includes(status as never)) return { error: "Invalid status" };

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("rti_applications")
    .select("status")
    .eq("id", id)
    .single();
  const { error } = await supabase
    .from("rti_applications")
    .update({ status, updated_by: user.id })
    .eq("id", id);
  if (error) return { error: error.message };

  await writeAudit(supabase, {
    entityType: "rti",
    entityId: id,
    changedBy: user.id,
    changes: [{ field: "status", oldValue: before?.status, newValue: status }],
  });
  revalidatePath(`/rti/${id}`);
  revalidatePath("/rti");
  return { success: true, id };
}

export async function deleteRti(id: string): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("rti_applications").delete().eq("id", id);
  if (error) return { error: error.message };
  await writeAudit(supabase, {
    entityType: "rti",
    entityId: id,
    changedBy: user.id,
    changes: [{ field: "deleted", oldValue: id, newValue: null }],
  });
  revalidatePath("/rti");
  return { success: true };
}

// ── First appeals ───────────────────────────────────────────────────────────

function parseFirstAppeal(formData: FormData) {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) obj[k] = v;
  obj.grounds = formData.getAll("grounds");
  return rtiFirstAppealSchema.safeParse(obj);
}

export async function createFirstAppeal(
  rtiId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const parsed = parseFirstAppeal(formData);
  if (!parsed.success)
    return { error: "Please fix the errors below.", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const supabase = await createClient();
  const rules = await getDeadlineRules();
  const faaOrderDue = d.dateFiled
    ? // FAA disposal target from filing date
      new Date(new Date(d.dateFiled).getTime() + rules.faaDisposalDays * 86_400_000)
        .toISOString()
        .slice(0, 10)
    : null;

  const row = {
    rti_id: rtiId,
    faa_name: d.faaName ?? null,
    faa_designation: d.faaDesignation ?? null,
    faa_phone: d.faaPhone ?? null,
    faa_email: d.faaEmail ?? null,
    grounds: d.grounds ?? [],
    grounds_detail: d.groundsDetail ?? null,
    date_drafted: d.dateDrafted ?? null,
    date_filed: d.dateFiled ?? null,
    faa_order_due: faaOrderDue,
    faa_order_date: d.faaOrderDate ?? null,
    decision_summary: d.decisionSummary ?? null,
    status: d.dateFiled ? "Filed" : "Draft",
    notes: d.notes ?? null,
    created_by: user.id,
    updated_by: user.id,
  };
  const { data, error } = await supabase
    .from("rti_first_appeals")
    .insert(row)
    .select("id")
    .single();
  if (error) return { error: error.message };

  // Reflect on the parent RTI: bump status and recompute the second-appeal clock.
  const newStatus = d.dateFiled ? "First Appeal Filed" : "First Appeal Drafted";
  const rtiUpdate: Record<string, unknown> = { status: newStatus, updated_by: user.id };
  if (d.faaOrderDate) {
    const secondAppealDue = computeRtiDeadlines(
      { firstAppealDecisionDate: d.faaOrderDate },
      rules,
    ).secondAppealDue;
    rtiUpdate.second_appeal_due = secondAppealDue;
    rtiUpdate.status = "FAA Order Received";
  }
  await supabase.from("rti_applications").update(rtiUpdate).eq("id", rtiId);

  await writeAudit(supabase, {
    entityType: "rti_first_appeal",
    entityId: data.id,
    changedBy: user.id,
    changes: [{ field: "created", oldValue: null, newValue: rtiId }],
  });
  revalidatePath(`/rti/${rtiId}`);
  revalidatePath("/rti");
  return { success: true, id: rtiId };
}

// ── Second appeals ──────────────────────────────────────────────────────────

function parseSecondAppeal(formData: FormData) {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) obj[k] = v;
  obj.reason = formData.getAll("reason");
  return rtiSecondAppealSchema.safeParse(obj);
}

export async function createSecondAppeal(
  rtiId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const parsed = parseSecondAppeal(formData);
  if (!parsed.success)
    return { error: "Please fix the errors below.", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const supabase = await createClient();
  const row = {
    rti_id: rtiId,
    first_appeal_id: d.firstAppealId ?? null,
    commission_name: d.commissionName ?? null,
    reason: d.reason ?? [],
    reason_detail: d.reasonDetail ?? null,
    filing_date: d.filingDate ?? null,
    diary_number: d.diaryNumber ?? null,
    hearing_date: d.hearingDate ?? null,
    hearing_status: d.hearingStatus ?? null,
    order_date: d.orderDate ?? null,
    order_summary: d.orderSummary ?? null,
    compliance_due_date: d.complianceDueDate ?? null,
    compliance_status: d.complianceStatus ?? null,
    status: d.filingDate ? "Filed" : "Draft",
    notes: d.notes ?? null,
    created_by: user.id,
    updated_by: user.id,
  };
  const { data, error } = await supabase
    .from("rti_second_appeals")
    .insert(row)
    .select("id")
    .single();
  if (error) return { error: error.message };

  await supabase
    .from("rti_applications")
    .update({ status: d.filingDate ? "Second Appeal Filed" : "Second Appeal Drafted", updated_by: user.id })
    .eq("id", rtiId);

  await writeAudit(supabase, {
    entityType: "rti_second_appeal",
    entityId: data.id,
    changedBy: user.id,
    changes: [{ field: "created", oldValue: null, newValue: rtiId }],
  });
  revalidatePath(`/rti/${rtiId}`);
  revalidatePath("/rti");
  return { success: true, id: rtiId };
}

// ── RTI Acknowledgement Image Verification ───────────────────────────────────

export async function uploadRtiAcknowledgementAction(
  rtiId: string,
  formData: FormData,
): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }

  const file = formData.get("file") as File;
  if (!file) return { error: "No file provided" };
  
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
  if (!isImage && !isPdf) {
    return { error: "Only image files (JPEG, PNG, WebP) and PDF documents are supported" };
  }

  const supabase = await createClient();

  // Get current user name for history
  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();
  const userName = profile?.name || user.email || "Unknown User";

  try {
    const startTime = Date.now();

    // 1. Read existing record to check if we are replacing/superseding
    const { data: before } = await supabase
      .from("rti_applications")
      .select("*")
      .eq("id", rtiId)
      .single();

    if (!before) return { error: "RTI application not found" };

    const archive = Array.isArray(before.ack_archive) ? before.ack_archive : [];
    const history = Array.isArray(before.ack_history) ? before.ack_history : [];

    // If an acknowledgement already exists, copy current fields to archive (Supersede)
    if (before.ack_image_path) {
      archive.push({
        ack_image_path: before.ack_image_path,
        ack_status: before.ack_status,
        ack_file_metadata: before.ack_file_metadata,
        ack_ocr_text: before.ack_ocr_text,
        ack_ocr_confidence: before.ack_ocr_confidence,
        ack_document_type: before.ack_document_type,
        ack_visual_elements: before.ack_visual_elements,
        ack_extracted_info: before.ack_extracted_info,
        ack_verification_summary: before.ack_verification_summary,
        ack_confidence_score: before.ack_confidence_score,
        ack_recommended_action: before.ack_recommended_action,
        archivedAt: new Date().toISOString(),
      });
      history.push({
        event: "Acknowledgement replaced",
        timestamp: new Date().toISOString(),
        user: userName,
      });
      await writeAudit(supabase, {
        entityType: "rti",
        entityId: rtiId,
        changedBy: user.id,
        changes: [{ field: "ack_replaced", oldValue: before.ack_image_path, newValue: null }],
      });
    } else {
      history.push({
        event: "Acknowledgement uploaded",
        timestamp: new Date().toISOString(),
        user: userName,
      });
      await writeAudit(supabase, {
        entityType: "rti",
        entityId: rtiId,
        changedBy: user.id,
        changes: [{ field: "ack_uploaded", oldValue: null, newValue: file.name }],
      });
    }

    // 2. Upload original file permanently and unmodified to storage
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const extension = file.name.split(".").pop() || (isPdf ? "pdf" : "png");
    const storagePath = `${rtiId}/acknowledgement-${Date.now()}.${extension}`;

    await uploadBuffer({
      bucket: STORAGE_BUCKETS.rti,
      path: storagePath,
      body: buffer,
      contentType: file.type,
    });

    // Set initial status to Uploaded
    await supabase
      .from("rti_applications")
      .update({
        ack_image_path: storagePath,
        ack_status: "Uploaded",
        ack_history: history,
        updated_by: user.id,
      })
      .eq("id", rtiId);

    // Rasterize PDF pages using pluggable pdfRenderer or wrap image
    let pageImages: { buffer: Buffer; mimeType: string }[] = [];
    if (isPdf) {
      const pages = await pdfRenderer.renderPages(buffer);
      pageImages = pages.map(p => ({ buffer: p.buffer, mimeType: p.mimeType }));
    } else {
      pageImages = [{ buffer, mimeType: file.type }];
    }

    // 3. Stage 1: OCR Processing
    history.push({
      event: "OCR processing started",
      timestamp: new Date().toISOString(),
      user: "System (Tesseract)",
    });

    await supabase
      .from("rti_applications")
      .update({
        ack_status: "OCR Processing",
        ack_history: history,
        updated_by: user.id,
      })
      .eq("id", rtiId);

    // Process OCR page-by-page
    const pagesOcr: { page: number; text: string; confidence: number | null }[] = [];
    let combinedOcrText = "";
    let totalConfidence = 0;
    let confidenceCount = 0;

    for (let i = 0; i < pageImages.length; i++) {
      const pageImage = pageImages[i];
      if (!pageImage) continue;
      const ocrResult = await runOcr({
        buffer: pageImage.buffer,
        mimeType: pageImage.mimeType,
        language: "eng+kan",
      });

      pagesOcr.push({
        page: i + 1,
        text: ocrResult.cleanText,
        confidence: ocrResult.confidence,
      });

      if (pageImages.length > 1) {
        combinedOcrText += `--- Page ${i + 1} ---\n${ocrResult.cleanText}\n\n`;
      } else {
        combinedOcrText = ocrResult.cleanText;
      }

      if (ocrResult.confidence !== null) {
        totalConfidence += ocrResult.confidence;
        confidenceCount++;
      }
    }

    const avgOcrConfidence = confidenceCount > 0 ? Math.round(totalConfidence / confidenceCount) : null;

    history.push({
      event: "OCR completed",
      timestamp: new Date().toISOString(),
      user: "System (Tesseract)",
    });

    await supabase
      .from("rti_applications")
      .update({
        ack_ocr_text: combinedOcrText,
        ack_ocr_confidence: avgOcrConfidence,
        ack_status: "OCR Completed",
        ack_history: history,
        updated_by: user.id,
      })
      .eq("id", rtiId);

    // 4. Stage 2: AI Verification
    history.push({
      event: "AI verification started",
      timestamp: new Date().toISOString(),
      user: "System (AI)",
    });

    await supabase
      .from("rti_applications")
      .update({
        ack_status: "AI Processing",
        ack_history: history,
        updated_by: user.id,
      })
      .eq("id", rtiId);

    const aiResult = await analyzeRtiAcknowledgement({
      images: pageImages,
      ocrText: combinedOcrText,
      rti: {
        publicAuthority: before.public_authority || "",
        department: before.department || "",
        applicantName: before.applicant_name || "",
        dateFiled: before.date_filed || "",
        subject: before.subject || "",
        internalRef: before.internal_ref || "",
      },
    });

    const finalAckStatus =
      aiResult.recommendedAction === "Ready to Mark as Filed"
        ? "Verified"
        : aiResult.recommendedAction === "Verification Failed"
          ? "Verification Failed"
          : "Manual Review Required";

    const durationMs = Date.now() - startTime;
    const fileMetadata = {
      fileName: file.name,
      originalFileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      fileType: isPdf ? "PDF" : "Image",
      uploadedAt: new Date().toISOString(),
      uploadTimestamp: new Date().toISOString(),
      uploadedBy: user.id,
      uploaderName: userName,
      totalPages: pageImages.length,
      ocrEngine: "Tesseract",
      aiModel: "claude-sonnet-4-6",
      processingDurationMs: durationMs,
      processingDuration: `${(durationMs / 1000).toFixed(2)}s`,
      processingVersion: "1.0.0",
      pagesOcr,
    };

    history.push({
      event: "AI verification completed",
      timestamp: new Date().toISOString(),
      user: "System (AI)",
    });

    await supabase
      .from("rti_applications")
      .update({
        ack_status: finalAckStatus,
        ack_document_type: aiResult.documentType,
        ack_visual_elements: aiResult.visualElements,
        ack_extracted_info: {
          extractedInfo: aiResult.extractedInfo,
          verifications: aiResult.verifications
        },
        ack_verification_summary: aiResult.verificationSummary,
        ack_confidence_score: aiResult.confidenceScore,
        ack_recommended_action: aiResult.recommendedAction,
        ack_file_metadata: fileMetadata,
        ack_history: history,
        ack_archive: archive,
        updated_by: user.id,
      })
      .eq("id", rtiId);

    // Audit trace for all changes
    await writeAudit(supabase, {
      entityType: "rti",
      entityId: rtiId,
      changedBy: user.id,
      changes: [
        { field: "ack_status", oldValue: before.ack_status, newValue: finalAckStatus },
        { field: "ack_recommended_action", oldValue: before.ack_recommended_action, newValue: aiResult.recommendedAction },
      ],
    });

    revalidatePath(`/rti/${rtiId}`);
    revalidatePath("/rti");
    return { success: true, id: rtiId };
  } catch (e) {
    console.error("[uploadRtiAcknowledgementAction]", e);
    // Safe fall-back: set status to Verification Failed, but keep uploaded details
    try {
      const { data: current } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .single();
      const fallbackUserName = current?.name || user.email || "Unknown User";

      const { data: currentRti } = await supabase
        .from("rti_applications")
        .select("ack_history")
        .eq("id", rtiId)
        .single();
      const currentHistory = Array.isArray(currentRti?.ack_history) ? currentRti.ack_history : [];
      currentHistory.push({
        event: "Verification Failed",
        timestamp: new Date().toISOString(),
        user: `System (Error: ${e instanceof Error ? e.message : "Pipeline error"})`,
      });
      await supabase
        .from("rti_applications")
        .update({
          ack_status: "Verification Failed",
          ack_history: currentHistory,
          updated_by: user.id,
        })
        .eq("id", rtiId);
    } catch {}
    
    revalidatePath(`/rti/${rtiId}`);
    return { error: e instanceof Error ? e.message : "Processing failed" };
  }
}

export async function runAiVerificationOnlyAction(rtiId: string): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();
  const userName = profile?.name || user.email || "Unknown User";

  try {
    const rti = await supabase
      .from("rti_applications")
      .select("*")
      .eq("id", rtiId)
      .single();

    if (rti.error) return { error: rti.error.message };
    const record = rti.data;
    if (!record) return { error: "RTI application not found" };
    if (!record.ack_image_path) return { error: "No acknowledgement file has been uploaded" };

    const startTime = Date.now();

    // Set stage to AI Processing
    const history = Array.isArray(record.ack_history) ? record.ack_history : [];
    history.push({
      event: "Verification Re-run",
      timestamp: new Date().toISOString(),
      user: userName,
    });

    await supabase
      .from("rti_applications")
      .update({
        ack_status: "AI Processing",
        ack_history: history,
        updated_by: user.id,
      })
      .eq("id", rtiId);

    // Download original file from storage (can be PDF or Image)
    const buffer = await downloadBuffer(STORAGE_BUCKETS.rti, record.ack_image_path);
    if (!buffer) return { error: "Could not retrieve original file from storage" };

    const fileMetadata = record.ack_file_metadata || {};
    const mimeType = fileMetadata.mimeType || "image/png";
    const isPdf = fileMetadata.fileType === "PDF" || mimeType === "application/pdf" || record.ack_image_path.endsWith(".pdf");

    // Retrieve/rasterize images for vision
    let pageImages: { buffer: Buffer; mimeType: string }[] = [];
    if (isPdf) {
      const pages = await pdfRenderer.renderPages(buffer);
      pageImages = pages.map(p => ({ buffer: p.buffer, mimeType: p.mimeType }));
    } else {
      pageImages = [{ buffer, mimeType }];
    }

    // Run Vision verification
    const aiResult = await analyzeRtiAcknowledgement({
      images: pageImages,
      ocrText: record.ack_ocr_text || "",
      rti: {
        publicAuthority: record.public_authority || "",
        department: record.department || "",
        applicantName: record.applicant_name || "",
        dateFiled: record.date_filed || "",
        subject: record.subject || "",
        internalRef: record.internal_ref || "",
      },
    });

    const finalAckStatus =
      aiResult.recommendedAction === "Ready to Mark as Filed"
        ? "Verified"
        : aiResult.recommendedAction === "Verification Failed"
          ? "Verification Failed"
          : "Manual Review Required";

    const durationMs = Date.now() - startTime;
    const updatedMetadata = {
      ...fileMetadata,
      originalFileName: fileMetadata.originalFileName || fileMetadata.fileName || record.ack_image_path?.split("/").pop() || "unknown",
      fileName: fileMetadata.fileName || record.ack_image_path?.split("/").pop() || "unknown",
      uploadTimestamp: fileMetadata.uploadTimestamp || fileMetadata.uploadedAt || new Date().toISOString(),
      uploadedAt: fileMetadata.uploadedAt || new Date().toISOString(),
      processingDurationMs: (fileMetadata.processingDurationMs || 0) + durationMs,
      processingDuration: `${(((fileMetadata.processingDurationMs || 0) + durationMs) / 1000).toFixed(2)}s`,
      processingVersion: "1.0.0",
      aiModel: "claude-sonnet-4-6",
    };

    // Update DB
    await supabase
      .from("rti_applications")
      .update({
        ack_status: finalAckStatus,
        ack_document_type: aiResult.documentType,
        ack_visual_elements: aiResult.visualElements,
        ack_extracted_info: {
          extractedInfo: aiResult.extractedInfo,
          verifications: aiResult.verifications
        },
        ack_verification_summary: aiResult.verificationSummary,
        ack_confidence_score: aiResult.confidenceScore,
        ack_recommended_action: aiResult.recommendedAction,
        ack_file_metadata: updatedMetadata,
        ack_history: history,
        updated_by: user.id,
      })
      .eq("id", rtiId);

    await writeAudit(supabase, {
      entityType: "rti",
      entityId: rtiId,
      changedBy: user.id,
      changes: [
        { field: "ack_status", oldValue: record.ack_status, newValue: finalAckStatus },
        { field: "ack_recommended_action", oldValue: record.ack_recommended_action, newValue: aiResult.recommendedAction },
      ],
    });

    revalidatePath(`/rti/${rtiId}`);
    return { success: true, id: rtiId };
  } catch (e) {
    console.error("[runAiVerificationOnlyAction]", e);
    return { error: e instanceof Error ? e.message : "AI re-run failed" };
  }
}

export async function confirmRtiFiledAction(rtiId: string): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();
  const userName = profile?.name || user.email || "Unknown User";

  try {
    const { data: before } = await supabase
      .from("rti_applications")
      .select("status, date_filed, ack_history")
      .eq("id", rtiId)
      .single();

    if (!before) return { error: "RTI application not found" };

    const todayStr = new Date().toISOString().slice(0, 10);
    const targetDateFiled = before.date_filed || todayStr;

    const history = Array.isArray(before.ack_history) ? before.ack_history : [];
    history.push({
      event: "User confirmed RTI as Filed",
      timestamp: new Date().toISOString(),
      user: userName,
    });

    // Update status to Filed, update filing date if it was null
    await supabase
      .from("rti_applications")
      .update({
        status: "Filed",
        date_filed: targetDateFiled,
        ack_history: history,
        updated_by: user.id,
      })
      .eq("id", rtiId);

    await writeAudit(supabase, {
      entityType: "rti",
      entityId: rtiId,
      changedBy: user.id,
      changes: [
        { field: "status", oldValue: before.status, newValue: "Filed" },
        { field: "date_filed", oldValue: before.date_filed, newValue: targetDateFiled },
      ],
    });

    revalidatePath(`/rti/${rtiId}`);
    revalidatePath("/rti");
    return { success: true, id: rtiId };
  } catch (e) {
    console.error("[confirmRtiFiledAction]", e);
    return { error: e instanceof Error ? e.message : "Confirmation failed" };
  }
}

export async function deleteRtiAcknowledgementAction(rtiId: string): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();
  const userName = profile?.name || user.email || "Unknown User";

  try {
    const { data: before } = await supabase
      .from("rti_applications")
      .select("*")
      .eq("id", rtiId)
      .single();

    if (!before) return { error: "RTI application not found" };

    const archive = Array.isArray(before.ack_archive) ? before.ack_archive : [];
    const history = Array.isArray(before.ack_history) ? before.ack_history : [];

    // Push the current details into the archive (Supersede/Mark as deleted)
    if (before.ack_image_path) {
      archive.push({
        ack_image_path: before.ack_image_path,
        ack_status: before.ack_status,
        ack_file_metadata: before.ack_file_metadata,
        ack_ocr_text: before.ack_ocr_text,
        ack_ocr_confidence: before.ack_ocr_confidence,
        ack_document_type: before.ack_document_type,
        ack_visual_elements: before.ack_visual_elements,
        ack_extracted_info: before.ack_extracted_info,
        ack_verification_summary: before.ack_verification_summary,
        ack_confidence_score: before.ack_confidence_score,
        ack_recommended_action: before.ack_recommended_action,
        archivedAt: new Date().toISOString(),
        isDeletedCopy: true,
      });
    }

    history.push({
      event: "Acknowledgement deleted",
      timestamp: new Date().toISOString(),
      user: userName,
    });

    // Reset current acknowledgement columns
    await supabase
      .from("rti_applications")
      .update({
        ack_image_path: null,
        ack_status: "Not Uploaded",
        ack_file_metadata: null,
        ack_ocr_text: null,
        ack_ocr_confidence: null,
        ack_document_type: null,
        ack_visual_elements: [],
        ack_extracted_info: null,
        ack_verification_summary: null,
        ack_confidence_score: null,
        ack_recommended_action: null,
        ack_history: history,
        ack_archive: archive,
        updated_by: user.id,
      })
      .eq("id", rtiId);

    await writeAudit(supabase, {
      entityType: "rti",
      entityId: rtiId,
      changedBy: user.id,
      changes: [{ field: "ack_deleted", oldValue: before.ack_image_path, newValue: null }],
    });

    revalidatePath(`/rti/${rtiId}`);
    revalidatePath("/rti");
    return { success: true, id: rtiId };
  } catch (e) {
    console.error("[deleteRtiAcknowledgementAction]", e);
    return { error: e instanceof Error ? e.message : "Deletion failed" };
  }
}

export async function getSignedUrlAction(path: string): Promise<string | null> {
  try {
    await requireRole(RTI_WRITE_ROLES);
  } catch {
    return null;
  }
  // R2 files are stored as full public URLs — return directly, no Supabase lookup.
  if (isR2Url(path)) return path;
  // Legacy: Supabase-stored files use a short-lived signed URL.
  return getSignedUrl(STORAGE_BUCKETS.rti, path);
}

// ── RTI documents (capture/scan → merge PDF → OCR → summarise) ────────────────
//   Flexible, typed document list per RTI (Application, Acknowledgement, Reply,
//   FAA Order, …). Replaces the single-slot acknowledgement flow. See
//   supabase/migrations/0015_rti_documents.sql.

/** Doc types whose upload starts/seeds the statutory reply clock. */
const CLOCK_DOC_TYPES = new Set(["Application", "Acknowledgement"]);

/** The status an uploaded document advances the RTI to (applied forward-only). */
const STATUS_FOR_DOC_TYPE: Record<string, string> = {
  Application: "Filed",
  Acknowledgement: "Filed",
  Reply: "Reply Received",
  "FAA Order": "FAA Order Received",
  "Second Appeal Order": "Second Appeal Filed",
  "Higher Appeal Order": "Second Appeal Filed",
};

/** Lifecycle rank of a status (index in RTI_STATUSES); unknown → -1. */
function statusRank(status: string | null | undefined): number {
  return status ? (RTI_STATUSES as readonly string[]).indexOf(status) : -1;
}

function slugifyDocType(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "document";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Rasterise a merged PDF, OCR every page (eng+kan), then summarise via AI. */
async function ocrAndSummarize(
  pdfBuffer: Buffer,
  rti: { subject?: string | null; internal_ref?: string | null; public_authority?: string | null },
): Promise<{
  ocrText: string;
  ocrConfidence: number | null;
  summary: Awaited<ReturnType<typeof summarizeRtiDocument>>;
}> {
  const pages = await pdfRenderer.renderPages(pdfBuffer);
  const pageImages = pages.map((p) => ({ buffer: p.buffer, mimeType: p.mimeType }));

  let combined = "";
  let totalConf = 0;
  let confCount = 0;
  for (let i = 0; i < pageImages.length; i++) {
    const pi = pageImages[i];
    if (!pi) continue;
    const r = await runOcr({ buffer: pi.buffer, mimeType: pi.mimeType, language: "eng+kan" });
    if (pageImages.length > 1) combined += `--- Page ${i + 1} ---\n${r.cleanText}\n\n`;
    else combined = r.cleanText;
    if (r.confidence !== null) {
      totalConf += r.confidence;
      confCount++;
    }
  }
  const ocrConfidence = confCount > 0 ? Math.round(totalConf / confCount) : null;

  const summary = await summarizeRtiDocument({
    images: pageImages,
    ocrText: combined,
    rti: { subject: rti.subject, internalRef: rti.internal_ref, publicAuthority: rti.public_authority },
  });

  return { ocrText: combined, ocrConfidence, summary };
}

function buildExtracted(summary: Awaited<ReturnType<typeof summarizeRtiDocument>>) {
  return {
    authority: summary.authority,
    subject: summary.subject,
    category: summary.category,
    referenceNumber: summary.referenceNumber,
    documentDate: summary.documentDate,
    keyDates: summary.keyDates,
    documentType: summary.documentType,
  };
}

// ── Multi-letter import (one PDF holding several RTIs → one case per letter) ───

/** Like the OCR half of {@link ocrAndSummarize}, but exposes per-page text so the
 *  commit step can slice it per detected letter without re-running OCR. */
async function renderAndOcr(pdfBuffer: Buffer): Promise<{
  combined: string;
  perPage: string[];
  pageImages: { buffer: Buffer; mimeType: string }[];
}> {
  const pages = await pdfRenderer.renderPages(pdfBuffer);
  const pageImages = pages.map((p) => ({ buffer: p.buffer, mimeType: p.mimeType }));

  const perPage: string[] = [];
  for (const pi of pageImages) {
    const r = await runOcr({ buffer: pi.buffer, mimeType: pi.mimeType, language: "eng+kan" });
    perPage.push(r.cleanText || "");
  }
  const combined =
    perPage.length > 1
      ? perPage.map((t, i) => `--- Page ${i + 1} ---\n${t}\n`).join("\n")
      : (perPage[0] || "");
  return { combined, perPage, pageImages };
}

/** Join a 1-indexed inclusive slice of per-page OCR text, re-adding page markers. */
function sliceOcr(perPage: string[], startPage: number, endPage: number): string {
  const seg = perPage.slice(startPage - 1, endPage);
  if (seg.length <= 1) return seg[0] || "";
  return seg.map((t, i) => `--- Page ${startPage + i} ---\n${t}\n`).join("\n");
}

/** Collision-resistant case ref — randomUUID-based (Date.now() can repeat in a loop). */
function genUniqueRef(): string {
  const year = new Date().getFullYear();
  const suffix = randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase();
  return `RTI-${year}-${suffix}`;
}

/**
 * Phase 1 of multi-letter import: merge the uploaded file(s) into one PDF, store
 * it, OCR every page once, and ask the AI to find the letter boundaries. Creates
 * NO cases — returns the detected letters (with per-letter OCR sliced in) for the
 * user to review/edit before {@link commitRtiLettersAction} creates the cases.
 */
export async function analyzeRtiOfficeCopyAction(formData: FormData): Promise<AnalyzeRtiResult> {
  try {
    await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }

  if (!isAiConfigured()) {
    return {
      error:
        "AI is not configured on the server, so letters can't be detected automatically. Set ANTHROPIC_API_KEY (and AI_PROVIDER=anthropic) and try again.",
    };
  }

  let rawFiles = formData.getAll("files");
  if (rawFiles.length === 0) rawFiles = formData.getAll("file");
  const files = rawFiles.filter(
    (x): x is File =>
      typeof x === "object" && x !== null && typeof (x as { arrayBuffer?: unknown }).arrayBuffer === "function",
  );
  if (files.length === 0) return { error: "No files provided" };

  const parts: { buffer: Buffer; mimeType: string }[] = [];
  for (const f of files) {
    const isImage = f.type.startsWith("image/");
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!isImage && !isPdf) {
      return { error: `Unsupported file "${f.name}". Use images (JPEG, PNG, WebP) or PDF.` };
    }
    parts.push({ buffer: Buffer.from(await f.arrayBuffer()), mimeType: isPdf ? "application/pdf" : f.type });
  }

  try {
    const { pdf, pageCount } = await buildMergedPdf(parts);

    // Hold the merged PDF under a staging prefix until the user commits.
    const storagePath = await uploadToR2({
      key: `letters/_imports/${randomUUID()}.pdf`,
      body: pdf,
      contentType: "application/pdf",
    });

    const letters = await detectLettersFromPdf(pdf, pageCount);
    return { success: true, storagePath, pageCount, letters };
  } catch (e) {
    console.error("[analyzeRtiOfficeCopyAction]", e);
    return { error: e instanceof Error ? e.message : "Analysis failed" };
  }
}

/** Render → OCR → AI detect → slice per-letter OCR. Shared by the synchronous and
 *  background (refresh-safe) import paths. */
async function detectLettersFromPdf(pdf: Buffer, pageCount: number): Promise<AnalyzedLetter[]> {
  const { combined, perPage, pageImages } = await renderAndOcr(pdf);
  const detected = await detectRtiLetters({ pageImages, ocrText: combined, pageCount });
  return detected.map((l) => ({ ...l, ocrText: sliceOcr(perPage, l.startPage, l.endPage) }));
}

// ── Background (refresh-safe) office-copy import ──────────────────────────────
//   start → returns a batch id immediately and detects letters in the background
//   (Next `after()`); the client polls getRtiImportBatchAction and re-attaches by
//   batch id after a page refresh. Persisted in rti_import_batches (mig 0017).

/**
 * Begin a background multi-letter import. Merges + stores the upload, records a
 * Processing batch, then runs detection AFTER the response is sent so a page
 * refresh can't abort it. Returns the batch id to poll/resume on.
 */
export async function startRtiOfficeCopyImport(formData: FormData): Promise<StartRtiImportResult> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }

  if (!isAiConfigured()) {
    return {
      error:
        "AI is not configured on the server, so letters can't be detected automatically. Set ANTHROPIC_API_KEY (and AI_PROVIDER=anthropic) and try again.",
    };
  }

  let rawFiles = formData.getAll("files");
  if (rawFiles.length === 0) rawFiles = formData.getAll("file");
  const files = rawFiles.filter(
    (x): x is File =>
      typeof x === "object" && x !== null && typeof (x as { arrayBuffer?: unknown }).arrayBuffer === "function",
  );
  if (files.length === 0) return { error: "No files provided" };

  const parts: { buffer: Buffer; mimeType: string }[] = [];
  for (const f of files) {
    const isImage = f.type.startsWith("image/");
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!isImage && !isPdf) {
      return { error: `Unsupported file "${f.name}". Use images (JPEG, PNG, WebP) or PDF.` };
    }
    parts.push({ buffer: Buffer.from(await f.arrayBuffer()), mimeType: isPdf ? "application/pdf" : f.type });
  }

  // Service-role client: the background detector runs after the response, with no
  // request/cookie context, so batch rows are written via the admin client.
  const admin = createAdminClient();

  let pdf: Buffer;
  let pageCount: number;
  let storagePath: string;
  let batchId: string;
  try {
    ({ pdf, pageCount } = await buildMergedPdf(parts));
    storagePath = await uploadToR2({
      key: `letters/_imports/${randomUUID()}.pdf`,
      body: pdf,
      contentType: "application/pdf",
    });

    const { data, error } = await admin
      .from("rti_import_batches")
      .insert({ status: "Processing", storage_path: storagePath, page_count: pageCount, created_by: user.id })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message || "Failed to create import batch");
    batchId = data.id as string;
  } catch (e) {
    console.error("[startRtiOfficeCopyImport]", e);
    return { error: e instanceof Error ? e.message : "Could not start the import" };
  }

  // Detect AFTER the response is sent — survives a client refresh.
  const captured = { pdf, pageCount, storagePath, batchId };
  after(async () => {
    try {
      const letters = await detectLettersFromPdf(captured.pdf, captured.pageCount);
      await admin
        .from("rti_import_batches")
        .update({ status: "Ready", letters })
        .eq("id", captured.batchId);
    } catch (e) {
      console.error("[startRtiOfficeCopyImport:after]", e);
      await admin
        .from("rti_import_batches")
        .update({ status: "Failed", error: e instanceof Error ? e.message : "Detection failed" })
        .eq("id", captured.batchId);
    }
  });

  return { success: true, batchId };
}

/** Poll/resume a background import batch by id (used on refresh too). */
export async function getRtiImportBatchAction(batchId: string): Promise<RtiImportBatch> {
  try {
    await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  if (!batchId) return { error: "Missing batch id" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("rti_import_batches")
    .select("id, status, storage_path, page_count, letters, created_case_ids, error")
    .eq("id", batchId)
    .single();
  if (error || !data) return { error: "Import not found — it may have expired. Please re-upload." };

  return {
    success: true,
    batchId: data.id as string,
    status: data.status as RtiImportBatch["status"],
    storagePath: data.storage_path as string,
    pageCount: (data.page_count as number) ?? 0,
    letters: (data.letters as AnalyzedLetter[]) ?? [],
    createdIds: (data.created_case_ids as string[]) ?? [],
  };
}

/**
 * Phase 2 of multi-letter import: for each (reviewed) letter, create a new RTI
 * case, split its pages out of the staged PDF, attach it as an Application
 * document, and seed the filing date / reply clock. Reuses the OCR text captured
 * in phase 1 — only re-renders page images for the per-letter AI summary.
 */
export async function commitRtiLettersAction(params: {
  storagePath: string;
  letters: CommitLetterInput[];
  /** Optional background-import batch to mark Committed once cases are created. */
  batchId?: string;
}): Promise<CommitRtiLettersResult> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }

  const { storagePath, letters, batchId } = params;
  if (!storagePath || !Array.isArray(letters) || letters.length === 0) {
    return { error: "Nothing to create." };
  }

  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("name").eq("id", user.id).single();
  const userName = profile?.name || user.email || "Unknown User";

  const stagingPdf = isR2Url(storagePath)
    ? await downloadFromR2(storagePath)
    : await downloadBuffer(STORAGE_BUCKETS.rti, storagePath);
  if (!stagingPdf) return { error: "The uploaded file is no longer available — please re-upload." };

  // Render all page images once (cheap vs OCR) for the per-letter AI summary.
  let pageImages: { buffer: Buffer; mimeType: string }[] = [];
  try {
    const pages = await pdfRenderer.renderPages(stagingPdf);
    pageImages = pages.map((p) => ({ buffer: p.buffer, mimeType: p.mimeType }));
  } catch (e) {
    console.warn("[commitRtiLettersAction] page render failed; summarising from OCR text only", e);
  }

  const rules = await getDeadlineRules();
  const createdIds: string[] = [];

  try {
    for (const letter of letters) {
      const subject = (letter.subject || "").trim() || "Untitled RTI";
      const dateFiled = (letter.documentDate || "").trim() || todayIso();

      // 1. Create the case (Application copy ⇒ status "Filed", filing clock seeded).
      const input = {
        subject,
        category: letter.category ?? null,
        publicAuthority: letter.authority ?? null,
        pioName: letter.pioName ?? null,
        pioDesignation: letter.pioDesignation ?? null,
        status: "Filed",
        priority: "Medium",
        wardType: "BBMP",
        dateFiled,
        isLifeLiberty: false,
      };
      const deadlines = computeRtiDeadlines(
        { dateReceived: null, dateFiled, isLifeLiberty: false, replyDate: null },
        rules,
      );
      const row = {
        ...(await rtiToRow(supabase, input, deadlines)),
        internal_ref: genUniqueRef(),
        created_by: user.id,
        updated_by: user.id,
      };
      const { data: created, error: cErr } = await supabase
        .from("rti_applications")
        .insert(row)
        .select("id")
        .single();
      if (cErr || !created) throw new Error(cErr?.message || "Failed to create RTI case");
      const newId = created.id as string;
      createdIds.push(newId);

      await writeAudit(supabase, {
        entityType: "rti",
        entityId: newId,
        changedBy: user.id,
        changes: [{ field: "created", oldValue: null, newValue: subject }],
      });

      // 2. Carve this letter's pages out of the staged PDF and store in R2.
      const split = await extractPdfPages(stagingPdf, letter.startPage, letter.endPage);
      const r2Key = `letters/${row.internal_ref}-application.pdf`;
      const splitPath = await uploadToR2({
        key: r2Key,
        body: split.pdf,
        contentType: "application/pdf",
      });

      // 3. Summarise the letter — reuse phase-1 OCR text + the rendered pages.
      const letterImages = pageImages.slice(letter.startPage - 1, letter.endPage);
      const summary = await summarizeRtiDocument({
        images: letterImages,
        ocrText: letter.ocrText || "",
        rti: { subject, internalRef: row.internal_ref, publicAuthority: letter.authority ?? null },
      });

      // 4. Attach the split as this case's Application document.
      await supabase.from("rti_documents").insert({
        rti_id: newId,
        doc_type: "Application",
        title: null,
        pdf_path: splitPath,
        page_count: split.pageCount,
        file_size: split.pdf.length,
        source: "upload",
        doc_date: (letter.documentDate || "").trim() || null,
        ocr_text: letter.ocrText || null,
        ocr_confidence: null,
        ocr_status: (letter.ocrText || "").trim() ? "Completed" : "Skipped",
        ai_summary: summary.summary,
        ai_extracted: buildExtracted(summary),
        ai_status: "Completed",
        uploaded_by: user.id,
        uploader_name: userName,
      });

      revalidatePath(`/rti/${newId}`);
    }

    // The staged bundle is now redundant (each letter has its own split PDF).
    if (isR2Url(storagePath)) await deleteFromR2(storagePath);
    else await removeObject(STORAGE_BUCKETS.rti, storagePath);

    // Close out the background-import batch, if this came from one.
    if (batchId) {
      try {
        await createAdminClient()
          .from("rti_import_batches")
          .update({ status: "Committed", created_case_ids: createdIds })
          .eq("id", batchId);
      } catch (e) {
        console.warn("[commitRtiLettersAction] could not mark batch committed", e);
      }
    }

    revalidatePath("/rti");
    return { success: true, createdIds, primaryId: createdIds[0] };
  } catch (e) {
    console.error("[commitRtiLettersAction]", e);
    return { error: e instanceof Error ? e.message : "Failed to create cases", createdIds };
  }
}

/**
 * Upload one document: merge the captured pages / scanned PDF into a single PDF,
 * store it, OCR it, summarise it, and (for Application/Acknowledgement) start the
 * 30-day reply clock from the filing date.
 */
export async function uploadRtiDocumentAction(
  rtiId: string,
  formData: FormData,
): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }

  const rawType = String(formData.get("docType") ?? "Other");
  const docType = (RTI_DOCUMENT_TYPES as readonly string[]).includes(rawType) ? rawType : "Other";
  const title = ((formData.get("title") as string | null) ?? "").trim() || null;
  const source = ((formData.get("source") as string | null) ?? "").trim() || "upload";
  const docDateRaw = ((formData.get("docDate") as string | null) ?? "").trim() || null;

  let rawFiles = formData.getAll("files");
  if (rawFiles.length === 0) rawFiles = formData.getAll("file");
  const files = rawFiles.filter(
    (x): x is File =>
      typeof x === "object" && x !== null && typeof (x as { arrayBuffer?: unknown }).arrayBuffer === "function",
  );
  if (files.length === 0) return { error: "No files provided" };

  const parts: { buffer: Buffer; mimeType: string }[] = [];
  for (const f of files) {
    const isImage = f.type.startsWith("image/");
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!isImage && !isPdf) {
      return { error: `Unsupported file "${f.name}". Use images (JPEG, PNG, WebP) or PDF.` };
    }
    parts.push({ buffer: Buffer.from(await f.arrayBuffer()), mimeType: isPdf ? "application/pdf" : f.type });
  }

  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("name").eq("id", user.id).single();
  const userName = profile?.name || user.email || "Unknown User";

  const { data: rti } = await supabase
    .from("rti_applications")
    .select("id, subject, internal_ref, public_authority, category, date_filed, date_received, reply_date, is_life_liberty, status")
    .eq("id", rtiId)
    .single();
  if (!rti) return { error: "RTI application not found" };

  let docId: string | null = null;
  try {
    // 1. Merge captured pages / scanned PDF into one canonical PDF.
    const { pdf, pageCount } = await buildMergedPdf(parts);

    // 2. Store it in R2.
    const storagePath = await uploadToR2({
      key: `letters/${rti.internal_ref}-${slugifyDocType(docType)}-${Date.now().toString(36)}.pdf`,
      body: pdf,
      contentType: "application/pdf",
    });

    // 3. Create the document row (processing).
    const { data: inserted, error: insErr } = await supabase
      .from("rti_documents")
      .insert({
        rti_id: rtiId,
        doc_type: docType,
        title,
        pdf_path: storagePath,
        page_count: pageCount,
        file_size: pdf.length,
        source,
        doc_date: docDateRaw,
        ocr_status: "Processing",
        ai_status: "Pending",
        uploaded_by: user.id,
        uploader_name: userName,
      })
      .select("id")
      .single();
    if (insErr || !inserted) throw new Error(insErr?.message || "Failed to create document record");
    docId = inserted.id;

    await writeAudit(supabase, {
      entityType: "rti",
      entityId: rtiId,
      changedBy: user.id,
      changes: [{ field: "document_uploaded", oldValue: null, newValue: `${docType} (${pageCount} pg)` }],
    });

    // 4. OCR + AI summary.
    const { ocrText, ocrConfidence, summary } = await ocrAndSummarize(pdf, rti);
    await supabase
      .from("rti_documents")
      .update({
        ocr_text: ocrText,
        ocr_confidence: ocrConfidence,
        ocr_status: ocrText.trim() ? "Completed" : "Skipped",
        ai_summary: summary.summary,
        ai_extracted: buildExtracted(summary),
        ai_status: "Completed",
      })
      .eq("id", docId);

    // 5. Advance the statutory dates / deadlines / status from this document.
    //    - Application / Acknowledgement → filing date → reply clock (only if unset)
    //    - Reply                         → reply date → first-appeal clock (only if unset)
    //    - FAA Order                     → FAA decision date → second-appeal clock
    //    - Second / Higher Appeal Order  → status only (terminal statutory stages)
    {
      const eventDate = docDateRaw || summary.documentDate || todayIso();
      const patch: Record<string, unknown> = {};
      const changes: { field: string; oldValue: unknown; newValue: unknown }[] = [];
      let deadlineInput: Parameters<typeof computeRtiDeadlines>[0] | null = null;

      if (CLOCK_DOC_TYPES.has(docType)) {
        if (!rti.date_filed) {
          patch.date_filed = eventDate;
          changes.push({ field: "date_filed", oldValue: rti.date_filed, newValue: eventDate });
          deadlineInput = {
            dateReceived: rti.date_received,
            dateFiled: eventDate,
            isLifeLiberty: rti.is_life_liberty,
            replyDate: rti.reply_date,
          };
        }

        // Auto-extract and update Subject, Public Authority, and Category from Acknowledgement
        if (docType === "Acknowledgement") {
          if (summary.subject && summary.subject.trim()) {
            patch.subject = summary.subject.trim();
            changes.push({ field: "subject", oldValue: rti.subject, newValue: summary.subject.trim() });
          }
          if (summary.authority && summary.authority.trim()) {
            patch.public_authority = summary.authority.trim();
            changes.push({ field: "public_authority", oldValue: rti.public_authority, newValue: summary.authority.trim() });
          }
          if (summary.category && summary.category.trim()) {
            patch.category = summary.category.trim();
            changes.push({ field: "category", oldValue: rti.category, newValue: summary.category.trim() });
          }
        }
      } else if (docType === "Reply") {
        const replyDate = rti.reply_date || eventDate;
        if (!rti.reply_date) {
          patch.reply_date = replyDate;
          changes.push({ field: "reply_date", oldValue: rti.reply_date, newValue: replyDate });
        }
        deadlineInput = {
          dateReceived: rti.date_received,
          dateFiled: rti.date_filed,
          isLifeLiberty: rti.is_life_liberty,
          replyDate,
        };
      } else if (docType === "FAA Order") {
        // The FAA order date is authoritative for the second-appeal clock.
        deadlineInput = {
          dateReceived: rti.date_received,
          dateFiled: rti.date_filed,
          isLifeLiberty: rti.is_life_liberty,
          replyDate: rti.reply_date,
          firstAppealDecisionDate: eventDate,
        };
      }

      if (deadlineInput) {
        const rules = await getDeadlineRules();
        const d = computeRtiDeadlines(deadlineInput, rules);
        patch.normal_due = d.normalDue;
        patch.life_liberty_due = d.lifeLibertyDue;
        patch.first_appeal_due = d.firstAppealDue;
        patch.second_appeal_due = d.secondAppealDue;
      }

      // Forward-only status advance — never regress, never touch a closed case.
      const target = STATUS_FOR_DOC_TYPE[docType];
      if (target && rti.status !== "Closed" && statusRank(target) > statusRank(rti.status)) {
        patch.status = target;
        changes.push({ field: "status", oldValue: rti.status, newValue: target });
      }

      if (Object.keys(patch).length > 0) {
        patch.updated_by = user.id;
        await supabase.from("rti_applications").update(patch).eq("id", rtiId);
        if (changes.length > 0) {
          await writeAudit(supabase, { entityType: "rti", entityId: rtiId, changedBy: user.id, changes });
        }
      }
    }

    revalidatePath(`/rti/${rtiId}`);
    revalidatePath("/rti");
    return { success: true, id: rtiId };
  } catch (e) {
    console.error("[uploadRtiDocumentAction]", e);
    if (docId) {
      try {
        await supabase
          .from("rti_documents")
          .update({ ocr_status: "Failed", ai_status: "Failed" })
          .eq("id", docId);
      } catch {}
    }
    revalidatePath(`/rti/${rtiId}`);
    return { error: e instanceof Error ? e.message : "Processing failed" };
  }
}

/** Re-run OCR + AI summary on an already-stored document. */
export async function reprocessRtiDocumentAction(docId: string): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("rti_documents")
    .select("id, rti_id, pdf_path")
    .eq("id", docId)
    .single();
  if (!doc) return { error: "Document not found" };

  const { data: rti } = await supabase
    .from("rti_applications")
    .select("subject, internal_ref, public_authority")
    .eq("id", doc.rti_id)
    .single();

  try {
    await supabase
      .from("rti_documents")
      .update({ ocr_status: "Processing", ai_status: "Pending" })
      .eq("id", docId);

    const pdf = isR2Url(doc.pdf_path)
      ? await downloadFromR2(doc.pdf_path)
      : await downloadBuffer(STORAGE_BUCKETS.rti, doc.pdf_path);
    if (!pdf) throw new Error("Stored PDF could not be downloaded");

    const { ocrText, ocrConfidence, summary } = await ocrAndSummarize(pdf, rti ?? {});
    await supabase
      .from("rti_documents")
      .update({
        ocr_text: ocrText,
        ocr_confidence: ocrConfidence,
        ocr_status: ocrText.trim() ? "Completed" : "Skipped",
        ai_summary: summary.summary,
        ai_extracted: buildExtracted(summary),
        ai_status: "Completed",
      })
      .eq("id", docId);

    revalidatePath(`/rti/${doc.rti_id}`);
    return { success: true, id: doc.rti_id };
  } catch (e) {
    console.error("[reprocessRtiDocumentAction]", e);
    try {
      await supabase
        .from("rti_documents")
        .update({ ocr_status: "Failed", ai_status: "Failed" })
        .eq("id", docId);
    } catch {}
    return { error: e instanceof Error ? e.message : "Reprocessing failed" };
  }
}

/** Delete a document row + its stored PDF. Uses the admin client (RLS delete is admin-only). */
export async function deleteRtiDocumentAction(docId: string): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("rti_documents")
    .select("id, rti_id, pdf_path, doc_type")
    .eq("id", docId)
    .single();
  if (!doc) return { error: "Document not found" };

  const admin = createAdminClient();
  const { error } = await admin.from("rti_documents").delete().eq("id", docId);
  if (error) return { error: error.message };
  if (isR2Url(doc.pdf_path)) await deleteFromR2(doc.pdf_path);
  else await removeObject(STORAGE_BUCKETS.rti, doc.pdf_path);

  await writeAudit(supabase, {
    entityType: "rti",
    entityId: doc.rti_id,
    changedBy: user.id,
    changes: [{ field: "document_deleted", oldValue: doc.doc_type, newValue: null }],
  });
  revalidatePath(`/rti/${doc.rti_id}`);
  return { success: true, id: doc.rti_id };
}

/** Set/clear the filing date and recompute the statutory deadlines. */
export async function updateRtiFilingDateAction(
  rtiId: string,
  date: string | null,
): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }

  const supabase = await createClient();
  const { data: rti } = await supabase
    .from("rti_applications")
    .select("date_filed, date_received, reply_date, is_life_liberty, status")
    .eq("id", rtiId)
    .single();
  if (!rti) return { error: "RTI application not found" };

  const filingDate = date && date.trim() ? date.trim() : null;
  const rules = await getDeadlineRules();
  const deadlines = computeRtiDeadlines(
    {
      dateReceived: rti.date_received,
      dateFiled: filingDate,
      isLifeLiberty: rti.is_life_liberty,
      replyDate: rti.reply_date,
    },
    rules,
  );

  await supabase
    .from("rti_applications")
    .update({
      date_filed: filingDate,
      normal_due: deadlines.normalDue,
      life_liberty_due: deadlines.lifeLibertyDue,
      first_appeal_due: deadlines.firstAppealDue,
      second_appeal_due: deadlines.secondAppealDue,
      updated_by: user.id,
    })
    .eq("id", rtiId);

  await writeAudit(supabase, {
    entityType: "rti",
    entityId: rtiId,
    changedBy: user.id,
    changes: [{ field: "date_filed", oldValue: rti.date_filed, newValue: filingDate }],
  });
  revalidatePath(`/rti/${rtiId}`);
  revalidatePath("/rti");
  return { success: true, id: rtiId };
}

// ── Case closure ──────────────────────────────────────────────────────────────

/** Document types that carry an official response/decision — required to close a case. */
const CLOSEABLE_DOC_TYPES = new Set(["Reply", "FAA Order", "Second Appeal Order", "Higher Appeal Order"]);

/** Most-advanced status implied by the documents on file (used when reopening). */
function impliedStatusFromDocTypes(types: Set<string>): string {
  if (types.has("Second Appeal Order") || types.has("Higher Appeal Order")) return "Second Appeal Filed";
  if (types.has("FAA Order")) return "FAA Order Received";
  if (types.has("Reply")) return "Reply Received";
  if (types.has("Application") || types.has("Acknowledgement")) return "Filed";
  return "Draft";
}

/**
 * Close the RTI case (status → Closed). Requires at least one response/order
 * document (Reply / FAA Order / Second Appeal Order / Higher Appeal Order) —
 * an Application/Acknowledgement alone is not enough to close.
 */
export async function closeRtiCaseAction(rtiId: string): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }

  const supabase = await createClient();
  const { data: rti } = await supabase
    .from("rti_applications")
    .select("status")
    .eq("id", rtiId)
    .single();
  if (!rti) return { error: "RTI application not found" };

  const { data: docs } = await supabase
    .from("rti_documents")
    .select("doc_type")
    .eq("rti_id", rtiId);
  const hasResponse = (docs ?? []).some((d) => CLOSEABLE_DOC_TYPES.has(d.doc_type));
  if (!hasResponse) {
    return { error: "Upload a reply or an appeal order before closing this case." };
  }

  const { error } = await supabase
    .from("rti_applications")
    .update({ status: "Closed", updated_by: user.id })
    .eq("id", rtiId);
  if (error) return { error: error.message };

  await writeAudit(supabase, {
    entityType: "rti",
    entityId: rtiId,
    changedBy: user.id,
    changes: [{ field: "status", oldValue: rti.status, newValue: "Closed" }],
  });
  revalidatePath(`/rti/${rtiId}`);
  revalidatePath("/rti");
  return { success: true, id: rtiId };
}

/** Reopen a closed case → the most-advanced status implied by its documents. */
export async function reopenRtiCaseAction(rtiId: string): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }

  const supabase = await createClient();
  const { data: rti } = await supabase
    .from("rti_applications")
    .select("status")
    .eq("id", rtiId)
    .single();
  if (!rti) return { error: "RTI application not found" };

  const { data: docs } = await supabase
    .from("rti_documents")
    .select("doc_type")
    .eq("rti_id", rtiId);
  const reopened = impliedStatusFromDocTypes(new Set((docs ?? []).map((d) => d.doc_type)));

  const { error } = await supabase
    .from("rti_applications")
    .update({ status: reopened, updated_by: user.id })
    .eq("id", rtiId);
  if (error) return { error: error.message };

  await writeAudit(supabase, {
    entityType: "rti",
    entityId: rtiId,
    changedBy: user.id,
    changes: [{ field: "status", oldValue: rti.status, newValue: reopened }],
  });
  revalidatePath(`/rti/${rtiId}`);
  revalidatePath("/rti");
  return { success: true, id: rtiId };
}
