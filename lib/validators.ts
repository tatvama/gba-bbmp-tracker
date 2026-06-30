/**
 * Zod schemas shared between client and server (forms, Server Actions, import).
 */
import { z } from "zod";
import { isValidIndianPhone } from "./phone";
import {
  COMPLAINT_STATUSES,
  COMPLAINT_TYPES,
  COMPLAINT_DOCUMENT_TYPES,
  COMPLAINT_FILED_MODES,
  COMMUNICATION_TYPES,
  PUBLIC_IMPACT_LEVELS,
  CONFIDENCE_SCORES,
  DESIGNATIONS,
  FIRST_APPEAL_GROUNDS,
  PRIORITIES,
  RTI_CATEGORIES,
  RTI_FILING_MODES,
  RTI_SATISFACTION,
  RTI_STATUSES,
  SECOND_APPEAL_REASONS,
  VERIFICATION_STATUSES,
} from "./constants";

const emptyToUndef = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

// Shared optional-field helpers (used across all schemas below).
const optText = z.preprocess(emptyToUndef, z.string().trim().optional());
const optDate = z.preprocess(emptyToUndef, z.string().trim().optional());
const optUuid = z.preprocess(emptyToUndef, z.string().uuid().optional());
const optNum = z.preprocess(emptyToUndef, z.coerce.number().optional());
const optEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(emptyToUndef, z.enum(values).optional());
// BBMP/GBA job code (ddd-yy-nnnnnn). Enforced only when non-empty so drafts/imports pass.
const optJobCode = z.preprocess(
  emptyToUndef,
  z.string().trim().regex(/^\d{3}-\d{2}-\d{6}$/, "Use a job code like 225-25-001234").optional(),
);

export const phoneSchema = z
  .string()
  .trim()
  .refine(isValidIndianPhone, "Enter a valid Indian mobile (10-digit) or landline");

export const optionalPhoneSchema = z.preprocess(
  emptyToUndef,
  phoneSchema.optional(),
);

export const emailSchema = z.string().trim().email("Enter a valid email address");
export const optionalEmailSchema = z.preprocess(
  emptyToUndef,
  emailSchema.optional(),
);

export const wardNumberSchema = z
  .coerce.number({ invalid_type_error: "Ward number must be numeric" })
  .int("Ward number must be a whole number")
  .positive("Ward number must be positive");

/** Contact create/edit. `designation` and `verificationStatus` are required (spec §6). */
export const contactSchema = z.object({
  fullName: z.string().trim().min(2, "Name is required"),
  designation: z.enum(DESIGNATIONS, {
    errorMap: () => ({ message: "Select a designation" }),
  }),
  department: z.preprocess(emptyToUndef, z.string().trim().optional()),
  corporationId: z.preprocess(emptyToUndef, z.string().uuid().optional()),
  divisionId: z.preprocess(emptyToUndef, z.string().uuid().optional()),
  engSubDivisionId: z.preprocess(emptyToUndef, z.string().uuid().optional()),
  officeAddress: z.preprocess(emptyToUndef, z.string().trim().optional()),
  phone: optionalPhoneSchema,
  whatsapp: optionalPhoneSchema,
  email: optionalEmailSchema,
  officeTiming: z.preprocess(emptyToUndef, z.string().trim().optional()),
  jurisdictionNotes: z.preprocess(emptyToUndef, z.string().trim().optional()),
  latitude: z.preprocess(emptyToUndef, z.coerce.number().min(-90).max(90).optional()),
  longitude: z.preprocess(emptyToUndef, z.coerce.number().min(-180).max(180).optional()),
  source: z.preprocess(emptyToUndef, z.string().trim().optional()),
  sourcePage: z.preprocess(emptyToUndef, z.string().trim().optional()),
  verificationStatus: z.enum(VERIFICATION_STATUSES),
  confidenceScore: z.enum(CONFIDENCE_SCORES),
  publicNotes: z.preprocess(emptyToUndef, z.string().trim().optional()),
  internalNotes: z.preprocess(emptyToUndef, z.string().trim().optional()),
});
export type ContactInput = z.infer<typeof contactSchema>;

/** Ward edit — identity fields are not user-editable; these are the curatable ones. */
export const wardEditSchema = z.object({
  newName: z.string().trim().min(1, "Ward name is required"),
  propertyCount: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().nonnegative().optional(),
  ),
  zone: z.preprocess(emptyToUndef, z.string().trim().optional()),
  notes: z.preprocess(emptyToUndef, z.string().trim().optional()),
  verificationStatus: z.enum(VERIFICATION_STATUSES),
  confidenceScore: z.enum(CONFIDENCE_SCORES),
});
export type WardEditInput = z.infer<typeof wardEditSchema>;

/** Advanced complaint create/edit (Phase 3). Most fields optional; the internal
 *  case number is generated server-side and never submitted by the form. */
export const complaintSchema = z.object({
  title: z.string().trim().min(3, "Title is required"),
  type: z.enum(COMPLAINT_TYPES),
  status: z.enum(COMPLAINT_STATUSES).default("Draft"),
  priority: optEnum(PRIORITIES),
  complaintSubtype: optText,
  publicImpact: optEnum(PUBLIC_IMPACT_LEVELS),
  externalComplaintNumber: optText,
  jobNumber: optText,
  contractor: optText,
  rtiNumber: optText,
  complaintFiledMode: optEnum(COMPLAINT_FILED_MODES),
  complaintFiledTo: optText,
  complaintFiledBy: optText,
  complaintGivenDate: optDate,
  acknowledgementDate: optDate,
  expectedResolutionDate: optDate,
  corporationId: optUuid,
  divisionId: optText,
  wardId: optUuid,
  engSubDivisionId: optText,
  assignedEngineerId: optUuid,
  assignedOfficerId: optUuid,
  wardType: z.enum(["BBMP", "GBA"], { errorMap: () => ({ message: "Ward Type is required" }) }),
  responsibleDepartment: optText,
  locationText: optText,
  landmark: optText,
  latitude: z.preprocess(emptyToUndef, z.coerce.number().min(-90).max(90).optional()),
  longitude: z.preprocess(emptyToUndef, z.coerce.number().min(-180).max(180).optional()),
  description: optText,
  requestedAction: optText,
  nextFollowUpDate: optDate,
  reminderEnabled: z.coerce.boolean().default(false),
  notes: optText,
});
export type ComplaintInput = z.infer<typeof complaintSchema>;

/** Document metadata (file itself handled separately by the upload route). */
export const complaintDocumentSchema = z.object({
  documentType: optEnum(COMPLAINT_DOCUMENT_TYPES),
  title: optText,
  description: optText,
  documentDate: optDate,
  capturedDate: optDate,
  sourcePerson: optText,
  sourceDepartment: optText,
  sourceOffice: optText,
  internalNotes: optText,
});
export type ComplaintDocumentInput = z.infer<typeof complaintDocumentSchema>;

export const complaintReplySchema = z.object({
  replyDate: optDate,
  replyReceivedDate: optDate,
  repliedByName: optText,
  repliedByDesignation: optText,
  department: optText,
  replyMode: optText,
  replySummary: optText,
  replyFullText: optText,
  documentId: optUuid,
  isSatisfactory: z.coerce.boolean().optional(),
  issuesRemaining: optText,
  nextActionSuggested: optText,
});
export type ComplaintReplyInput = z.infer<typeof complaintReplySchema>;

export const complaintActionTakenSchema = z.object({
  actionTakenDate: optDate,
  actionReportedDate: optDate,
  actionTakenByName: optText,
  actionTakenByDesignation: optText,
  department: optText,
  actionSummary: optText,
  actionDetails: optText,
  workCompleted: z.coerce.boolean().optional(),
  siteVisited: z.coerce.boolean().optional(),
  photoEvidenceAvailable: z.coerce.boolean().optional(),
  documentId: optUuid,
  userSatisfaction: optText,
  pendingWork: optText,
  nextActionRequired: optText,
});
export type ComplaintActionTakenInput = z.infer<typeof complaintActionTakenSchema>;

export const communicationLogSchema = z.object({
  communicationType: z.enum(COMMUNICATION_TYPES),
  communicationDate: optDate,
  officerId: optUuid,
  contactPerson: optText,
  phoneOrEmail: optText,
  summary: optText,
  outcome: optText,
  nextAction: optText,
  nextActionDate: optDate,
  documentId: optUuid,
});
export type CommunicationLogInput = z.infer<typeof communicationLogSchema>;

/** Review-screen confirmed data applied to the complaint after OCR/AI. */
export const applyExtractionSchema = z.object({
  documentId: z.string().uuid(),
  externalComplaintNumber: optText,
  complaintGivenDate: optDate,
  replyDate: optDate,
  replySummary: optText,
  actionTakenDate: optDate,
  actionTakenSummary: optText,
  suggestedStatus: optEnum(COMPLAINT_STATUSES),
  nextFollowUpDate: optDate,
  pendingIssues: optText,
  createReply: z.coerce.boolean().default(false),
  createAction: z.coerce.boolean().default(false),
});
export type ApplyExtractionInput = z.infer<typeof applyExtractionSchema>;

// =============================================================================
// Phase 2 — RTI lifecycle
// =============================================================================

export const rtiSchema = z.object({
  subject: z.string().trim().min(3, "Subject is required"),
  infoRequested: optText,
  category: optEnum(RTI_CATEGORIES),
  status: z.enum(RTI_STATUSES).default("Draft"),
  priority: z.enum(PRIORITIES).default("Medium"),
  filingMode: optEnum(RTI_FILING_MODES),
  satisfactionStatus: optEnum(RTI_SATISFACTION),
  // applicant
  applicantName: optText,
  applicantAddress: optText,
  applicantPhone: optionalPhoneSchema,
  applicantEmail: optionalEmailSchema,
  // authority / PIO / FAA
  publicAuthority: optText,
  department: optText,
  officeAddress: optText,
  pioName: optText,
  pioDesignation: optText,
  pioPhone: optionalPhoneSchema,
  pioEmail: optionalEmailSchema,
  faaName: optText,
  faaDesignation: optText,
  faaPhone: optionalPhoneSchema,
  faaEmail: optionalEmailSchema,
  // jurisdiction
  corporationId: optUuid,
  divisionId: optText,
  engSubDivisionId: optText,
  wardId: optUuid,
  contactId: optUuid,
  wardType: z.enum(["BBMP", "GBA"], { errorMap: () => ({ message: "Ward Type is required" }) }).default("BBMP"),
  gbaWardId: optUuid,
  gbaDivision: optText,
  gbaSubdivision: optText,
  // filing details
  applicationFeePaid: z.coerce.boolean().default(false),
  feeMode: optText,
  postalReceiptNo: optText,
  onlineRegNo: optText,
  // link to a BBMP/GBA works job code (ties this RTI to the Complaint + forensic audit)
  jobNumber: optJobCode,
  // dates
  dateDrafted: optDate,
  dateFiled: optDate,
  dateReceived: optDate,
  isLifeLiberty: z.coerce.boolean().default(false),
  replyDate: optDate,
  replySummary: optText,
  // workflow
  nextAction: optText,
  nextActionDate: optDate,
  reminderEnabled: z.coerce.boolean().default(false),
  tags: optText, // comma-separated; split in the action
  internalNotes: optText,
  publicNotes: optText,
});
export type RtiInput = z.infer<typeof rtiSchema>;

export const rtiFirstAppealSchema = z.object({
  faaName: optText,
  faaDesignation: optText,
  faaPhone: optionalPhoneSchema,
  faaEmail: optionalEmailSchema,
  grounds: z.preprocess(
    (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]),
    z.array(z.enum(FIRST_APPEAL_GROUNDS)).default([]),
  ),
  groundsDetail: optText,
  dateDrafted: optDate,
  dateFiled: optDate,
  faaOrderDate: optDate,
  decisionSummary: optText,
  notes: optText,
});
export type RtiFirstAppealInput = z.infer<typeof rtiFirstAppealSchema>;

export const rtiSecondAppealSchema = z.object({
  firstAppealId: optUuid,
  commissionName: optText,
  reason: z.preprocess(
    (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]),
    z.array(z.enum(SECOND_APPEAL_REASONS)).default([]),
  ),
  reasonDetail: optText,
  filingDate: optDate,
  diaryNumber: optText,
  hearingDate: optDate,
  hearingStatus: optText,
  orderDate: optDate,
  orderSummary: optText,
  complianceDueDate: optDate,
  complianceStatus: optText,
  notes: optText,
});
export type RtiSecondAppealInput = z.infer<typeof rtiSecondAppealSchema>;

/** Row schema used by the contact importer (XLSX/CSV). All-string-tolerant. */
export const contactImportRowSchema = z.object({
  fullName: z.string().trim().min(2, "Name is required"),
  designation: z.string().trim().min(2, "Designation is required"),
  phone: optionalPhoneSchema,
  email: optionalEmailSchema,
  engSubDivision: z.preprocess(emptyToUndef, z.string().trim().optional()),
  division: z.preprocess(emptyToUndef, z.string().trim().optional()),
  corporation: z.preprocess(emptyToUndef, z.string().trim().optional()),
  officeAddress: z.preprocess(emptyToUndef, z.string().trim().optional()),
  source: z.preprocess(emptyToUndef, z.string().trim().optional()),
});
export type ContactImportRow = z.infer<typeof contactImportRowSchema>;

// Officer transfer (TransferHistory) ----------------------------------------
export const officerTransferSchema = z.object({
  prevCorporation: optText,
  prevDivision: optText,
  prevSubdivision: optText,
  prevWard: optText,
  newCorporation: optText,
  newDivision: optText,
  newSubdivision: optText,
  newWard: optText,
  transferOrderNo: optText,
  transferOrderDate: optDate,
  effectiveDate: optDate,
  sourceDocument: optText,
  notes: optText,
});
