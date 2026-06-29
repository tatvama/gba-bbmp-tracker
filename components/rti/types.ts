import type { RtiApplication } from "@/lib/types";

export interface FileMetadata {
  originalFileName?: string;
  fileName?: string;
  mimeType?: string;
  fileType?: string;
  fileSize?: number;
  totalPages?: number;
  uploadTimestamp?: string;
  uploadedAt?: string;
  ocrEngine?: string;
  aiModel?: string;
  processingDuration?: string;
  processingDurationMs?: number;
  processingVersion?: string;
  uploaderName?: string;
  uploadedBy?: string;
}

export interface ArchiveItem {
  ack_status?: string;
  ack_image_path: string;
  ack_recommended_action?: string;
  archivedAt?: string;
  ack_file_metadata?: FileMetadata;
}

export interface HistoryLog {
  event: string;
  user: string;
  timestamp: string;
}

export interface ExtractedField {
  value?: string;
  page?: number;
}

export interface ExtractedInfo {
  publicAuthority?: ExtractedField | string;
  department?: ExtractedField | string;
  applicationNumber?: ExtractedField | string;
  filingDate?: ExtractedField | string;
  applicantName?: ExtractedField | string;
  acknowledgementNumber?: ExtractedField | string;
  diaryNumber?: ExtractedField | string;
  inwardNumber?: ExtractedField | string;
  officeAddress?: ExtractedField | string;
  officerName?: ExtractedField | string;
  officerDesignation?: ExtractedField | string;
  referenceNumber?: ExtractedField | string;
}

export interface Verifications {
  publicAuthorityMatches?: boolean;
  departmentMatches?: boolean;
  applicationNumberMatches?: boolean;
  filingDateMatches?: boolean;
  applicantNameMatches?: boolean;
}

export interface AckExtractedInfo {
  extractedInfo?: ExtractedInfo;
  verifications?: Verifications;
}

export interface VisualElement {
  name: string;
  page?: number;
}
