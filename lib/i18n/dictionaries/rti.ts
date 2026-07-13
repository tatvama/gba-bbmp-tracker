import { registerNamespace } from "../registry";
import type { NamespaceDictionaries } from "../types";

/** RTI module UI chrome. Status/category DISPLAY VALUES are translated
 *  separately via translateEnum("status"|"workflow", value, locale) — this
 *  namespace is for the surrounding labels/headings/actions only. */
const en = {
  // Page titles / headers
  "page.dashboardTitle": "RTI Dashboard",
  "page.listTitle": "All RTIs",
  "page.detailTitle": "RTI Application",
  "page.createTitle": "New RTI Application",
  "page.editTitle": "Edit RTI Application",
  "page.calendarTitle": "RTI Calendar",
  "page.reportsTitle": "RTI Reports",
  "page.firstAppealTitle": "First Appeal",
  "page.secondAppealTitle": "Second Appeal",
  "page.auditTitle": "RTI Audit Log",

  // Workflow stage labels (illustrative display copy, distinct from the
  // raw RTI_STATUSES enum values translated in status.ts)
  "workflow.rtiFiled": "RTI Filed",
  "workflow.pendingPioReply": "Pending PIO Reply",
  "workflow.firstAppealEligible": "First Appeal Eligible",
  "workflow.firstAppealFiled": "First Appeal Filed",
  "workflow.secondAppealEligible": "Second Appeal Eligible",
  "workflow.secondAppealFiled": "Second Appeal Filed",

  // PIO / FAA / appeal fields
  "field.pioName": "PIO Name",
  "field.pioDesignation": "PIO Designation",
  "field.pioOffice": "PIO Office",
  "field.faaName": "FAA Name",
  "field.faaDesignation": "FAA Designation",
  "field.firstAppealGround": "First Appeal Ground",
  "field.secondAppealReason": "Second Appeal Reason",
  "field.filingStatus": "Filing Status",
  "field.replyStatus": "Reply Status",
  "field.satisfactionQuestion": "Were you satisfied with the reply?",
  "field.referenceNumber": "Reference Number",
  "field.subject": "Subject",
  "field.department": "Department",
  "field.category": "Category",
  "field.filingMode": "Filing Mode",
  "field.applicantName": "Applicant Name",
  "field.dateFiled": "Date Filed",
  "field.dueDate": "Due Date",

  // Acknowledgement / verification
  "action.uploadAcknowledgement": "Upload Acknowledgement",
  "verification.title": "Verification",
  "verification.status": "Verification Status",
  "verification.lastVerifiedDate": "Last Verified Date",

  // Actions
  "action.viewRti": "View RTI",
  "action.editRti": "Edit RTI",
  "action.fileFirstAppeal": "File First Appeal",
  "action.fileSecondAppeal": "File Second Appeal",
  "action.closeRti": "Close RTI",
  "action.downloadPdf": "Download PDF",
  "action.print": "Print",

  // Filters / search / table
  "filter.status": "Status",
  "filter.category": "Category",
  "filter.department": "Department",
  "filter.dateRange": "Date Range",
  "search.placeholder": "Search RTI number, subject, applicant…",
  "table.rtiNumber": "RTI No.",
  "table.subject": "Subject",
  "table.department": "Department",
  "table.status": "Status",
  "table.dateFiled": "Date Filed",
  "table.dueDate": "Due Date",
  "table.noRtisFound": "No RTI applications found",

  // Timeline / change history
  "timeline.title": "Timeline",
  "timeline.changeHistory": "Change History",
  "timeline.noEntries": "No timeline entries yet",

  // Modals / validation
  "modal.confirmClose": "Close this RTI application?",
  "modal.confirmFileAppeal": "File this appeal?",
  "validation.subjectRequired": "Subject is required",
  "validation.departmentRequired": "Select a department",

  // Success / error / empty states
  "message.rtiCreated": "RTI application created successfully",
  "message.rtiUpdated": "RTI application updated successfully",
  "message.appealFiled": "Appeal filed successfully",
  "empty.noRtis": "No RTI applications yet",
  "empty.noRtisDescription": "RTI applications will appear here once filed.",
} as const satisfies Record<string, string>;

const kn: Record<keyof typeof en, string> = {
  "page.dashboardTitle": "ಮಾಹಿತಿ ಹಕ್ಕು ಡ್ಯಾಶ್‌ಬೋರ್ಡ್",
  "page.listTitle": "ಎಲ್ಲಾ ಮಾಹಿತಿ ಹಕ್ಕು ಅರ್ಜಿಗಳು",
  "page.detailTitle": "ಮಾಹಿತಿ ಹಕ್ಕು ಅರ್ಜಿ",
  "page.createTitle": "ಹೊಸ ಮಾಹಿತಿ ಹಕ್ಕು ಅರ್ಜಿ",
  "page.editTitle": "ಮಾಹಿತಿ ಹಕ್ಕು ಅರ್ಜಿ ಸಂಪಾದಿಸಿ",
  "page.calendarTitle": "ಮಾಹಿತಿ ಹಕ್ಕು ಕ್ಯಾಲೆಂಡರ್",
  "page.reportsTitle": "ಮಾಹಿತಿ ಹಕ್ಕು ವರದಿಗಳು",
  "page.firstAppealTitle": "ಮೊದಲ ಮೇಲ್ಮನವಿ",
  "page.secondAppealTitle": "ಎರಡನೇ ಮೇಲ್ಮನವಿ",
  "page.auditTitle": "ಮಾಹಿತಿ ಹಕ್ಕು ಲೆಕ್ಕಪರಿಶೋಧನಾ ದಾಖಲೆ",

  "workflow.rtiFiled": "ಮಾಹಿತಿ ಹಕ್ಕು ಅರ್ಜಿ ಸಲ್ಲಿಸಲಾಗಿದೆ",
  "workflow.pendingPioReply": "PIO ಉತ್ತರ ಬಾಕಿ ಇದೆ",
  "workflow.firstAppealEligible": "ಮೊದಲ ಮೇಲ್ಮನವಿಗೆ ಅರ್ಹ",
  "workflow.firstAppealFiled": "ಮೊದಲ ಮೇಲ್ಮನವಿ ಸಲ್ಲಿಸಲಾಗಿದೆ",
  "workflow.secondAppealEligible": "ಎರಡನೇ ಮೇಲ್ಮನವಿಗೆ ಅರ್ಹ",
  "workflow.secondAppealFiled": "ಎರಡನೇ ಮೇಲ್ಮನವಿ ಸಲ್ಲಿಸಲಾಗಿದೆ",

  "field.pioName": "PIO ಹೆಸರು",
  "field.pioDesignation": "PIO ಹುದ್ದೆ",
  "field.pioOffice": "PIO ಕಚೇರಿ",
  "field.faaName": "FAA ಹೆಸರು",
  "field.faaDesignation": "FAA ಹುದ್ದೆ",
  "field.firstAppealGround": "ಮೊದಲ ಮೇಲ್ಮನವಿ ಆಧಾರ",
  "field.secondAppealReason": "ಎರಡನೇ ಮೇಲ್ಮನವಿ ಕಾರಣ",
  "field.filingStatus": "ಸಲ್ಲಿಕೆ ಸ್ಥಿತಿ",
  "field.replyStatus": "ಉತ್ತರದ ಸ್ಥಿತಿ",
  "field.satisfactionQuestion": "ಉತ್ತರದಿಂದ ನೀವು ತೃಪ್ತರಾಗಿದ್ದೀರಾ?",
  "field.referenceNumber": "ಉಲ್ಲೇಖ ಸಂಖ್ಯೆ",
  "field.subject": "ವಿಷಯ",
  "field.department": "ಇಲಾಖೆ",
  "field.category": "ವರ್ಗ",
  "field.filingMode": "ಸಲ್ಲಿಕೆ ವಿಧಾನ",
  "field.applicantName": "ಅರ್ಜಿದಾರರ ಹೆಸರು",
  "field.dateFiled": "ಸಲ್ಲಿಸಿದ ದಿನಾಂಕ",
  "field.dueDate": "ಅಂತಿಮ ದಿನಾಂಕ",

  "action.uploadAcknowledgement": "ಸ್ವೀಕೃತಿ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ",
  "verification.title": "ಪರಿಶೀಲನೆ",
  "verification.status": "ಪರಿಶೀಲನಾ ಸ್ಥಿತಿ",
  "verification.lastVerifiedDate": "ಕೊನೆಯ ಪರಿಶೀಲನಾ ದಿನಾಂಕ",

  "action.viewRti": "ಮಾಹಿತಿ ಹಕ್ಕು ಅರ್ಜಿ ವೀಕ್ಷಿಸಿ",
  "action.editRti": "ಮಾಹಿತಿ ಹಕ್ಕು ಅರ್ಜಿ ಸಂಪಾದಿಸಿ",
  "action.fileFirstAppeal": "ಮೊದಲ ಮೇಲ್ಮನವಿ ಸಲ್ಲಿಸಿ",
  "action.fileSecondAppeal": "ಎರಡನೇ ಮೇಲ್ಮನವಿ ಸಲ್ಲಿಸಿ",
  "action.closeRti": "ಮಾಹಿತಿ ಹಕ್ಕು ಅರ್ಜಿ ಮುಚ್ಚಿ",
  "action.downloadPdf": "PDF ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ",
  "action.print": "ಮುದ್ರಿಸಿ",

  "filter.status": "ಸ್ಥಿತಿ",
  "filter.category": "ವರ್ಗ",
  "filter.department": "ಇಲಾಖೆ",
  "filter.dateRange": "ದಿನಾಂಕ ವ್ಯಾಪ್ತಿ",
  "search.placeholder": "ಮಾಹಿತಿ ಹಕ್ಕು ಸಂಖ್ಯೆ, ವಿಷಯ, ಅರ್ಜಿದಾರರನ್ನು ಹುಡುಕಿ…",
  "table.rtiNumber": "ಮಾಹಿತಿ ಹಕ್ಕು ಸಂಖ್ಯೆ",
  "table.subject": "ವಿಷಯ",
  "table.department": "ಇಲಾಖೆ",
  "table.status": "ಸ್ಥಿತಿ",
  "table.dateFiled": "ಸಲ್ಲಿಸಿದ ದಿನಾಂಕ",
  "table.dueDate": "ಅಂತಿಮ ದಿನಾಂಕ",
  "table.noRtisFound": "ಯಾವುದೇ ಮಾಹಿತಿ ಹಕ್ಕು ಅರ್ಜಿಗಳು ಕಂಡುಬಂದಿಲ್ಲ",

  "timeline.title": "ಕಾಲಸೂಚಿ",
  "timeline.changeHistory": "ಬದಲಾವಣೆ ಇತಿಹಾಸ",
  "timeline.noEntries": "ಇನ್ನೂ ಯಾವುದೇ ಕಾಲಸೂಚಿ ನಮೂದುಗಳಿಲ್ಲ",

  "modal.confirmClose": "ಈ ಮಾಹಿತಿ ಹಕ್ಕು ಅರ್ಜಿಯನ್ನು ಮುಚ್ಚಬೇಕೇ?",
  "modal.confirmFileAppeal": "ಈ ಮೇಲ್ಮನವಿಯನ್ನು ಸಲ್ಲಿಸಬೇಕೇ?",
  "validation.subjectRequired": "ವಿಷಯ ಅಗತ್ಯವಿದೆ",
  "validation.departmentRequired": "ಇಲಾಖೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ",

  "message.rtiCreated": "ಮಾಹಿತಿ ಹಕ್ಕು ಅರ್ಜಿ ಯಶಸ್ವಿಯಾಗಿ ದಾಖಲಾಗಿದೆ",
  "message.rtiUpdated": "ಮಾಹಿತಿ ಹಕ್ಕು ಅರ್ಜಿ ಯಶಸ್ವಿಯಾಗಿ ನವೀಕರಿಸಲಾಗಿದೆ",
  "message.appealFiled": "ಮೇಲ್ಮನವಿ ಯಶಸ್ವಿಯಾಗಿ ಸಲ್ಲಿಸಲಾಗಿದೆ",
  "empty.noRtis": "ಇನ್ನೂ ಯಾವುದೇ ಮಾಹಿತಿ ಹಕ್ಕು ಅರ್ಜಿಗಳಿಲ್ಲ",
  "empty.noRtisDescription": "ಸಲ್ಲಿಸಿದ ನಂತರ ಮಾಹಿತಿ ಹಕ್ಕು ಅರ್ಜಿಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.",
};

registerNamespace("rti", { en, kn } as NamespaceDictionaries);
