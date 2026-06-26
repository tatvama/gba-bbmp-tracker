import { formatDate } from "@/lib/format";

export interface GovDocumentData {
  title: string;
  recipientName?: string;
  recipientDesignation?: string;
  recipientAddress?: string;
  senderName?: string;
  senderAddress?: string;
  senderPhone?: string;
  senderEmail?: string;
  date: string;
  /** Document's own tracking identifier (e.g. RTI-JMF1M). Rendered near the Date in the header. */
  referenceNumber?: string;
  subject?: string;
  /** Citation line in the Subject section (e.g. "RTI Reg No: X, Date of Original: Y"). */
  reference?: string;
  salutation?: string;
  paragraphs: string[];
  numberedListLabel?: string;
  numberedList?: string[];
  closing?: string;
}

export type DocumentMapper = (record: any, context?: any) => GovDocumentData;

class DocumentRegistry {
  private mappers = new Map<string, DocumentMapper>();

  register(docType: string, mapper: DocumentMapper) {
    this.mappers.set(docType, mapper);
  }

  map(docType: string, record: any, context?: any): GovDocumentData {
    const mapper = this.mappers.get(docType);
    if (!mapper) {
      throw new Error(`No mapper registered for document type: ${docType}`);
    }
    return mapper(record, context);
  }
}

export const documentRegistry = new DocumentRegistry();

// -------------------------------------------------------------
// Register Built-in Mappers
// -------------------------------------------------------------

// 1. RTI Application Mapper
documentRegistry.register("rti", (record: any) => {
  const recipientAddrParts = [
    record.department,
    record.public_authority,
    record.office_address,
  ].filter(Boolean);

  const listLines: string[] = [];
  if (record.info_requested) {
    // Split by newlines, trim and filter out blank lines
    const lines = record.info_requested.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
    for (const line of lines) {
      // Remove leading numbers/bullets if any to format clean list items
      const cleanLine = line.replace(/^\(?[0-9]+\)?[.:\-\s]*/, "").trim();
      if (cleanLine) {
        listLines.push(cleanLine);
      }
    }
  }

  const paragraphs = [
    "I hereby request you to provide the following information under Section 6(1) of the Right to Information Act, 2005, concerning your office / department:"
  ];

  // Add fee payment detail
  let feePara = "";
  if (record.application_fee_paid) {
    feePara = `I have paid the prescribed application fee of Rs. 10/- via ${record.fee_mode || "Cash/Demand Draft/Postal Order"}`;
    if (record.postal_receipt_no) {
      feePara += ` (Receipt/Ref No: ${record.postal_receipt_no}).`;
    } else {
      feePara += ".";
    }
  } else {
    feePara = "I have paid the prescribed application fee of Rs. 10/-.";
  }
  paragraphs.push(feePara);

  // Add standard citizen declaration
  paragraphs.push(
    "I hereby declare that I am a citizen of India and this application is made in my capacity as an Indian citizen.",
    "Please send the requested information to the applicant's address listed above via Registered Post or Speed Post."
  );

  return {
    title: "APPLICATION UNDER SECTION 6(1) OF THE RTI ACT, 2005",
    recipientName: record.pio_name || "The Public Information Officer",
    recipientDesignation: record.pio_designation || "Public Information Officer",
    recipientAddress: recipientAddrParts.join("\n"),
    senderName: record.applicant_name || "Applicant",
    senderAddress: record.applicant_address || "",
    senderPhone: record.applicant_phone || undefined,
    senderEmail: record.applicant_email || undefined,
    date: record.date_filed ? formatDate(record.date_filed) : formatDate(new Date().toISOString()),
    referenceNumber: record.internal_ref || undefined,
    subject: record.subject || "Request for Information under Right to Information Act, 2005",
    salutation: "Dear Sir / Madam,",
    paragraphs,
    numberedListLabel: "Details of Information Sought:",
    numberedList: listLines.length > 0 ? listLines : undefined,
    closing: "Thanking you,",
  };
});

// 2. First Appeal Mapper
documentRegistry.register("first_appeal", (record: any, context?: any) => {
  const rtiRecord = context?.rti;
  if (!rtiRecord) {
    throw new Error("First Appeal mapping requires the original RTI record in context");
  }

  const recipientAddrParts = [
    rtiRecord.department,
    rtiRecord.public_authority,
    rtiRecord.office_address,
  ].filter(Boolean);

  const paragraphs = [
    "I am filing this First Appeal under Section 19(1) of the Right to Information Act, 2005, as I am aggrieved by the decision/inaction of the Public Information Officer (PIO)."
  ];

  if (record.grounds && record.grounds.length > 0) {
    paragraphs.push(`Grounds of Appeal: ${record.grounds.join(", ")}.`);
  }

  if (record.grounds_detail) {
    // Add detailed explanation split by paragraph blocks
    const detailParas = record.grounds_detail
      .split(/\r?\n\r?\n/)
      .map((p: string) => p.trim())
      .filter(Boolean);
    paragraphs.push(...detailParas);
  }

  paragraphs.push(
    "Prayer / Relief Sought: I pray that the First Appellate Authority direct the PIO to provide complete, correct, and certified copies of the information requested in the original RTI application at the earliest."
  );

  // Reference line listing date of original application and registration number
  const refParts = [
    rtiRecord.online_reg_no ? `RTI Registration No: ${rtiRecord.online_reg_no}` : null,
    rtiRecord.date_filed ? `Date of RTI Application: ${formatDate(rtiRecord.date_filed)}` : null,
  ].filter(Boolean);

  return {
    title: "FIRST APPEAL UNDER SECTION 19(1) OF THE RTI ACT, 2005",
    recipientName: record.faa_name || "The First Appellate Authority",
    recipientDesignation: record.faa_designation || "First Appellate Authority",
    recipientAddress: recipientAddrParts.join("\n"),
    senderName: rtiRecord.applicant_name || "Appellant",
    senderAddress: rtiRecord.applicant_address || "",
    senderPhone: rtiRecord.applicant_phone || undefined,
    senderEmail: rtiRecord.applicant_email || undefined,
    date: record.date_filed ? formatDate(record.date_filed) : formatDate(new Date().toISOString()),
    referenceNumber: record.internal_ref || rtiRecord.internal_ref || undefined,
    subject: rtiRecord.subject ? `First Appeal against RTI: ${rtiRecord.subject}` : "First Appeal under Section 19(1) of the RTI Act, 2005",
    reference: refParts.length > 0 ? refParts.join(", ") : undefined,
    salutation: "Dear Sir / Madam,",
    paragraphs,
    closing: "Thanking you,",
  };
});

// 3. Second Appeal Mapper
documentRegistry.register("second_appeal", (record: any, context?: any) => {
  const rtiRecord = context?.rti;
  const firstAppealRecord = context?.firstAppeal;
  if (!rtiRecord) {
    throw new Error("Second Appeal mapping requires the original RTI record in context");
  }

  const paragraphs = [
    "I am filing this Second Appeal under Section 19(3) of the Right to Information Act, 2005, against the decision / lack of decision of the First Appellate Authority (FAA)."
  ];

  if (record.reason && record.reason.length > 0) {
    paragraphs.push(`Reasons for Second Appeal: ${record.reason.join(", ")}.`);
  }

  if (record.reason_detail) {
    const detailParas = record.reason_detail
      .split(/\r?\n\r?\n/)
      .map((p: string) => p.trim())
      .filter(Boolean);
    paragraphs.push(...detailParas);
  }

  paragraphs.push(
    "Prayer / Relief Sought: I pray that the Hon'ble Commission direct the Public Authority to provide the requested information and impose appropriate penalties on the defaulting officers under Section 20 of the RTI Act."
  );

  const refParts = [
    rtiRecord.online_reg_no ? `RTI Registration No: ${rtiRecord.online_reg_no}` : null,
    firstAppealRecord?.date_filed ? `Date of First Appeal: ${formatDate(firstAppealRecord.date_filed)}` : null,
    record.diary_number ? `First Appeal Diary No: ${record.diary_number}` : null,
  ].filter(Boolean);

  return {
    title: "SECOND APPEAL UNDER SECTION 19(3) OF THE RTI ACT, 2005",
    recipientName: record.commission_name || "The State Information Commission",
    recipientDesignation: "State Information Commissioner / Registrar",
    recipientAddress: "Information Commission Office",
    senderName: rtiRecord.applicant_name || "Appellant",
    senderAddress: rtiRecord.applicant_address || "",
    senderPhone: rtiRecord.applicant_phone || undefined,
    senderEmail: rtiRecord.applicant_email || undefined,
    date: record.filing_date ? formatDate(record.filing_date) : formatDate(new Date().toISOString()),
    referenceNumber: record.internal_ref || rtiRecord.internal_ref || undefined,
    subject: rtiRecord.subject ? `Second Appeal against RTI: ${rtiRecord.subject}` : "Second Appeal under Section 19(3) of the RTI Act, 2005",
    reference: refParts.length > 0 ? refParts.join(", ") : undefined,
    salutation: "Hon'ble Information Commissioner,",
    paragraphs,
    closing: "Thanking you,",
  };
});

// 4. Plain Text Draft Mapper
documentRegistry.register("draft", (record: any) => {
  const text = record.text || "";
  const lines = text.split(/\r?\n\r?\n/).map((p: string) => p.trim()).filter(Boolean);

  return {
    title: record.title || "GOVERNMENT DOCUMENT DRAFT",
    date: formatDate(new Date().toISOString()),
    paragraphs: lines,
  };
});
