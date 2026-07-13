import { registerNamespace } from "../registry";
import type { NamespaceDictionaries } from "../types";

/**
 * DISPLAY LABELS for every status-shaped enum value in the app — looked up
 * via translateEnum("status", rawValue, locale), NEVER via an invented key.
 * Keys are the EXACT strings as they exist in lib/constants.ts / the
 * database (COMPLAINT_STATUSES, RTI_STATUSES, DOC_VERIFICATION_STATUSES,
 * OCR_STATUSES, VERIFICATION_STATUSES, and the BBMP-works WORK_STATUSES /
 * WORK_VERIFICATION_STATUSES) — changing a key here without changing the
 * source constant breaks the lookup, so these must stay byte-for-byte in
 * sync with lib/constants.ts. Several keys are legitimately shared by more
 * than one enum (e.g. "Draft", "Closed", "Completed") because the same
 * English word means the same thing in every status list it appears in.
 */
const en = {
  // COMPLAINT_STATUSES
  "Draft": "Draft",
  "Filed": "Filed",
  "Acknowledged": "Acknowledged",
  "Under Review": "Under Review",
  "Assigned To Engineer": "Assigned To Engineer",
  "Site Visit Pending": "Site Visit Pending",
  "Site Visit Done": "Site Visit Done",
  "Work In Progress": "Work In Progress",
  "Reply Received": "Reply Received",
  "Action Taken Report Received": "Action Taken Report Received",
  "Partially Resolved": "Partially Resolved",
  "Resolved": "Resolved",
  "Reopened": "Reopened",
  "Escalated": "Escalated",
  "Converted To RTI": "Converted To RTI",
  "Closed": "Closed",
  "No Response": "No Response",
  "Overdue": "Overdue",

  // RTI_STATUSES (Draft/Filed/Closed already above)
  "Ready to File": "Ready to File",
  "Awaiting Reply": "Awaiting Reply",
  "Partial Reply": "Partial Reply",
  "Rejected": "Rejected",
  "No Reply": "No Reply",
  "First Appeal Drafted": "First Appeal Drafted",
  "First Appeal Filed": "First Appeal Filed",
  "FAA Order Received": "FAA Order Received",
  "Second Appeal Drafted": "Second Appeal Drafted",
  "Second Appeal Filed": "Second Appeal Filed",
  "Complaint Filed": "Complaint Filed",

  // DOC_VERIFICATION_STATUSES
  "Pending Review": "Pending Review",
  "Verified": "Verified",
  "Needs Correction": "Needs Correction",
  "Duplicate": "Duplicate",
  "Low Confidence": "Low Confidence",

  // OCR_STATUSES (Completed shared with WORK_STATUSES)
  "Not Started": "Not Started",
  "Queued": "Queued",
  "Processing": "Processing",
  "Completed": "Completed",
  "Failed": "Failed",
  "Needs Manual Review": "Needs Manual Review",
  "Skipped": "Skipped",

  // VERIFICATION_STATUSES (contact/ward — raw UPPERCASE enum values)
  "VERIFIED": "Verified",
  "PENDING": "Pending",
  "NEEDS_CORRECTION": "Needs correction",
  "RETIRED_TRANSFERRED": "Retired / transferred",
  "UNKNOWN": "Unknown",

  // BBMP-works WORK_STATUSES (In Progress/Not Started/Completed shared above)
  "Tender Pending": "Tender Pending",
  "Tender Published": "Tender Published",
  "Tender Awarded": "Tender Awarded",
  "Work Order Issued": "Work Order Issued",
  "In Progress": "In Progress",
  "Temporarily Stopped": "Temporarily Stopped",
  "Delayed": "Delayed",
  "Bill Pending": "Bill Pending",
  "Payment Partially Completed": "Payment Partially Completed",
  "Payment Completed": "Payment Completed",
  "Cancelled": "Cancelled",
  "Status Unknown": "Status Unknown",

  // BBMP-works WORK_VERIFICATION_STATUSES (Verified shared above)
  "Partially Verified": "Partially Verified",
  "Unverified": "Unverified",
  "Conflicting Information": "Conflicting Information",
} as const satisfies Record<string, string>;

const kn: Record<keyof typeof en, string> = {
  "Draft": "ಕರಡು",
  "Filed": "ಸಲ್ಲಿಸಲಾಗಿದೆ",
  "Acknowledged": "ಸ್ವೀಕರಿಸಲಾಗಿದೆ",
  "Under Review": "ಪರಿಶೀಲನೆಯಲ್ಲಿದೆ",
  "Assigned To Engineer": "ಇಂಜಿನಿಯರ್‌ಗೆ ನಿಯೋಜಿಸಲಾಗಿದೆ",
  "Site Visit Pending": "ಸ್ಥಳ ಭೇಟಿ ಬಾಕಿ ಇದೆ",
  "Site Visit Done": "ಸ್ಥಳ ಭೇಟಿ ಪೂರ್ಣಗೊಂಡಿದೆ",
  "Work In Progress": "ಕೆಲಸ ಪ್ರಗತಿಯಲ್ಲಿದೆ",
  "Reply Received": "ಉತ್ತರ ಸ್ವೀಕರಿಸಲಾಗಿದೆ",
  "Action Taken Report Received": "ಕ್ರಮ ವರದಿ ಸ್ವೀಕರಿಸಲಾಗಿದೆ",
  "Partially Resolved": "ಭಾಗಶಃ ಪರಿಹರಿಸಲಾಗಿದೆ",
  "Resolved": "ಪರಿಹರಿಸಲಾಗಿದೆ",
  "Reopened": "ಮರುತೆರೆಯಲಾಗಿದೆ",
  "Escalated": "ಆದ್ಯತೆ ಹೆಚ್ಚಿಸಲಾಗಿದೆ",
  "Converted To RTI": "ಮಾಹಿತಿ ಹಕ್ಕು ಅರ್ಜಿಯಾಗಿ ಪರಿವರ್ತಿಸಲಾಗಿದೆ",
  "Closed": "ಮುಚ್ಚಲಾಗಿದೆ",
  "No Response": "ಯಾವುದೇ ಪ್ರತಿಕ್ರಿಯೆ ಇಲ್ಲ",
  "Overdue": "ಅವಧಿ ಮೀರಿದೆ",

  "Ready to File": "ಸಲ್ಲಿಸಲು ಸಿದ್ಧವಾಗಿದೆ",
  "Awaiting Reply": "ಉತ್ತರಕ್ಕಾಗಿ ಕಾಯಲಾಗುತ್ತಿದೆ",
  "Partial Reply": "ಭಾಗಶಃ ಉತ್ತರ",
  "Rejected": "ತಿರಸ್ಕರಿಸಲಾಗಿದೆ",
  "No Reply": "ಯಾವುದೇ ಉತ್ತರವಿಲ್ಲ",
  "First Appeal Drafted": "ಮೊದಲ ಮೇಲ್ಮನವಿ ಕರಡು ಸಿದ್ಧವಾಗಿದೆ",
  "First Appeal Filed": "ಮೊದಲ ಮೇಲ್ಮನವಿ ಸಲ್ಲಿಸಲಾಗಿದೆ",
  "FAA Order Received": "FAA ಆದೇಶ ಸ್ವೀಕರಿಸಲಾಗಿದೆ",
  "Second Appeal Drafted": "ಎರಡನೇ ಮೇಲ್ಮನವಿ ಕರಡು ಸಿದ್ಧವಾಗಿದೆ",
  "Second Appeal Filed": "ಎರಡನೇ ಮೇಲ್ಮನವಿ ಸಲ್ಲಿಸಲಾಗಿದೆ",
  "Complaint Filed": "ದೂರು ಸಲ್ಲಿಸಲಾಗಿದೆ",

  "Pending Review": "ಪರಿಶೀಲನೆ ಬಾಕಿ ಇದೆ",
  "Verified": "ಪರಿಶೀಲಿಸಲಾಗಿದೆ",
  "Needs Correction": "ತಿದ್ದುಪಡಿ ಅಗತ್ಯವಿದೆ",
  "Duplicate": "ನಕಲಿ",
  "Low Confidence": "ಕಡಿಮೆ ವಿಶ್ವಾಸಾರ್ಹತೆ",

  "Not Started": "ಪ್ರಾರಂಭಿಸಿಲ್ಲ",
  "Queued": "ಸಾಲಿನಲ್ಲಿದೆ",
  "Processing": "ಪ್ರಕ್ರಿಯೆಗೊಳ್ಳುತ್ತಿದೆ",
  "Completed": "ಪೂರ್ಣಗೊಂಡಿದೆ",
  "Failed": "ವಿಫಲವಾಗಿದೆ",
  "Needs Manual Review": "ಹಸ್ತಚಾಲಿತ ಪರಿಶೀಲನೆ ಅಗತ್ಯವಿದೆ",
  "Skipped": "ಬಿಟ್ಟುಬಿಡಲಾಗಿದೆ",

  "VERIFIED": "ಪರಿಶೀಲಿಸಲಾಗಿದೆ",
  "PENDING": "ಬಾಕಿ ಇದೆ",
  "NEEDS_CORRECTION": "ತಿದ್ದುಪಡಿ ಅಗತ್ಯವಿದೆ",
  "RETIRED_TRANSFERRED": "ನಿವೃತ್ತ / ವರ್ಗಾವಣೆಗೊಂಡಿದೆ",
  "UNKNOWN": "ಗೊತ್ತಿಲ್ಲ",

  "Tender Pending": "ಟೆಂಡರ್ ಬಾಕಿ ಇದೆ",
  "Tender Published": "ಟೆಂಡರ್ ಪ್ರಕಟಿಸಲಾಗಿದೆ",
  "Tender Awarded": "ಟೆಂಡರ್ ನೀಡಲಾಗಿದೆ",
  "Work Order Issued": "ಕಾರ್ಯಾದೇಶ ನೀಡಲಾಗಿದೆ",
  "In Progress": "ಪ್ರಗತಿಯಲ್ಲಿದೆ",
  "Temporarily Stopped": "ತಾತ್ಕಾಲಿಕವಾಗಿ ನಿಲ್ಲಿಸಲಾಗಿದೆ",
  "Delayed": "ವಿಳಂಬವಾಗಿದೆ",
  "Bill Pending": "ಬಿಲ್ ಬಾಕಿ ಇದೆ",
  "Payment Partially Completed": "ಪಾವತಿ ಭಾಗಶಃ ಪೂರ್ಣಗೊಂಡಿದೆ",
  "Payment Completed": "ಪಾವತಿ ಪೂರ್ಣಗೊಂಡಿದೆ",
  "Cancelled": "ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ",
  "Status Unknown": "ಸ್ಥಿತಿ ಗೊತ್ತಿಲ್ಲ",

  "Partially Verified": "ಭಾಗಶಃ ಪರಿಶೀಲಿಸಲಾಗಿದೆ",
  "Unverified": "ಪರಿಶೀಲಿಸಲಾಗಿಲ್ಲ",
  "Conflicting Information": "ವಿರೋಧಾತ್ಮಕ ಮಾಹಿತಿ",
};

registerNamespace("status", { en, kn } as NamespaceDictionaries);
