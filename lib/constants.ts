/**
 * Domain constants shared across the app, scripts, and tests.
 * Kept framework-free so they can be imported anywhere (server, client, node scripts).
 */

export const CORPORATION_CODES = [
  "KENDRA",
  "PURVA",
  "PASHCHIMA",
  "UTTARA",
  "DAKSHINA",
] as const;
export type CorporationCode = (typeof CORPORATION_CODES)[number];

/** Per-corporation accent tint (from the reference design). */
export const CORP_TINT: Record<string, string> = {
  KENDRA: "#1F7A6E",
  PURVA: "#3A6EA5",
  PASHCHIMA: "#B5701A",
  UTTARA: "#7A5BA8",
  DAKSHINA: "#C04A4A",
};

/** Corporation code → display name. */
export const CORP_NAME: Record<string, string> = {
  KENDRA: "Bengaluru Central",
  PURVA: "Bengaluru East",
  PASHCHIMA: "Bengaluru West",
  UTTARA: "Bengaluru North",
  DAKSHINA: "Bengaluru South",
};

export const VERIFICATION_STATUSES = [
  "VERIFIED",
  "PENDING",
  "NEEDS_CORRECTION",
  "RETIRED_TRANSFERRED",
  "UNKNOWN",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  VERIFIED: "Verified",
  PENDING: "Pending",
  NEEDS_CORRECTION: "Needs correction",
  RETIRED_TRANSFERRED: "Retired / transferred",
  UNKNOWN: "Unknown",
};

export const CONFIDENCE_SCORES = ["HIGH", "MEDIUM", "LOW"] as const;
export type ConfidenceScore = (typeof CONFIDENCE_SCORES)[number];

export const DESIGNATIONS = [
  "Chief Engineer",
  "Superintending Engineer",
  "Executive Engineer",
  "Assistant Executive Engineer",
  "Assistant Engineer",
  "Junior Engineer",
  "Health Officer",
  "Revenue Officer",
  "Ward Engineer",
  "Contractor",
  "Office Staff",
] as const;
export type Designation = (typeof DESIGNATIONS)[number];

export const USER_ROLES = [
  "ADMIN",
  "EDITOR",
  "VERIFIER",
  "VIEWER",
  "RTI_MANAGER",
  "COMPLAINT_MANAGER",
  "FIELD_OFFICER",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: "Super Admin",
  EDITOR: "Admin / Editor",
  VERIFIER: "Verifier",
  VIEWER: "Viewer",
  RTI_MANAGER: "RTI Manager",
  COMPLAINT_MANAGER: "Complaint Manager",
  FIELD_OFFICER: "Field Officer",
};

export const COMPLAINT_TYPES = [
  "Road",
  "Drain",
  "Garbage",
  "Streetlight",
  "Footpath",
  "Park",
  "Water Logging",
  "Encroachment",
  "Building Violation",
  "Public Works",
  "Bill Payment",
  "Tender Irregularity",
  "Contractor Issue",
  "Health Issue",
  "Revenue Issue",
  "Engineer Non Response",
  "Ward Office Issue",
  "Other",
] as const;
export type ComplaintType = (typeof COMPLAINT_TYPES)[number];

export const COMPLAINT_STATUSES = [
  "Draft",
  "Filed",
  "Acknowledged",
  "Under Review",
  "Assigned To Engineer",
  "Site Visit Pending",
  "Site Visit Done",
  "Work In Progress",
  "Reply Received",
  "Action Taken Report Received",
  "Partially Resolved",
  "Resolved",
  "Reopened",
  "Escalated",
  "Converted To RTI",
  "Closed",
  "No Response",
  "Overdue",
] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

/** Statuses that count as "open" (not terminal) for dashboards/overdue logic. */
export const COMPLAINT_OPEN_STATUSES: ComplaintStatus[] = [
  "Draft", "Filed", "Acknowledged", "Under Review", "Assigned To Engineer",
  "Site Visit Pending", "Site Visit Done", "Work In Progress", "Reply Received",
  "Action Taken Report Received", "Partially Resolved", "Reopened", "Escalated",
  "No Response", "Overdue",
];

export const COMPLAINT_FILED_MODES = [
  "Online portal", "Phone", "WhatsApp", "Email", "Written letter", "In-person",
] as const;
export type ComplaintFiledMode = (typeof COMPLAINT_FILED_MODES)[number];

export const PUBLIC_IMPACT_LEVELS = [
  "Individual", "Street", "Ward", "Division", "Public Safety",
] as const;
export type PublicImpactLevel = (typeof PUBLIC_IMPACT_LEVELS)[number];

/** Which roles may perform write operations on civic records. */
export const WRITE_ROLES: UserRole[] = ["ADMIN", "EDITOR"];
/** Roles allowed to change verification status. */
export const VERIFY_ROLES: UserRole[] = ["ADMIN", "EDITOR", "VERIFIER"];

// =============================================================================
// Phase 2 — RTI lifecycle
// =============================================================================

/** Roles permitted to create/edit RTIs, appeals, and RTI reminders. */
export const RTI_WRITE_ROLES: UserRole[] = ["ADMIN", "EDITOR", "RTI_MANAGER"];
/** Roles permitted to create/edit complaints + escalations. */
export const COMPLAINT_WRITE_ROLES: UserRole[] = ["ADMIN", "EDITOR", "COMPLAINT_MANAGER"];

export const PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const RTI_CATEGORIES = [
  "Public works",
  "Road work",
  "Drain work",
  "Garbage",
  "Streetlight",
  "Building plan",
  "Bill payment",
  "Contractor details",
  "MB Book",
  "Work order",
  "Tender",
  "Estimate",
  "Measurement",
  "Quality control",
  "Ward committee",
  "Public health",
  "Revenue",
  "Other",
] as const;
export type RtiCategory = (typeof RTI_CATEGORIES)[number];

export const RTI_FILING_MODES = [
  "Online",
  "Physical",
  "Speed Post",
  "Registered Post",
  "Email",
  "Hand submission",
] as const;
export type RtiFilingMode = (typeof RTI_FILING_MODES)[number];

export const RTI_STATUSES = [
  "Draft",
  "Ready to File",
  "Filed",
  "Awaiting Reply",
  "Reply Received",
  "Partial Reply",
  "Rejected",
  "No Reply",
  "First Appeal Drafted",
  "First Appeal Filed",
  "FAA Order Received",
  "Second Appeal Drafted",
  "Second Appeal Filed",
  "Complaint Filed",
  "Closed",
] as const;
export type RtiStatus = (typeof RTI_STATUSES)[number];

export const RTI_SATISFACTION = [
  "Satisfied",
  "Partially Satisfied",
  "Unsatisfied",
  "False Information",
  "Incomplete Information",
  "No Information",
] as const;
export type RtiSatisfaction = (typeof RTI_SATISFACTION)[number];

/** Grounds available when drafting a first appeal (spec §4). */
export const FIRST_APPEAL_GROUNDS = [
  "No reply within time",
  "Incomplete information",
  "Misleading information",
  "False information",
  "Wrong denial",
  "Excessive fee",
  "Information transferred incorrectly",
  "No PIO details",
  "No FAA details",
] as const;
export type FirstAppealGround = (typeof FIRST_APPEAL_GROUNDS)[number];

/** Reasons available when drafting a second appeal / complaint (spec §5). */
export const SECOND_APPEAL_REASONS = [
  "No FAA order",
  "Unsatisfactory FAA order",
  "Continued denial",
  "Incomplete information",
  "Penalty request",
  "Compensation request",
  "Direction to disclose information",
] as const;
export type SecondAppealReason = (typeof SECOND_APPEAL_REASONS)[number];

/** Legal tone + language options shared by AI drafting and templates. */
export const LEGAL_TONES = ["Simple", "Strong", "Formal", "Investigative"] as const;
export type LegalTone = (typeof LEGAL_TONES)[number];

export const DRAFT_LANGUAGES = ["English", "Kannada", "Bilingual"] as const;
export type DraftLanguage = (typeof DRAFT_LANGUAGES)[number];

/** Officer role levels for the hierarchy view (spec §8). */
export const ROLE_LEVELS = [
  "CE",
  "SE",
  "EE",
  "AEE",
  "AE",
  "JE",
  "Health Officer",
  "Revenue Officer",
  "Commissioner",
  "Special Commissioner",
  "Other",
] as const;
export type RoleLevel = (typeof ROLE_LEVELS)[number];

/** Deadline-countdown buckets used by the badge + filters. */
export const DEADLINE_BUCKETS = [
  "due-10plus",
  "due-soon",
  "due-today",
  "overdue",
  "critical-overdue",
] as const;
export type DeadlineBucket = (typeof DEADLINE_BUCKETS)[number];

/** Default RTI deadline rules. Mirrors the app_settings 'rti_deadline_rules' row;
 *  used as the fallback when the DB row is absent. All values are configurable. */
export interface DeadlineRules {
  normalDays: number;
  lifeLibertyHours: number;
  firstAppealDays: number;
  secondAppealDays: number;
  faaDisposalDays: number;
  faaDisposalMaxDays: number;
  dueSoonDays: number;
  criticalOverdueDays: number;
}

export const DEFAULT_DEADLINE_RULES: DeadlineRules = {
  normalDays: 30,
  lifeLibertyHours: 48,
  firstAppealDays: 30,
  secondAppealDays: 90,
  faaDisposalDays: 30,
  faaDisposalMaxDays: 45,
  dueSoonDays: 10,
  criticalOverdueDays: 7,
};

/** Duplicate-photo detection thresholds (Hamming distance on 64-bit hashes). */
export interface PhotoDedupeRules {
  phashMax: number;   // max pHash Hamming for a perceptual match
  dhashMax: number;   // max dHash Hamming for a perceptual match
  strictMax: number;  // both under this => High severity
  gpsEpsilon: number; // degrees tolerance for "same GPS"
}
export const DEFAULT_PHOTO_DEDUPE_RULES: PhotoDedupeRules = {
  phashMax: 10,
  dhashMax: 10,
  strictMax: 6,
  gpsEpsilon: 0.0002,
};

/** Forensics thresholds (photo geofence, etc.). */
export interface ForensicsRules {
  geofenceMaxMeters: number; // photo GPS beyond this from the reported location => flag
}
export const DEFAULT_FORENSICS_RULES: ForensicsRules = {
  geofenceMaxMeters: 300,
};

// =============================================================================
// Phase 3 — Advanced Complaint Management (documents, OCR, AI)
// =============================================================================

/** Roles that may upload complaint documents + add field notes. */
export const COMPLAINT_FIELD_ROLES: UserRole[] = [
  "ADMIN", "EDITOR", "COMPLAINT_MANAGER", "FIELD_OFFICER",
];
/** Roles that may verify OCR/AI extracted data + apply it to the complaint. */
export const COMPLAINT_VERIFY_ROLES: UserRole[] = [
  "ADMIN", "EDITOR", "COMPLAINT_MANAGER", "VERIFIER",
];

export const CASE_NUMBER_PREFIXES = ["DM-CMP", "GBA-CMP", "BBMP-CMP", "CUSTOM"] as const;
export type CaseNumberPrefix = (typeof CASE_NUMBER_PREFIXES)[number];

export const COMPLAINT_DOCUMENT_TYPES = [
  "Original complaint copy",
  "Complaint acknowledgement",
  "Department reply",
  "Engineer reply",
  "Action Taken Report",
  "Site inspection note",
  "Postal receipt",
  "Email printout",
  "WhatsApp screenshot",
  "Portal screenshot",
  "Work order copy",
  "Estimate copy",
  "Bill copy",
  "MB Book copy",
  "RTI related document",
  "Appeal related document",
  "Site photo before work",
  "Site photo after work",
  // Forensic / tender / financial document types (job-audit module)
  "Tender notice",
  "Technical bid",
  "Financial bid",
  "Contractor registration certificate",
  "Insurance policy",
  "KW-4 agreement",
  "Technical Sanction",
  "Schedule B",
  "Modified Schedule B",
  "Royalty challan",
  "Trip sheet / weighbridge",
  "Quality test report",
  "Geo-tagged site photo",
  "Completion certificate",
  "Defect liability / handover",
  "C&D waste / dumping-yard / salvage register",
  "Other evidence",
] as const;
export type ComplaintDocumentType = (typeof COMPLAINT_DOCUMENT_TYPES)[number];

/** Document types that carry an OFFICIAL reply (apply → latest reply). */
export const REPLY_DOCUMENT_TYPES: string[] = ["Department reply", "Engineer reply"];
/** Document types that report ACTION taken (apply → latest action). */
export const ACTION_DOCUMENT_TYPES: string[] = ["Action Taken Report", "Site inspection note"];

export const OCR_STATUSES = [
  "Not Started", "Queued", "Processing", "Completed", "Failed",
  "Needs Manual Review", "Skipped",
] as const;
export type OcrStatus = (typeof OCR_STATUSES)[number];

export const DOC_VERIFICATION_STATUSES = [
  "Pending Review", "Verified", "Needs Correction", "Rejected", "Duplicate", "Low Confidence",
] as const;
export type DocVerificationStatus = (typeof DOC_VERIFICATION_STATUSES)[number];

export const COMMUNICATION_TYPES = [
  "Phone Call", "WhatsApp", "Email", "Letter", "In Person",
  "Portal Update", "Site Visit", "Hearing", "Other",
] as const;
export type CommunicationType = (typeof COMMUNICATION_TYPES)[number];

export const TIMELINE_EVENT_TYPES = [
  "Created", "Filed", "Acknowledged", "Reply Received", "Action Taken",
  "Site Visit", "Photo Evidence", "Follow-up", "Escalation", "Reminder",
  "Status Change", "Closure", "Reopened", "Note",
] as const;
export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export const COMPLAINT_REMINDER_TYPES = [
  "Follow-up with engineer",
  "Follow-up with ward office",
  "Escalate to AEE",
  "Escalate to EE",
  "Escalate to SE",
  "Escalate to CE",
  "File RTI",
  "Upload reply",
  "Verify site action",
  "Close complaint review",
] as const;
export type ComplaintReminderType = (typeof COMPLAINT_REMINDER_TYPES)[number];

/** Allowed upload MIME types for complaint documents. */
export const ALLOWED_UPLOAD_MIME = [
  "image/jpeg", "image/png", "image/webp", "application/pdf",
] as const;

/** Supabase Storage buckets (all private). */
export const STORAGE_BUCKETS = {
  documents: "complaint-documents",
  evidence: "complaint-evidence",
  processed: "complaint-processed-images",
  exports: "complaint-exports",
} as const;

/** Default complaint module settings (mirrors app_settings 'complaint_settings'). */
export interface ComplaintSettings {
  caseNumberPrefix: string;
  startingSequence: number;
  followUpDaysAfterFiling: number;
  followUpDaysAfterReply: number;
  siteVerificationDaysAfterAction: number;
  ocrLanguage: string;
  ocrAutoRun: boolean;
  aiAutoSummary: boolean;
  maxUploadMb: number;
  documentsPrivateByDefault: boolean;
}

/** AI draft kinds available from the complaint detail page. */
export const COMPLAINT_DRAFT_KINDS = {
  followup_letter: "Follow-up letter",
  whatsapp: "WhatsApp message to officer",
  escalation_letter: "Escalation letter",
  reminder_email: "Reminder email",
  rti_from_complaint: "RTI based on this complaint",
  action_taken_request: "Action Taken Report request",
  site_inspection_request: "Site inspection request",
} as const;
export type ComplaintDraftKind = keyof typeof COMPLAINT_DRAFT_KINDS;

export const DEFAULT_COMPLAINT_SETTINGS: ComplaintSettings = {
  caseNumberPrefix: "DM-CMP",
  startingSequence: 1,
  followUpDaysAfterFiling: 7,
  followUpDaysAfterReply: 3,
  siteVerificationDaysAfterAction: 2,
  ocrLanguage: "eng+kan",
  ocrAutoRun: true,
  aiAutoSummary: true,
  maxUploadMb: 15,
  documentsPrivateByDefault: true,
};

// =============================================================================
// Phase 4 — Forensic job-audit + letter constants (verified build spec)
// Sources cross-verified via web research; values that VARY per tender are read
// from the document (graded C/D), never hardcoded — see comments.
// =============================================================================

/** Risk scorer (additive SEV + EVD + add-ons, clamped 0–100). */
export const RISK_SEV = { Low: 10, Medium: 25, High: 45, critical: 60 } as const;
export const RISK_EVD = { weak: 5, moderate: 15, strong: 25, documentary: 35 } as const;
export const RISK_ADDONS = { missing_proof: 10, chronology_issue: 10, possible_forgery_redflag: 15 } as const;
export const RISK_VALUE_IMPACT = { high: 20, medium: 12, low: 5 } as const;
/** 4 bands (NO "vigilance"). Evaluated high→low. */
export const RISK_BANDS = [
  { min: 76, band: "bill_stop", label: "high priority bill stop matter" },
  { min: 51, band: "serious", label: "serious audit doubt" },
  { min: 26, band: "procedural", label: "procedural irregularity or moderate red flag" },
  { min: 0, band: "low", label: "low documentary doubt" },
] as const;

export const EVIDENCE_GRADES = {
  A: "Direct documentary fact",
  B: "Calculated from supplied records",
  C: "Missing mandatory record inference",
  D: "Requires original verification",
  E: "Requires field inspection / technical test",
} as const;

// ── Statutory deductions (s.194C etc.) ──
/** IT-TDS %: 1% for individual/HUF, 2% for others — payee type READ from bill/agreement. */
export const IT_TDS_PCT = { individual: 1, huf: 1, company: 2, firm: 2, other: 2 } as const;
export const GST_TDS_PCT = 2; // 1% CGST + 1% SGST
export const GST_TDS_MIN_CONTRACT = 250_000; // GST-TDS applies only above ₹2.5L
export const BOCW_CESS_PCT = 1; // labour-welfare cess band 1–2%; flag + verify base (excl. GST)

// ── GST on works contracts (date-sensitive — branch in lib/forensics/gst.ts) ──
export const GST_2_0_DATE = "2025-09-22";
export const GST_WC_CURRENT = 18; // on/after cutover
export const GST_WC_PRE = 12; // before cutover, general
export const GST_WC_EARTHWORK_PRE = 5; // before cutover, earthwork share > 75%

// ── 125% quantity rule — TWO DISTINCT numbers ──
export const QTY_PER_ITEM_QUOTED_CAP_PCT = 125; // ≤125% at quoted rate; excess priced at SoR (READ)
export const CONTRACT_OVERALL_CAP = { aboveTenCrPct: 5, atOrBelowTenCrPct: 10, thresholdInr: 100_000_000 };

// ── KTPP s.4 thresholds (2000 figures — flag + verify amendment before filing) ──
export const KTPP_S4_THRESHOLDS = { govtDept: 500_000, localBody: 200_000, other: 100_000 };

// ── RTI Act 2005 timelines ──
export const RTI_DAYS = {
  reply: 30, lifeLiberty_hours: 48, apio_extra: 5,
  firstAppeal: 30, faaDispose: 30, faaDisposeMax: 45, secondAppeal: 90,
  penaltyPerDay: 250, penaltyMax: 25_000,
} as const;

/** KW contractor class rank, lowest→highest. */
export const KW_CLASS_RANK = ["V", "IV", "III", "II", "I"] as const;

// ── Letter signatories (NEVER sign as Guruji / Sri Sai Samsthana Trust) ──
export const LETTER_SIGNATORIES = {
  raghav_gowda: { name: "K.G. Raghav Gowda", address: "No. 7, Bheru Mansion, 7/7, 2nd Floor, Gandhi Bazar Main, Basavanagudi, Bengaluru 560004", mobile: "9555800064", fileTag: "Raghav_Gowda" },
  sharath_babu: { name: "K.N. Sharath Babu", address: "Chief Editor, Sathyadhari Kannada Masa Patrike, Reg. KARKAN/2014/552277", mobile: null, fileTag: "Sharath_Babu" },
  sai_raghav: { name: "Sri Sai Raghav", address: "No. 141, Sri Sai Residency, JP Nagar 7th Phase, Bengaluru", mobile: "09092028055", fileTag: "Sai_Raghav" },
} as const;
export type SignatoryKey = keyof typeof LETTER_SIGNATORIES;

export const LETTER_VARIANTS = ["bill_stop", "lokayukta", "rti", "bilingual_summary"] as const;
export type LetterVariant = (typeof LETTER_VARIANTS)[number];
export const LETTER_DRAFT_KINDS: Record<LetterVariant, string> = {
  bill_stop: "Kannada bill-stop notice",
  lokayukta: "Lokayukta complaint",
  rti: "RTI application (from findings)",
  bilingual_summary: "Bilingual forensic summary",
};

// =============================================================================
// Audit & Draft wizard — recipient escalation chain + draft kinds (180-Q spec)
// =============================================================================

/** Officer escalation / copy chain for forensic letters (PDF output spec). */
export const ESCALATION_CHAIN = ["AE", "AEE", "EE", "CE", "Commissioner", "Lokayukta", "ACB"] as const;
export type EscalationLevel = (typeof ESCALATION_CHAIN)[number];

export const ESCALATION_LABEL: Record<EscalationLevel, string> = {
  AE: "Assistant Engineer (AE)",
  AEE: "Assistant Executive Engineer (AEE)",
  EE: "Executive Engineer (EE)",
  CE: "Chief Engineer (CE)",
  Commissioner: "Commissioner, GBA / BBMP",
  Lokayukta: "Karnataka Lokayukta",
  ACB: "Anti-Corruption Bureau (ACB)",
};

/**
 * Fixed institutional recipients (no DB officer row). Kannada strings mirror the
 * blocks used in lib/letters/letter-skeleton.ts so letters stay consistent.
 */
export const INSTITUTIONAL_RECIPIENTS: Record<
  "Lokayukta" | "ACB",
  { name: string; office: string; nameKn: string; officeKn: string }
> = {
  Lokayukta: {
    name: "Hon'ble Lokayukta / Upa-Lokayukta",
    office: "Karnataka Lokayukta, Bengaluru",
    nameKn: "ಮಾನ್ಯ ಲೋಕಾಯುಕ್ತರು / ಉಪ ಲೋಕಾಯುಕ್ತರು",
    officeKn: "ಕರ್ನಾಟಕ ಲೋಕಾಯುಕ್ತ, ಬೆಂಗಳೂರು",
  },
  ACB: {
    name: "The Director General of Police",
    office: "Anti-Corruption Bureau, Karnataka, Bengaluru",
    nameKn: "ಪೊಲೀಸ್ ಮಹಾನಿರ್ದೇಶಕರು",
    officeKn: "ಭ್ರಷ್ಟಾಚಾರ ನಿಗ್ರಹ ದಳ (ACB), ಕರ್ನಾಟಕ, ಬೆಂಗಳೂರು",
  },
};

/** AI draft kinds produced by the Audit & Draft wizard (persisted via saveAiDraft). */
export const AUDIT_DRAFT_KINDS = {
  road_work_audit_rti: "Road-work audit RTI",
  road_work_audit_complaint: "Road-work audit complaint",
} as const;
export type AuditDraftKind = keyof typeof AUDIT_DRAFT_KINDS;
