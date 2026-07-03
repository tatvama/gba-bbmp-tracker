import "server-only";
import type { RecommendationAction } from "./types";

export const ACTION_LABELS: Record<RecommendationAction, string> = {
  generate_reminder: "Generate a reminder letter",
  escalate: "Escalate to the next authority",
  counter_reply: "Send a counter-reply",
  wait: "Continue waiting",
  close: "Close the complaint",
  upload_evidence: "Upload supporting evidence",
  review: "Manual review needed",
  none: "No action needed",
  request_clarification: "Request clarification from the department",
  convert_to_rti: "Convert to an RTI request",
};

/**
 * Kannada equivalents of the action labels. The advisor panel is always shown in
 * Kannada, so these are the fallback recommendation labels when the AI output
 * omits its own (Kannada) label or when the AI pass is unavailable.
 */
export const ACTION_LABELS_KN: Record<RecommendationAction, string> = {
  generate_reminder: "ಜ್ಞಾಪನಾ ಪತ್ರ ಕಳುಹಿಸಿ",
  escalate: "ಮುಂದಿನ ಪ್ರಾಧಿಕಾರಕ್ಕೆ ಉನ್ನತೀಕರಿಸಿ",
  counter_reply: "ಪ್ರತ್ಯುತ್ತರ ಕಳುಹಿಸಿ",
  wait: "ಕಾಯುವುದನ್ನು ಮುಂದುವರಿಸಿ",
  close: "ದೂರನ್ನು ಮುಚ್ಚಿ",
  upload_evidence: "ಪೂರಕ ದಾಖಲೆಗಳನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ",
  review: "ಹಸ್ತಚಾಲಿತ ಪರಿಶೀಲನೆ ಅಗತ್ಯ",
  none: "ಯಾವುದೇ ಕ್ರಮ ಅಗತ್ಯವಿಲ್ಲ",
  request_clarification: "ಇಲಾಖೆಯಿಂದ ಸ್ಪಷ್ಟೀಕರಣ ಕೋರಿ",
  convert_to_rti: "ಆರ್‌ಟಿಐ ವಿನಂತಿಗೆ ಪರಿವರ್ತಿಸಿ",
};
