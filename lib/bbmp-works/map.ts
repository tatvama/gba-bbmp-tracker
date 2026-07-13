import type { BBMPWorkDetails, SourceDetails, WorkVerificationStatus } from "./types";
import { calculateFinancialProgress, calculatePendingAmount } from "./calculations";
import { resolveWorkStatus } from "./status";

/** snake_case DB row shape for public.bbmp_works (subset of columns actually selected). */
export interface BbmpWorkRow {
  id: string;
  job_number: string | null;
  work_number: string | null;
  project_id: string | null;
  work_name: string | null;
  work_description: string | null;
  work_category: string | null;
  work_type: string | null;
  ward_number: string | null;
  ward_name: string | null;
  zone: string | null;
  division_name: string | null;
  sub_division_name: string | null;
  department_name: string | null;
  scheme_name: string | null;
  grant_type: string | null;
  budget_head: string | null;
  financial_year: string | null;
  estimate_amount: number | null;
  sanctioned_amount: number | null;
  tender_amount: number | null;
  tender_number: string | null;
  tender_date: string | null;
  tender_status: string | null;
  work_order_number: string | null;
  work_order_date: string | null;
  administrative_approval_number: string | null;
  technical_sanction_number: string | null;
  start_date: string | null;
  expected_completion_date: string | null;
  actual_completion_date: string | null;
  progress_percentage: number | null;
  physical_progress: string | null;
  paid_amount: number | null;
  engineer_name: string | null;
  engineer_phone: string | null;
  engineer_email: string | null;
  assistant_engineer: string | null;
  assistant_executive_engineer: string | null;
  executive_engineer: string | null;
  superintending_engineer: string | null;
  chief_engineer: string | null;
  contractor_name: string | null;
  contractor_address: string | null;
  contractor_phone: string | null;
  contractor_email: string | null;
  contractor_registration_number: string | null;
  location_description: string | null;
  road_name: string | null;
  layout_name: string | null;
  latitude: number | null;
  longitude: number | null;
  work_status: string | null;
  verification_status: string;
  official_source_count: number;
  latest_update: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkSourceRow {
  id: string;
  source_id: string;
  source_name: string;
  source_url: string | null;
  document_name: string | null;
  reference_number: string | null;
  page_number: number | null;
  accessed_date: string;
  is_official: boolean;
}

export function sourceRowToDetails(row: WorkSourceRow): SourceDetails {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    documentName: row.document_name,
    referenceNumber: row.reference_number,
    pageNumber: row.page_number,
    accessedDate: row.accessed_date,
    isOfficial: row.is_official,
  };
}

export function rowToWorkDetails(row: BbmpWorkRow, sources: WorkSourceRow[] = []): BBMPWorkDetails {
  return {
    id: row.id,
    jobNumber: row.job_number,
    workNumber: row.work_number,
    projectId: row.project_id,
    workName: row.work_name,
    workDescription: row.work_description,
    workCategory: row.work_category,
    workType: row.work_type,
    wardNumber: row.ward_number,
    wardName: row.ward_name,
    zone: row.zone,
    divisionName: row.division_name,
    subDivisionName: row.sub_division_name,
    departmentName: row.department_name,
    schemeName: row.scheme_name,
    grantType: row.grant_type,
    budgetHead: row.budget_head,
    financialYear: row.financial_year,
    estimateAmount: row.estimate_amount,
    sanctionedAmount: row.sanctioned_amount,
    tenderAmount: row.tender_amount,
    tenderNumber: row.tender_number,
    tenderDate: row.tender_date,
    tenderStatus: row.tender_status,
    workOrderNumber: row.work_order_number,
    workOrderDate: row.work_order_date,
    administrativeApprovalNumber: row.administrative_approval_number,
    technicalSanctionNumber: row.technical_sanction_number,
    startDate: row.start_date,
    expectedCompletionDate: row.expected_completion_date,
    actualCompletionDate: row.actual_completion_date,
    progressPercentage: row.progress_percentage,
    physicalProgress: row.physical_progress,
    paidAmount: row.paid_amount,
    pendingAmount: calculatePendingAmount(row.sanctioned_amount, row.paid_amount),
    financialProgress: calculateFinancialProgress(row.paid_amount, row.sanctioned_amount),
    engineerName: row.engineer_name,
    engineerPhone: row.engineer_phone,
    engineerEmail: row.engineer_email,
    assistantEngineer: row.assistant_engineer,
    assistantExecutiveEngineer: row.assistant_executive_engineer,
    executiveEngineer: row.executive_engineer,
    superintendingEngineer: row.superintending_engineer,
    chiefEngineer: row.chief_engineer,
    contractorName: row.contractor_name,
    contractorAddress: row.contractor_address,
    contractorPhone: row.contractor_phone,
    contractorEmail: row.contractor_email,
    contractorRegistrationNumber: row.contractor_registration_number,
    locationDescription: row.location_description,
    roadName: row.road_name,
    layoutName: row.layout_name,
    latitude: row.latitude,
    longitude: row.longitude,
    workStatus: resolveWorkStatus(row.work_status, row.progress_percentage),
    verificationStatus: row.verification_status as WorkVerificationStatus,
    officialSourceCount: row.official_source_count,
    latestUpdate: row.latest_update,
    remarks: row.remarks,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sources: sources.map(sourceRowToDetails),
  };
}
