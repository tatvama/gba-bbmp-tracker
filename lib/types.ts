/**
 * Database row types (snake_case, matching the Supabase/Postgres columns).
 * Hand-maintained to mirror `supabase/migrations/0001_init.sql`.
 */
import type {
  ComplaintStatus,
  ComplaintType,
  ConfidenceScore,
  Designation,
  Priority,
  RtiCategory,
  RtiFilingMode,
  RtiSatisfaction,
  RtiStatus,
  UserRole,
  VerificationStatus,
} from "./constants";

export interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Corporation {
  id: string;
  code: string;
  name: string;
  name_kn: string | null;
  ward_count: number;
  division_count: number;
  subdivision_count: number;
  assembly_constituencies: string[];
  annexure: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
  created_at: string;
}

export interface Division {
  id: string;
  name: string;
  corporation_id: string | null; // AC-derived; nullable + flagged
  corporation_derived: boolean;
  address: string | null;
  notes: string | null;
  created_at: string;
}

export interface EngSubDivision {
  id: string;
  name: string;
  sl_no: number | null;
  division_id: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

export interface Ward {
  id: string;
  new_no: number;
  new_name: string;
  property_count: number | null;
  zone: string | null;
  assembly_constituency: string | null;
  old_subdiv: string | null;
  old_wards: string[];
  division_id: string | null;
  eng_subdivision_id: string | null;
  derived_corporation_id: string | null; // AC-derived; always labelled "derived"
  derived_normalised: boolean; // true when AC string was combined (e.g. "176 & 177")
  source: string | null;
  source_page: string | null;
  verification_status: VerificationStatus;
  confidence_score: ConfidenceScore;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  full_name: string;
  designation: Designation;
  department: string | null;
  corporation_id: string | null;
  division_id: string | null;
  eng_subdivision_id: string | null;
  office_address: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  office_timing: string | null;
  jurisdiction_notes: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string | null;
  source_page: string | null;
  verification_status: VerificationStatus;
  last_verified_date: string | null;
  confidence_score: ConfidenceScore;
  public_notes: string | null;
  internal_notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  // Phase 2 — officer accountability (added in 0003_phase2.sql)
  role_level: string | null;
  reporting_officer_id: string | null;
  charge_type: string | null;
  current_posting_start: string | null;
  current_posting_end: string | null;
  transfer_status: string | null;
  public_visible: boolean;
}

export interface Complaint {
  id: string;
  title: string;
  type: ComplaintType;
  ward_id: string | null;
  eng_subdivision_id: string | null;
  contact_id: string | null;
  complaint_number: string | null;
  job_number: string | null;
  rti_number: string | null;
  date_submitted: string | null;
  due_date: string | null;
  status: ComplaintStatus;
  notes: string | null;
  next_action_date: string | null;
  reminder_flag: boolean;
  attachment: string | null;
  created_at: string;
  updated_at: string;
  // Phase 2 (0003) columns
  internal_ref: string | null;
  description: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  landmark: string | null;
  complaint_mode: string | null;
  complaint_filed_to: string | null;
  responsible_department: string | null;
  priority: Priority | null;
  public_impact: string | null;
  escalation_level: string | null;
  acknowledgment_date: string | null;
  expected_resolution_date: string | null;
  resolution_summary: string | null;
  citizen_satisfaction: string | null;
  created_by: string | null;
  updated_by: string | null;
  // Phase 3 (0004) columns
  internal_case_number: string | null;
  complaint_subtype: string | null;
  complaint_filed_by: string | null;
  requested_action: string | null;
  corporation_id: string | null;
  division_id: string | null;
  assigned_engineer_id: string | null;
  assigned_officer_id: string | null;
  latest_reply_summary: string | null;
  latest_reply_date: string | null;
  latest_action_taken_summary: string | null;
  latest_action_taken_date: string | null;
  next_follow_up_date: string | null;
  closure_date: string | null;
  closure_summary: string | null;
  deleted_at: string | null;
}

export interface ComplaintWithRelations extends Complaint {
  ward?: Pick<Ward, "id" | "new_no" | "new_name"> | null;
  division?: Pick<Division, "id" | "name"> | null;
  corporation?: Pick<Corporation, "id" | "code" | "name"> | null;
  eng_subdivision?: Pick<EngSubDivision, "id" | "name"> | null;
  assigned_engineer?: Pick<Contact, "id" | "full_name" | "designation" | "phone" | "whatsapp" | "email"> | null;
  assigned_officer?: Pick<Contact, "id" | "full_name" | "designation"> | null;
}

export interface ComplaintDocument {
  id: string;
  complaint_id: string;
  document_type: string | null;
  title: string | null;
  description: string | null;
  original_file_name: string | null;
  storage_bucket: string;
  storage_path: string;
  processed_storage_path: string | null;
  thumbnail_storage_path: string | null;
  public_url: string | null;
  private_url: string | null;
  mime_type: string | null;
  file_size: number | null;
  page_count: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
  captured_date: string | null;
  document_date: string | null;
  source_person: string | null;
  source_department: string | null;
  source_office: string | null;
  ocr_status: string;
  ocr_raw_text: string | null;
  ocr_clean_text: string | null;
  ocr_confidence: number | null;
  ocr_language: string | null;
  ai_summary: string | null;
  ai_extracted_json: ComplaintExtraction | null;
  ai_suggested_status: string | null;
  ai_suggested_next_action: string | null;
  ai_suggested_follow_up_date: string | null;
  ai_confidence: string | null;
  verification_status: string;
  verified_by: string | null;
  verified_at: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
  // Duplicate-photo detection (0005)
  file_sha256: string | null;
  phash: string | null;
  dhash: string | null;
  exif_gps_lat: number | null;
  exif_gps_lon: number | null;
  exif_taken_at: string | null;
  photo_stage: string | null;
  is_duplicate: boolean;
  dup_severity: string | null;
  dup_matches: unknown;
  dup_checked_at: string | null;
}

/** Structured AI extraction stored in complaint_documents.ai_extracted_json. */
export interface ComplaintExtraction {
  documentType?: string;
  summary?: string;
  importantDates?: string[];
  complaintNumber?: string;
  replyDate?: string;
  actionTakenDate?: string;
  officerNames?: string[];
  departmentNames?: string[];
  workDescription?: string;
  replyGiven?: string;
  actionTaken?: string;
  pendingIssues?: string[];
  suggestedComplaintStatus?: string;
  suggestedNextAction?: string;
  suggestedFollowUpDate?: string;
  recommendedEscalation?: string;
  confidence?: "High" | "Medium" | "Low";
  needsManualReview?: boolean;
}

export interface ComplaintTimelineEntry {
  id: string;
  complaint_id: string;
  event_type: string;
  event_date: string;
  title: string | null;
  summary: string | null;
  related_document_id: string | null;
  related_officer_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ComplaintReply {
  id: string;
  complaint_id: string;
  reply_date: string | null;
  reply_received_date: string | null;
  replied_by_name: string | null;
  replied_by_designation: string | null;
  department: string | null;
  reply_mode: string | null;
  reply_summary: string | null;
  reply_full_text: string | null;
  document_id: string | null;
  is_satisfactory: boolean | null;
  issues_remaining: string | null;
  next_action_suggested: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplaintActionTaken {
  id: string;
  complaint_id: string;
  action_taken_date: string | null;
  action_reported_date: string | null;
  action_taken_by_name: string | null;
  action_taken_by_designation: string | null;
  department: string | null;
  action_summary: string | null;
  action_details: string | null;
  work_completed: boolean | null;
  site_visited: boolean | null;
  photo_evidence_available: boolean | null;
  document_id: string | null;
  user_satisfaction: string | null;
  pending_work: string | null;
  next_action_required: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OcrJob {
  id: string;
  document_id: string;
  status: string;
  attempts: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceDocument {
  id: string;
  title: string;
  file_name: string | null;
  document_type: string | null;
  date: string | null;
  url: string | null;
  notes: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_at: string;
}

export interface ImportLog {
  id: string;
  file_name: string;
  sheet_name: string | null;
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  error_rows: number;
  dry_run: boolean;
  imported_by: string | null;
  created_at: string;
}

/** Ward joined with its related names (used in tables/detail pages). */
export interface WardWithRelations extends Ward {
  division?: Pick<Division, "id" | "name"> | null;
  eng_subdivision?: Pick<EngSubDivision, "id" | "name" | "sl_no"> | null;
  derived_corporation?: Pick<Corporation, "id" | "code" | "name"> | null;
}

export interface ContactWithRelations extends Contact {
  corporation?: Pick<Corporation, "id" | "code" | "name"> | null;
  division?: Pick<Division, "id" | "name"> | null;
  eng_subdivision?: Pick<EngSubDivision, "id" | "name"> | null;
}

// =============================================================================
// Phase 2 — RTI lifecycle
// =============================================================================

export interface RtiApplication {
  id: string;
  internal_ref: string | null;
  applicant_name: string | null;
  applicant_address: string | null;
  applicant_phone: string | null;
  applicant_email: string | null;
  public_authority: string | null;
  department: string | null;
  office_address: string | null;
  pio_name: string | null;
  pio_designation: string | null;
  pio_phone: string | null;
  pio_email: string | null;
  faa_name: string | null;
  faa_designation: string | null;
  faa_phone: string | null;
  faa_email: string | null;
  corporation_id: string | null;
  division_id: string | null;
  eng_subdivision_id: string | null;
  ward_id: string | null;
  contact_id: string | null;
  subject: string;
  info_requested: string | null;
  category: RtiCategory | null;
  filing_mode: RtiFilingMode | null;
  application_fee_paid: boolean;
  fee_mode: string | null;
  postal_receipt_no: string | null;
  online_reg_no: string | null;
  date_drafted: string | null;
  date_filed: string | null;
  date_received: string | null;
  is_life_liberty: boolean;
  normal_due: string | null;
  life_liberty_due: string | null;
  first_appeal_due: string | null;
  second_appeal_due: string | null;
  status: RtiStatus;
  reply_summary: string | null;
  reply_date: string | null;
  reply_attachment: string | null;
  satisfaction_status: RtiSatisfaction | null;
  next_action: string | null;
  next_action_date: string | null;
  reminder_enabled: boolean;
  priority: Priority;
  tags: string[];
  internal_notes: string | null;
  public_notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RtiWithRelations extends RtiApplication {
  corporation?: Pick<Corporation, "id" | "code" | "name"> | null;
  division?: Pick<Division, "id" | "name"> | null;
  eng_subdivision?: Pick<EngSubDivision, "id" | "name"> | null;
  ward?: Pick<Ward, "id" | "new_no" | "new_name"> | null;
  contact?: Pick<Contact, "id" | "full_name" | "designation"> | null;
}

export interface RtiFirstAppeal {
  id: string;
  rti_id: string;
  faa_name: string | null;
  faa_designation: string | null;
  faa_phone: string | null;
  faa_email: string | null;
  grounds: string[];
  grounds_detail: string | null;
  date_drafted: string | null;
  date_filed: string | null;
  faa_order_due: string | null;
  faa_order_date: string | null;
  decision_summary: string | null;
  status: string;
  attachments: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RtiSecondAppeal {
  id: string;
  rti_id: string;
  first_appeal_id: string | null;
  commission_name: string | null;
  reason: string[];
  reason_detail: string | null;
  filing_date: string | null;
  diary_number: string | null;
  hearing_date: string | null;
  hearing_status: string | null;
  order_date: string | null;
  order_summary: string | null;
  compliance_due_date: string | null;
  compliance_status: string | null;
  status: string;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  entity_type: "rti" | "complaint" | "officer" | "appeal" | "hearing" | "general";
  entity_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  priority: Priority;
  status: "Pending" | "Snoozed" | "Completed" | "Cancelled";
  repeat: "None" | "Daily" | "Weekly" | "Monthly" | "Custom";
  channels: string[];
  assigned_to: string | null;
  reminder_type: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommunicationLog {
  id: string;
  entity_type: string;
  entity_id: string;
  comm_type: string;
  occurred_at: string;
  contact_person: string | null;
  summary: string | null;
  outcome: string | null;
  next_action: string | null;
  attachment: string | null;
  created_by: string | null;
  created_at: string;
  // Phase 3 additions
  officer_id: string | null;
  phone_or_email: string | null;
  next_action_date: string | null;
  document_id: string | null;
}

export interface Template {
  id: string;
  title: string;
  kind: string | null;
  category: string | null;
  department: string | null;
  legal_tone: string | null;
  language: string | null;
  body: string | null;
  default_questions: string[];
  variables: { name: string; label?: string }[];
  version: number;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiDraft {
  id: string;
  entity_type: string | null;
  entity_id: string | null;
  kind: string;
  provider: string | null;
  model: string | null;
  language: string | null;
  prompt: string | null;
  content: string | null;
  created_by: string | null;
  created_at: string;
}

export interface OfficerTransfer {
  id: string;
  officer_id: string;
  prev_corporation: string | null;
  prev_division: string | null;
  prev_subdivision: string | null;
  prev_ward: string | null;
  new_corporation: string | null;
  new_division: string | null;
  new_subdivision: string | null;
  new_ward: string | null;
  transfer_order_no: string | null;
  transfer_order_date: string | null;
  effective_date: string | null;
  source_document: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}
