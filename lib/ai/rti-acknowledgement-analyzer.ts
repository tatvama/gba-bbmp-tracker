import "server-only";
import { generateVision } from "./provider";

export interface ExtractedField {
  value?: string;
  page?: number;
}

export interface VisualElementItem {
  name: string;
  page?: number;
}

export interface RtiAcknowledgementAnalysis {
  documentType: string;
  extractedInfo: {
    /** The reference / application number extracted from the document. */
    applicationNumber?: ExtractedField;
  };
  visualElements: VisualElementItem[];
  verifications: {
    referenceNumberMatches: boolean;
    officialSealDetected: boolean;
  };
  confidenceScore: number;
  verificationSummary: string;
  recommendedAction:
    | "Ready to Mark as Filed"
    | "Manual Review Recommended"
    | "Reference Number Mismatch"
    | "Verification Failed";
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const ANALYZER_SYSTEM = `You are a document verifier for RTI (Right to Information) acknowledgements in India.

Inspect the provided scanned or photographed document and verify exactly two things:

1. REFERENCE NUMBER
   Find the application or reference number printed on the document.
   Look for patterns such as RTI-XXXXX, BBMP/RTI/ACK/YYYY/NNNNN, RTI/YYYY/NNNNN, ACK-NNNNN, or any unique identifier that identifies this RTI application.
   Compare it with the database reference number provided in the context.
   Set referenceNumberMatches to true only when the extracted value reasonably matches (exact, semantic, or partial prefix match).

2. OFFICIAL SEAL / STAMP
   Detect whether the document contains any of the following:
   - Official Round Seal
   - BBMP or government department seal
   - Receiving Stamp / Inward Stamp
   - Office Stamp
   - Attestation or authentication mark
   Set officialSealDetected to true if any official-looking seal or stamp is visibly present.

Do NOT verify or compare applicant name, department, public authority, filing date, officer name, address, or any other fields. You may note them in extractedInfo for display only, but they must NOT influence your recommendation or the verifications object.

Recommendation logic (apply deterministically — do not deviate):
  referenceNumberMatches=true  AND officialSealDetected=true  → "Ready to Mark as Filed"
  referenceNumberMatches=true  AND officialSealDetected=false → "Manual Review Recommended"
  referenceNumberMatches=false AND officialSealDetected=true  → "Reference Number Mismatch"
  referenceNumberMatches=false AND officialSealDetected=false → "Verification Failed"

Output STRICT JSON only — no markdown, no explanation outside the JSON:
{
  "documentType": "RTI Acknowledgement | Receipt | Office Copy | Letter | Unknown",
  "extractedInfo": {
    "applicationNumber": { "value": "extracted reference number here", "page": 1 }
  },
  "visualElements": [
    { "name": "Official Seal | Receiving Stamp | Office Stamp | etc.", "page": 1 }
  ],
  "verifications": {
    "referenceNumberMatches": true,
    "officialSealDetected": true
  },
  "confidenceScore": 90,
  "verificationSummary": "Concise 2-3 sentence explanation of what was found and why the recommendation was made.",
  "recommendedAction": "Ready to Mark as Filed | Manual Review Recommended | Reference Number Mismatch | Verification Failed"
}`;

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(
  ocrText: string,
  rti: { internalRef: string; subject?: string },
): string {
  return `RTI Database Context:
- Application / Internal Reference Number to match: "${rti.internalRef}"
${rti.subject ? `- Subject: "${rti.subject}"` : ""}

OCR-Extracted Text from Acknowledgement:
"""
${ocrText.slice(0, 15000)}
"""

Instructions:
1. Find the reference or application number in the document. Compare it with the database reference: "${rti.internalRef}".
2. Determine whether the document contains an official seal, stamp, or authentication mark.
3. Set both boolean flags in the verifications object, then select the matching recommendedAction.
4. Return the structured JSON only.`;
}

// ---------------------------------------------------------------------------
// Placeholder (AI not configured or parse failure)
// ---------------------------------------------------------------------------

function getPlaceholderResult(summary: string): RtiAcknowledgementAnalysis {
  return {
    documentType: "Unknown",
    extractedInfo: {},
    visualElements: [],
    verifications: {
      referenceNumberMatches: false,
      officialSealDetected: false,
    },
    confidenceScore: 0,
    verificationSummary: summary,
    recommendedAction: "Manual Review Recommended",
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function analyzeRtiAcknowledgement(params: {
  images: { buffer: Buffer; mimeType: string }[];
  ocrText: string;
  rti: {
    publicAuthority: string;
    department: string;
    applicantName: string;
    dateFiled: string;
    subject: string;
    internalRef: string;
  };
}): Promise<RtiAcknowledgementAnalysis> {
  const images = params.images.map((img) => ({
    mediaType: img.mimeType,
    dataBase64: img.buffer.toString("base64"),
  }));

  const result = await generateVision({
    system: ANALYZER_SYSTEM,
    prompt: buildPrompt(params.ocrText, {
      internalRef: params.rti.internalRef,
      subject: params.rti.subject,
    }),
    images,
    temperature: 0,
  });

  if (!result.ok || !result.text) {
    return getPlaceholderResult(result.error ?? "AI Verification failed to run");
  }

  try {
    const cleaned = result.text
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as Partial<RtiAcknowledgementAnalysis>;

    const visualElements = Array.isArray(parsed.visualElements)
      ? parsed.visualElements
      : [];

    // Derive verifications from the parsed booleans — always override recommendedAction
    // deterministically so the AI cannot produce an inconsistent result.
    const rawVerifications = parsed.verifications ?? {
      referenceNumberMatches: false,
      officialSealDetected: false,
    };

    const refMatch = rawVerifications.referenceNumberMatches === true;
    const sealDetected = rawVerifications.officialSealDetected === true;

    const verifications = { referenceNumberMatches: refMatch, officialSealDetected: sealDetected };

    let recommendedAction: RtiAcknowledgementAnalysis["recommendedAction"];
    if (refMatch && sealDetected) {
      recommendedAction = "Ready to Mark as Filed";
    } else if (refMatch && !sealDetected) {
      recommendedAction = "Manual Review Recommended";
    } else if (!refMatch && sealDetected) {
      recommendedAction = "Reference Number Mismatch";
    } else {
      recommendedAction = "Verification Failed";
    }

    const confidenceScore = parsed.confidenceScore ?? (
      refMatch && sealDetected ? 90
      : refMatch ? 65
      : sealDetected ? 50
      : 20
    );

    return {
      documentType: parsed.documentType || "Unknown",
      extractedInfo: parsed.extractedInfo ?? {},
      visualElements,
      verifications,
      confidenceScore,
      verificationSummary: parsed.verificationSummary || "No summary provided.",
      recommendedAction,
    };
  } catch (e) {
    console.error("[analyzeRtiAcknowledgement] Parsing failed", e);
    return getPlaceholderResult(
      "Failed to parse verification result from AI: " + result.text.slice(0, 200),
    );
  }
}
