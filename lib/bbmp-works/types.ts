/**
 * BBMP work-registry search: shared types (client + server).
 * Kept framework-free like lib/constants.ts so it can be imported anywhere.
 */

export const WORK_VERIFICATION_STATUSES = [
  "Verified",
  "Partially Verified",
  "Unverified",
  "Conflicting Information",
] as const;
export type WorkVerificationStatus = (typeof WORK_VERIFICATION_STATUSES)[number];

export interface SourceDetails {
  id: string;
  sourceId: string; // SourceId from lib/sources/types.ts
  sourceName: string;
  sourceUrl: string | null;
  documentName: string | null;
  referenceNumber: string | null;
  pageNumber: number | null;
  accessedDate: string; // YYYY-MM-DD
  isOfficial: boolean;
}

export interface BBMPWorkDetails {
  id: string;
  jobNumber: string | null;
  workNumber: string | null;
  projectId: string | null;
  workName: string | null;
  workDescription: string | null;
  workCategory: string | null;
  workType: string | null;
  wardNumber: string | null;
  wardName: string | null;
  zone: string | null;
  divisionName: string | null;
  subDivisionName: string | null;
  departmentName: string | null;
  schemeName: string | null;
  grantType: string | null;
  budgetHead: string | null;
  financialYear: string | null;
  estimateAmount: number | null;
  sanctionedAmount: number | null;
  tenderAmount: number | null;
  tenderNumber: string | null;
  tenderDate: string | null;
  tenderStatus: string | null;
  workOrderNumber: string | null;
  workOrderDate: string | null;
  administrativeApprovalNumber: string | null;
  technicalSanctionNumber: string | null;
  startDate: string | null;
  expectedCompletionDate: string | null;
  actualCompletionDate: string | null;
  progressPercentage: number | null;
  physicalProgress: string | null;
  paidAmount: number | null;
  /** Derived — see lib/bbmp-works/calculations.ts. Never stored as a column. */
  pendingAmount: number | null;
  /** Derived — see lib/bbmp-works/calculations.ts. Never stored as a column. */
  financialProgress: number | null;
  engineerName: string | null;
  engineerPhone: string | null;
  engineerEmail: string | null;
  assistantEngineer: string | null;
  assistantExecutiveEngineer: string | null;
  executiveEngineer: string | null;
  superintendingEngineer: string | null;
  chiefEngineer: string | null;
  contractorName: string | null;
  contractorAddress: string | null;
  contractorPhone: string | null;
  contractorEmail: string | null;
  contractorRegistrationNumber: string | null;
  locationDescription: string | null;
  roadName: string | null;
  layoutName: string | null;
  latitude: number | null;
  longitude: number | null;
  workStatus: string | null;
  verificationStatus: WorkVerificationStatus;
  officialSourceCount: number;
  latestUpdate: string | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  sources: SourceDetails[];
}

/** All fields optional; at least one must be present (validated by validateWorkSearchRequest). */
export interface WorkSearchRequest {
  jobNumber?: string;
  workNumber?: string;
  tenderNumber?: string;
  workOrderNumber?: string;
  wardNumber?: string;
  wardName?: string;
  zone?: string;
  division?: string;
  subDivision?: string;
  workName?: string;
  location?: string;
  layoutName?: string;
  roadName?: string;
  contractorName?: string;
  engineerName?: string; // also matches "officer name" across the full engineer chain
}

export type WorkSearchErrorCode = "VALIDATION_ERROR" | "NO_DATA" | "SOURCE_ERROR" | "SYSTEM_ERROR";

export interface WorkSearchResponse {
  success: boolean;
  totalResults: number;
  data: BBMPWorkDetails[];
  message: string;
  errorCode?: WorkSearchErrorCode;
  suggestions?: string[];
}

/** True if at least one search field was supplied (spec rule: at least one field is mandatory). */
export function validateWorkSearchRequest(request: WorkSearchRequest): boolean {
  return Object.values(request).some((v) => typeof v === "string" && v.trim() !== "");
}
