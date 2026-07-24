import { registerNamespace } from "../registry";
import type { NamespaceDictionaries } from "../types";

/**
 * DISPLAY LABELS for every category/type/priority/role/document-type enum in
 * the app — looked up via translateEnum("workflow", rawValue, locale).
 * Keys are EXACT, case-sensitive strings from lib/constants.ts (COMPLAINT_TYPES,
 * PRIORITIES, COMPLAINT_FILED_MODES, PUBLIC_IMPACT_LEVELS, RTI_CATEGORIES,
 * RTI_FILING_MODES, RTI_SATISFACTION, RTI_DOCUMENT_TYPES, FIRST_APPEAL_GROUNDS,
 * SECOND_APPEAL_REASONS, DESIGNATIONS, ROLE_LEVELS, ESCALATION_CHAIN,
 * TIMELINE_EVENT_TYPES, COMMUNICATION_TYPES, COMPLAINT_REMINDER_TYPES,
 * COMPLAINT_DOCUMENT_TYPES). Two source lists sometimes use the SAME word with
 * different casing (e.g. COMPLAINT_TYPES' "Public Works" vs RTI_CATEGORIES'
 * "Public works") — those are genuinely different object keys and both are
 * listed; do not "fix" the casing to deduplicate, it would break the lookup
 * for whichever constant no longer matches.
 */
const en = {
  // PRIORITIES
  "Low": "Low",
  "Medium": "Medium",
  "High": "High",
  "Urgent": "Urgent",

  // COMPLAINT_TYPES (BBMP responsible-department taxonomy). "Revenue" is shared
  // with the RTI categories below, so it lives there — not duplicated here.
  "Road Infrastructure": "Road Infrastructure",
  "Storm Water Drain": "Storm Water Drain",
  "Lakes": "Lakes",
  "Electrical": "Electrical",
  "Horticulture": "Horticulture",
  "Town Planning": "Town Planning",
  "Health": "Health",
  "Legal": "Legal",
  "IT": "IT",
  "Other": "Other",

  // COMPLAINT_FILED_MODES
  "Online portal": "Online portal",
  "Phone": "Phone",
  "WhatsApp": "WhatsApp",
  "Written letter": "Written letter",
  "In-person": "In-person",

  // PUBLIC_IMPACT_LEVELS
  "Individual": "Individual",
  "Street": "Street",
  "Ward": "Ward",
  "Division": "Division",
  "Public Safety": "Public Safety",

  // RTI_CATEGORIES (own casing, distinct from COMPLAINT_TYPES above)
  "Public works": "Public works",
  "Road work": "Road work",
  "Drain work": "Drain work",
  "Building plan": "Building plan",
  "Bill payment": "Bill payment",
  "Contractor details": "Contractor details",
  "MB Book": "MB Book",
  "Work order": "Work order",
  "Tender": "Tender",
  "Estimate": "Estimate",
  "Measurement": "Measurement",
  "Quality control": "Quality control",
  "Ward committee": "Ward committee",
  "Public health": "Public health",
  "Revenue": "Revenue",

  // RTI_FILING_MODES
  "Online": "Online",
  "Physical": "Physical",
  "Speed Post": "Speed Post",
  "Registered Post": "Registered Post",
  "Email": "Email",
  "Hand submission": "Hand submission",

  // RTI_SATISFACTION
  "Satisfied": "Satisfied",
  "Partially Satisfied": "Partially Satisfied",
  "Unsatisfied": "Unsatisfied",
  "False Information": "False Information",
  "Incomplete Information": "Incomplete Information",
  "No Information": "No Information",

  // RTI_DOCUMENT_TYPES (Other already above)
  "Application": "Application",
  "Acknowledgement": "Acknowledgement",
  "Reply": "Reply",
  "FAA Order": "FAA Order",
  "Second Appeal Order": "Second Appeal Order",
  "Higher Appeal Order": "Higher Appeal Order",

  // FIRST_APPEAL_GROUNDS (own casing)
  "No reply within time": "No reply within time",
  "Incomplete information": "Incomplete information",
  "Misleading information": "Misleading information",
  "False information": "False information",
  "Wrong denial": "Wrong denial",
  "Excessive fee": "Excessive fee",
  "Information transferred incorrectly": "Information transferred incorrectly",
  "No PIO details": "No PIO details",
  "No FAA details": "No FAA details",

  // SECOND_APPEAL_REASONS (Incomplete information already above)
  "No FAA order": "No FAA order",
  "Unsatisfactory FAA order": "Unsatisfactory FAA order",
  "Continued denial": "Continued denial",
  "Penalty request": "Penalty request",
  "Compensation request": "Compensation request",
  "Direction to disclose information": "Direction to disclose information",

  // DESIGNATIONS
  "Chief Engineer": "Chief Engineer",
  "Superintending Engineer": "Superintending Engineer",
  "Executive Engineer": "Executive Engineer",
  "Assistant Executive Engineer": "Assistant Executive Engineer",
  "Assistant Engineer": "Assistant Engineer",
  "Junior Engineer": "Junior Engineer",
  "Ward Engineer": "Ward Engineer",
  "Contractor": "Contractor",
  "Office Staff": "Office Staff",

  // ROLE_LEVELS (short codes; Health Officer/Revenue Officer/Other shared with above)
  "CE": "Chief Engineer (CE)",
  "SE": "Superintending Engineer (SE)",
  "EE": "Executive Engineer (EE)",
  "AEE": "Assistant Executive Engineer (AEE)",
  "AE": "Assistant Engineer (AE)",
  "JE": "Junior Engineer (JE)",
  "Health Officer": "Health Officer",
  "Revenue Officer": "Revenue Officer",
  "Assistant Revenue Officer": "Assistant Revenue Officer",
  "Commissioner": "Commissioner",
  "Special Commissioner": "Special Commissioner",

  // ESCALATION_CHAIN (AE/AEE/EE/CE/Commissioner shared with ROLE_LEVELS)
  "Lokayukta": "Lokayukta",
  "ACB": "Anti-Corruption Bureau (ACB)",
  // components/complaints/complaint-forms.tsx's EscalationForm "To level"
  // picker uses its own local list (not the ESCALATION_CHAIN export above);
  // this is the one option value/label from that list not already covered.
  "Lokayukta / Legal": "Lokayukta / Legal",

  // Ward-type toggle (complaint-form.tsx, rti-form.tsx, contact-form.tsx all
  // hardcode this same BBMP/GBA pair inline rather than from a shared array).
  "BBMP": "BBMP Wards",
  "GBA": "GBA Wards",

  // TIMELINE_EVENT_TYPES (Filed/Acknowledged/Reply Received/Reopened shared with status.ts's own namespace — this is workflow's own copy)
  "Created": "Created",
  "Action Taken": "Action Taken",
  "Site Visit": "Site Visit",
  "Photo Evidence": "Photo Evidence",
  "Follow-up": "Follow-up",
  "Escalation": "Escalation",
  "Reminder": "Reminder",
  "Status Change": "Status Change",
  "Closure": "Closure",
  "Note": "Note",

  // COMMUNICATION_TYPES (WhatsApp/Email/Site Visit/Other shared above)
  "Phone Call": "Phone Call",
  "Letter": "Letter",
  "In Person": "In Person",
  "Portal Update": "Portal Update",
  "Hearing": "Hearing",

  // COMPLAINT_REMINDER_TYPES
  "Follow-up with engineer": "Follow-up with engineer",
  "Follow-up with ward office": "Follow-up with ward office",
  "Escalate to AEE": "Escalate to AEE",
  "Escalate to EE": "Escalate to EE",
  "Escalate to SE": "Escalate to SE",
  "Escalate to CE": "Escalate to CE",
  "File RTI": "File RTI",
  "Upload reply": "Upload reply",
  "Verify site action": "Verify site action",
  "Close complaint review": "Close complaint review",

  // COMPLAINT_DOCUMENT_TYPES (Other evidence distinct from bare "Other" above)
  "Original complaint copy": "Original complaint copy",
  "Complaint acknowledgement": "Complaint acknowledgement",
  "Department reply": "Department reply",
  "Engineer reply": "Engineer reply",
  "Action Taken Report": "Action Taken Report",
  "Site inspection note": "Site inspection note",
  "Postal receipt": "Postal receipt",
  "Email printout": "Email printout",
  "WhatsApp screenshot": "WhatsApp screenshot",
  "Portal screenshot": "Portal screenshot",
  "Work order copy": "Work order copy",
  "Estimate copy": "Estimate copy",
  "Bill copy": "Bill copy",
  "MB Book copy": "MB Book copy",
  "RTI related document": "RTI related document",
  "Appeal related document": "Appeal related document",
  "Site photo before work": "Site photo before work",
  "Site photo after work": "Site photo after work",
  "Tender notice": "Tender notice",
  "Technical bid": "Technical bid",
  "Financial bid": "Financial bid",
  "Contractor registration certificate": "Contractor registration certificate",
  "Insurance policy": "Insurance policy",
  "KW-4 agreement": "KW-4 agreement",
  "Technical Sanction": "Technical Sanction",
  "Schedule B": "Schedule B",
  "Modified Schedule B": "Modified Schedule B",
  "Royalty challan": "Royalty challan",
  "Trip sheet / weighbridge": "Trip sheet / weighbridge",
  "Quality test report": "Quality test report",
  "Geo-tagged site photo": "Geo-tagged site photo",
  "Completion certificate": "Completion certificate",
  "Defect liability / handover": "Defect liability / handover",
  "C&D waste / dumping-yard / salvage register": "C&D waste / dumping-yard / salvage register",
  "Other evidence": "Other evidence",

  // Acknowledgment match-confidence (lib/complaints/ack-reconcile.ts's MatchConfidence —
  // deliberately lowercase; kept in THIS namespace rather than "status" because lib/
  // constants.ts's RISK_BANDS already claims a bare "low" key over there with different text).
  "high": "High Confidence",
  "medium": "Needs Review",
  "low": "Low Confidence",
  "none": "No Match",

  // Forensic letter variants (lib/constants.ts's LETTER_VARIANTS / letter_drafts.variant
  // for the job-audit letter drafter — distinct from the risk-band "status" namespace
  // entries that happen to share the "bill_stop" raw string).
  "bill_stop": "Bill-stop letter",
  "lokayukta": "Lokayukta letter",
  "rti": "RTI letter",
  "bilingual_summary": "Bilingual summary",

  // COMPLAINT_DRAFT_KINDS (lib/constants.ts) — AI draft kinds shown as badges in the
  // print queue; English text mirrors the existing constant exactly.
  "followup_letter": "Follow-up letter",
  "whatsapp": "WhatsApp message to officer",
  "escalation_letter": "Escalation letter (next authority)",
  "reminder_email": "Reminder email",
  "rti_from_complaint": "RTI based on this complaint",
  "action_taken_request": "Action Taken Report request",
  "site_inspection_request": "Site inspection request",
  "lokayukta_complaint": "Lokayukta complaint",
  "chief_secretary_letter": "Chief Secretary / UDD letter",
  "cm_office_letter": "Chief Minister's office letter",
  "records_preservation": "Records-preservation request",
  "counter_reply": "Counter-reply to department reply",
  "clarification_request": "Clarification request to department",
  "reminder_letter": "Reminder letter (no reply received)",
  "legal_notice": "Legal notice (failure to reply/act)",

  // DRAFT_LANGUAGES (lib/constants.ts) — the language a drafted letter is
  // written in (letter_drafts.language), shown as a small inline label.
  "English": "English",
  "Kannada": "Kannada",
  "Bilingual": "Bilingual",

  // Submission channel (components/complaints/case-workflow.tsx's
  // SUBMIT_CHANNELS — how the filed letter was physically/digitally handed
  // over; distinct from COMPLAINT_FILED_MODES above, its own fixed set).
  "By hand (acknowledged copy)": "By hand (acknowledged copy)",
  "RPAD / Speed post": "RPAD / Speed post",
  "PGR / Sahaaya portal": "PGR / Sahaaya portal",
} as const satisfies Record<string, string>;

const kn: Record<keyof typeof en, string> = {
  "Low": "ಕಡಿಮೆ",
  "Medium": "ಮಧ್ಯಮ",
  "High": "ಹೆಚ್ಚು",
  "Urgent": "ತುರ್ತು",

  "Road Infrastructure": "ರಸ್ತೆ ಮೂಲಸೌಕರ್ಯ",
  "Storm Water Drain": "ಮಳೆನೀರು ಚರಂಡಿ",
  "Lakes": "ಕೆರೆಗಳು",
  "Electrical": "ವಿದ್ಯುತ್",
  "Horticulture": "ತೋಟಗಾರಿಕೆ",
  "Town Planning": "ನಗರ ಯೋಜನೆ",
  "Health": "ಆರೋಗ್ಯ",
  "Legal": "ಕಾನೂನು",
  "IT": "ಮಾಹಿತಿ ತಂತ್ರಜ್ಞಾನ",
  "Other": "ಇತರೆ",

  "Online portal": "ಆನ್‌ಲೈನ್ ಪೋರ್ಟಲ್",
  "Phone": "ಫೋನ್",
  "WhatsApp": "WhatsApp",
  "Written letter": "ಲಿಖಿತ ಪತ್ರ",
  "In-person": "ಖುದ್ದಾಗಿ",

  "Individual": "ವೈಯಕ್ತಿಕ",
  "Street": "ಬೀದಿ",
  "Ward": "ವಾರ್ಡ್",
  "Division": "ವಿಭಾಗ",
  "Public Safety": "ಸಾರ್ವಜನಿಕ ಸುರಕ್ಷತೆ",

  "Public works": "ಸಾರ್ವಜನಿಕ ಕಾಮಗಾರಿ",
  "Road work": "ರಸ್ತೆ ಕಾಮಗಾರಿ",
  "Drain work": "ಚರಂಡಿ ಕಾಮಗಾರಿ",
  "Building plan": "ಕಟ್ಟಡ ಯೋಜನೆ",
  "Bill payment": "ಬಿಲ್ ಪಾವತಿ",
  "Contractor details": "ಗುತ್ತಿಗೆದಾರ ವಿವರಗಳು",
  "MB Book": "MB ಪುಸ್ತಕ",
  "Work order": "ಕಾರ್ಯಾದೇಶ",
  "Tender": "ಟೆಂಡರ್",
  "Estimate": "ಅಂದಾಜು",
  "Measurement": "ಅಳತೆ",
  "Quality control": "ಗುಣಮಟ್ಟ ನಿಯಂತ್ರಣ",
  "Ward committee": "ವಾರ್ಡ್ ಸಮಿತಿ",
  "Public health": "ಸಾರ್ವಜನಿಕ ಆರೋಗ್ಯ",
  "Revenue": "ಕಂದಾಯ",

  "Online": "ಆನ್‌ಲೈನ್",
  "Physical": "ಭೌತಿಕ",
  "Speed Post": "ಸ್ಪೀಡ್ ಪೋಸ್ಟ್",
  "Registered Post": "ನೋಂದಾಯಿತ ಅಂಚೆ",
  "Email": "ಇಮೇಲ್",
  "Hand submission": "ಕೈಯಿಂದ ಸಲ್ಲಿಕೆ",

  "Satisfied": "ತೃಪ್ತಿಗೊಂಡಿದೆ",
  "Partially Satisfied": "ಭಾಗಶಃ ತೃಪ್ತಿಗೊಂಡಿದೆ",
  "Unsatisfied": "ಅತೃಪ್ತಿಗೊಂಡಿದೆ",
  "False Information": "ಸುಳ್ಳು ಮಾಹಿತಿ",
  "Incomplete Information": "ಅಪೂರ್ಣ ಮಾಹಿತಿ",
  "No Information": "ಯಾವುದೇ ಮಾಹಿತಿ ಇಲ್ಲ",

  "Application": "ಅರ್ಜಿ",
  "Acknowledgement": "ಸ್ವೀಕೃತಿ",
  "Reply": "ಉತ್ತರ",
  "FAA Order": "FAA ಆದೇಶ",
  "Second Appeal Order": "ಎರಡನೇ ಮೇಲ್ಮನವಿ ಆದೇಶ",
  "Higher Appeal Order": "ಮೇಲಿನ ಮೇಲ್ಮನವಿ ಆದೇಶ",

  "No reply within time": "ನಿಗದಿತ ಸಮಯದೊಳಗೆ ಉತ್ತರ ಬಂದಿಲ್ಲ",
  "Incomplete information": "ಅಪೂರ್ಣ ಮಾಹಿತಿ",
  "Misleading information": "ದಾರಿತಪ್ಪಿಸುವ ಮಾಹಿತಿ",
  "False information": "ಸುಳ್ಳು ಮಾಹಿತಿ",
  "Wrong denial": "ತಪ್ಪಾದ ನಿರಾಕರಣೆ",
  "Excessive fee": "ಅತಿಯಾದ ಶುಲ್ಕ",
  "Information transferred incorrectly": "ಮಾಹಿತಿಯನ್ನು ತಪ್ಪಾಗಿ ವರ್ಗಾಯಿಸಲಾಗಿದೆ",
  "No PIO details": "PIO ವಿವರಗಳಿಲ್ಲ",
  "No FAA details": "FAA ವಿವರಗಳಿಲ್ಲ",

  "No FAA order": "FAA ಆದೇಶ ಇಲ್ಲ",
  "Unsatisfactory FAA order": "ತೃಪ್ತಿಕರವಲ್ಲದ FAA ಆದೇಶ",
  "Continued denial": "ಮುಂದುವರಿದ ನಿರಾಕರಣೆ",
  "Penalty request": "ದಂಡದ ಮನವಿ",
  "Compensation request": "ಪರಿಹಾರದ ಮನವಿ",
  "Direction to disclose information": "ಮಾಹಿತಿ ಬಹಿರಂಗಪಡಿಸುವ ನಿರ್ದೇಶನ",

  "Chief Engineer": "ಮುಖ್ಯ ಇಂಜಿನಿಯರ್",
  "Superintending Engineer": "ಅಧೀಕ್ಷಕ ಇಂಜಿನಿಯರ್",
  "Executive Engineer": "ಕಾರ್ಯನಿರ್ವಾಹಕ ಇಂಜಿನಿಯರ್",
  "Assistant Executive Engineer": "ಸಹಾಯಕ ಕಾರ್ಯನಿರ್ವಾಹಕ ಇಂಜಿನಿಯರ್",
  "Assistant Engineer": "ಸಹಾಯಕ ಇಂಜಿನಿಯರ್",
  "Junior Engineer": "ಕಿರಿಯ ಇಂಜಿನಿಯರ್",
  "Ward Engineer": "ವಾರ್ಡ್ ಇಂಜಿನಿಯರ್",
  "Contractor": "ಗುತ್ತಿಗೆದಾರ",
  "Office Staff": "ಕಚೇರಿ ಸಿಬ್ಬಂದಿ",

  "CE": "ಮುಖ್ಯ ಇಂಜಿನಿಯರ್ (CE)",
  "SE": "ಅಧೀಕ್ಷಕ ಇಂಜಿನಿಯರ್ (SE)",
  "EE": "ಕಾರ್ಯನಿರ್ವಾಹಕ ಇಂಜಿನಿಯರ್ (EE)",
  "AEE": "ಸಹಾಯಕ ಕಾರ್ಯನಿರ್ವಾಹಕ ಇಂಜಿನಿಯರ್ (AEE)",
  "AE": "ಸಹಾಯಕ ಇಂಜಿನಿಯರ್ (AE)",
  "JE": "ಕಿರಿಯ ಇಂಜಿನಿಯರ್ (JE)",
  "Health Officer": "ಆರೋಗ್ಯ ಅಧಿಕಾರಿ",
  "Revenue Officer": "ಕಂದಾಯ ಅಧಿಕಾರಿ",
  "Assistant Revenue Officer": "ಸಹಾಯಕ ಕಂದಾಯ ಅಧಿಕಾರಿ",
  "Commissioner": "ಆಯುಕ್ತರು",
  "Special Commissioner": "ವಿಶೇಷ ಆಯುಕ್ತರು",

  "Lokayukta": "ಲೋಕಾಯುಕ್ತ",
  "ACB": "ಭ್ರಷ್ಟಾಚಾರ ನಿಗ್ರಹ ದಳ (ACB)",
  "Lokayukta / Legal": "ಲೋಕಾಯುಕ್ತ / ಕಾನೂನು",

  "BBMP": "BBMP ವಾರ್ಡ್‌ಗಳು",
  "GBA": "GBA ವಾರ್ಡ್‌ಗಳು",

  "Created": "ರಚಿಸಲಾಗಿದೆ",
  "Action Taken": "ಕ್ರಮ ಕೈಗೊಳ್ಳಲಾಗಿದೆ",
  "Site Visit": "ಸ್ಥಳ ಭೇಟಿ",
  "Photo Evidence": "ಫೋಟೋ ಸಾಕ್ಷ್ಯ",
  "Follow-up": "ಅನುಸರಣೆ",
  "Escalation": "ಆದ್ಯತೆ ಹೆಚ್ಚಳ",
  "Reminder": "ಜ್ಞಾಪನೆ",
  "Status Change": "ಸ್ಥಿತಿ ಬದಲಾವಣೆ",
  "Closure": "ಮುಕ್ತಾಯ",
  "Note": "ಟಿಪ್ಪಣಿ",

  "Phone Call": "ಫೋನ್ ಕರೆ",
  "Letter": "ಪತ್ರ",
  "In Person": "ಖುದ್ದಾಗಿ",
  "Portal Update": "ಪೋರ್ಟಲ್ ನವೀಕರಣ",
  "Hearing": "ವಿಚಾರಣೆ",

  "Follow-up with engineer": "ಇಂಜಿನಿಯರ್ ಜೊತೆ ಅನುಸರಣೆ",
  "Follow-up with ward office": "ವಾರ್ಡ್ ಕಚೇರಿ ಜೊತೆ ಅನುಸರಣೆ",
  "Escalate to AEE": "AEE ಗೆ ಆದ್ಯತೆ ಹೆಚ್ಚಿಸಿ",
  "Escalate to EE": "EE ಗೆ ಆದ್ಯತೆ ಹೆಚ್ಚಿಸಿ",
  "Escalate to SE": "SE ಗೆ ಆದ್ಯತೆ ಹೆಚ್ಚಿಸಿ",
  "Escalate to CE": "CE ಗೆ ಆದ್ಯತೆ ಹೆಚ್ಚಿಸಿ",
  "File RTI": "ಮಾಹಿತಿ ಹಕ್ಕು ಅರ್ಜಿ ಸಲ್ಲಿಸಿ",
  "Upload reply": "ಉತ್ತರ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ",
  "Verify site action": "ಸ್ಥಳ ಕ್ರಮವನ್ನು ಪರಿಶೀಲಿಸಿ",
  "Close complaint review": "ದೂರು ಪರಿಶೀಲನೆ ಮುಚ್ಚಿ",

  "Original complaint copy": "ಮೂಲ ದೂರು ಪ್ರತಿ",
  "Complaint acknowledgement": "ದೂರು ಸ್ವೀಕೃತಿ",
  "Department reply": "ಇಲಾಖೆಯ ಉತ್ತರ",
  "Engineer reply": "ಇಂಜಿನಿಯರ್ ಉತ್ತರ",
  "Action Taken Report": "ಕ್ರಮ ವರದಿ",
  "Site inspection note": "ಸ್ಥಳ ಪರಿಶೀಲನಾ ಟಿಪ್ಪಣಿ",
  "Postal receipt": "ಅಂಚೆ ರಸೀದಿ",
  "Email printout": "ಇಮೇಲ್ ಪ್ರಿಂಟ್‌ಔಟ್",
  "WhatsApp screenshot": "WhatsApp ಸ್ಕ್ರೀನ್‌ಶಾಟ್",
  "Portal screenshot": "ಪೋರ್ಟಲ್ ಸ್ಕ್ರೀನ್‌ಶಾಟ್",
  "Work order copy": "ಕಾರ್ಯಾದೇಶ ಪ್ರತಿ",
  "Estimate copy": "ಅಂದಾಜು ಪ್ರತಿ",
  "Bill copy": "ಬಿಲ್ ಪ್ರತಿ",
  "MB Book copy": "MB ಪುಸ್ತಕ ಪ್ರತಿ",
  "RTI related document": "ಮಾಹಿತಿ ಹಕ್ಕು ಸಂಬಂಧಿತ ದಾಖಲೆ",
  "Appeal related document": "ಮೇಲ್ಮನವಿ ಸಂಬಂಧಿತ ದಾಖಲೆ",
  "Site photo before work": "ಕೆಲಸಕ್ಕೂ ಮೊದಲಿನ ಸ್ಥಳ ಫೋಟೋ",
  "Site photo after work": "ಕೆಲಸದ ನಂತರದ ಸ್ಥಳ ಫೋಟೋ",
  "Tender notice": "ಟೆಂಡರ್ ಸೂಚನೆ",
  "Technical bid": "ತಾಂತ್ರಿಕ ಬಿಡ್",
  "Financial bid": "ಆರ್ಥಿಕ ಬಿಡ್",
  "Contractor registration certificate": "ಗುತ್ತಿಗೆದಾರ ನೋಂದಣಿ ಪ್ರಮಾಣಪತ್ರ",
  "Insurance policy": "ವಿಮಾ ಪಾಲಿಸಿ",
  "KW-4 agreement": "KW-4 ಒಪ್ಪಂದ",
  "Technical Sanction": "ತಾಂತ್ರಿಕ ಮಂಜೂರಾತಿ",
  "Schedule B": "ಶೆಡ್ಯೂಲ್ B",
  "Modified Schedule B": "ಪರಿಷ್ಕೃತ ಶೆಡ್ಯೂಲ್ B",
  "Royalty challan": "ರಾಯಧನ ಚಲನ್",
  "Trip sheet / weighbridge": "ಟ್ರಿಪ್ ಶೀಟ್ / ತೂಕದ ಸೇತುವೆ",
  "Quality test report": "ಗುಣಮಟ್ಟ ಪರೀಕ್ಷಾ ವರದಿ",
  "Geo-tagged site photo": "ಜಿಯೋ-ಟ್ಯಾಗ್ ಮಾಡಿದ ಸ್ಥಳ ಫೋಟೋ",
  "Completion certificate": "ಪೂರ್ಣಗೊಳಿಸುವಿಕೆ ಪ್ರಮಾಣಪತ್ರ",
  "Defect liability / handover": "ದೋಷ ಹೊಣೆಗಾರಿಕೆ / ಹಸ್ತಾಂತರ",
  "C&D waste / dumping-yard / salvage register": "C&D ತ್ಯಾಜ್ಯ / ಡಂಪಿಂಗ್ ಯಾರ್ಡ್ / ಸಾಲ್ವೇಜ್ ರಿಜಿಸ್ಟರ್",
  "Other evidence": "ಇತರೆ ಸಾಕ್ಷ್ಯ",

  "high": "ಹೆಚ್ಚಿನ ವಿಶ್ವಾಸಾರ್ಹತೆ",
  "medium": "ಪರಿಶೀಲನೆ ಅಗತ್ಯವಿದೆ",
  "low": "ಕಡಿಮೆ ವಿಶ್ವಾಸಾರ್ಹತೆ",
  "none": "ಹೊಂದಾಣಿಕೆ ಇಲ್ಲ",

  "bill_stop": "ಬಿಲ್ ತಡೆ ಪತ್ರ",
  "lokayukta": "ಲೋಕಾಯುಕ್ತ ಪತ್ರ",
  "rti": "ಮಾಹಿತಿ ಹಕ್ಕು ಪತ್ರ",
  "bilingual_summary": "ದ್ವಿಭಾಷಾ ಸಾರಾಂಶ",

  "followup_letter": "ಅನುಸರಣಾ ಪತ್ರ",
  "whatsapp": "ಅಧಿಕಾರಿಗೆ WhatsApp ಸಂದೇಶ",
  "escalation_letter": "ಆದ್ಯತಾ ಹೆಚ್ಚಳ ಪತ್ರ (ಮುಂದಿನ ಅಧಿಕಾರಿ)",
  "reminder_email": "ಜ್ಞಾಪನಾ ಇಮೇಲ್",
  "rti_from_complaint": "ಈ ದೂರಿನ ಆಧಾರದ ಮೇಲೆ ಮಾಹಿತಿ ಹಕ್ಕು ಅರ್ಜಿ",
  "action_taken_request": "ಕ್ರಮ ವರದಿ ಕೋರಿಕೆ",
  "site_inspection_request": "ಸ್ಥಳ ಪರಿಶೀಲನಾ ಕೋರಿಕೆ",
  "lokayukta_complaint": "ಲೋಕಾಯುಕ್ತ ದೂರು",
  "chief_secretary_letter": "ಮುಖ್ಯ ಕಾರ್ಯದರ್ಶಿ / UDD ಪತ್ರ",
  "cm_office_letter": "ಮುಖ್ಯಮಂತ್ರಿಗಳ ಕಚೇರಿ ಪತ್ರ",
  "records_preservation": "ದಾಖಲೆ ಸಂರಕ್ಷಣಾ ಕೋರಿಕೆ",
  "counter_reply": "ಇಲಾಖೆಯ ಉತ್ತರಕ್ಕೆ ಪ್ರತಿ-ಉತ್ತರ",
  "clarification_request": "ಇಲಾಖೆಗೆ ಸ್ಪಷ್ಟೀಕರಣ ಕೋರಿಕೆ",
  "reminder_letter": "ಜ್ಞಾಪನಾ ಪತ್ರ (ಉತ್ತರ ಬಂದಿಲ್ಲ)",
  "legal_notice": "ಕಾನೂನು ನೋಟಿಸ್ (ಉತ್ತರಿಸಲು/ಕ್ರಮಕ್ಕೆ ವಿಫಲತೆ)",

  "English": "ಇಂಗ್ಲಿಷ್",
  "Kannada": "ಕನ್ನಡ",
  "Bilingual": "ದ್ವಿಭಾಷಾ",

  "By hand (acknowledged copy)": "ಕೈಯಿಂದ (ಸ್ವೀಕೃತಿ ಪ್ರತಿಯೊಂದಿಗೆ)",
  "RPAD / Speed post": "RPAD / ಸ್ಪೀಡ್ ಪೋಸ್ಟ್",
  "PGR / Sahaaya portal": "PGR / ಸಹಾಯ ಪೋರ್ಟಲ್",
};

registerNamespace("workflow", { en, kn } as NamespaceDictionaries);
