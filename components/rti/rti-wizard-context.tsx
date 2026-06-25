import * as React from "react";

export interface RtiFormData {
  subject: string;
  category: string;
  priority: string;
  status: string;
  filingMode: string;
  infoRequested: string;
  isLifeLiberty: boolean;
  facts: string;
  
  // Jurisdiction
  wardType: string;
  corporationId: string;
  divisionId: string;
  engSubDivisionId: string;
  wardId: string;
  contactId: string;
  
  // Authority & PIO
  publicAuthority: string;
  department: string;
  officeAddress: string;
  pioName: string;
  pioDesignation: string;
  pioPhone: string;
  pioEmail: string;
  faaName: string;
  faaDesignation: string;
  faaPhone: string;
  faaEmail: string;
  
  // Applicant
  applicantName: string;
  applicantPhone: string;
  applicantEmail: string;
  applicantAddress: string;
  
  // Filing
  dateDrafted: string;
  dateFiled: string;
  dateReceived: string;
  replyDate: string;
  postalReceiptNo: string;
  onlineRegNo: string;
  feeMode: string;
  satisfactionStatus: string;
  applicationFeePaid: boolean;
  reminderEnabled: boolean;

  // Workflow / Reply / Notes
  replySummary: string;
  nextAction: string;
  nextActionDate: string;
  tags: string;
  publicNotes: string;
  internalNotes: string;
}

export function mapRtiToFormData(initial?: any): RtiFormData {
  if (!initial) {
    return {
      subject: "",
      category: "",
      priority: "Medium",
      status: "Draft",
      filingMode: "",
      infoRequested: "",
      isLifeLiberty: false,
      facts: "",
      wardType: "",
      corporationId: "",
      divisionId: "",
      engSubDivisionId: "",
      wardId: "",
      contactId: "",
      publicAuthority: "",
      department: "",
      officeAddress: "",
      pioName: "",
      pioDesignation: "",
      pioPhone: "",
      pioEmail: "",
      faaName: "",
      faaDesignation: "",
      faaPhone: "",
      faaEmail: "",
      applicantName: "",
      applicantPhone: "",
      applicantEmail: "",
      applicantAddress: "",
      dateDrafted: "",
      dateFiled: "",
      dateReceived: "",
      replyDate: "",
      postalReceiptNo: "",
      onlineRegNo: "",
      feeMode: "",
      satisfactionStatus: "",
      applicationFeePaid: false,
      reminderEnabled: true,
      replySummary: "",
      nextAction: "",
      nextActionDate: "",
      tags: "",
      publicNotes: "",
      internalNotes: "",
    };
  }

  return {
    subject: initial.subject ?? "",
    category: initial.category ?? "",
    priority: initial.priority ?? "Medium",
    status: initial.status ?? "Draft",
    filingMode: initial.filing_mode ?? "",
    infoRequested: initial.info_requested ?? "",
    isLifeLiberty: initial.is_life_liberty ?? false,
    facts: "",
    wardType: initial.ward_type ?? "",
    corporationId: initial.corporation_id ?? "",
    divisionId: initial.ward_type === "GBA" ? (initial.gba_division ?? "") : (initial.division_id ?? ""),
    engSubDivisionId: initial.ward_type === "GBA" ? (initial.gba_subdivision ?? "") : (initial.eng_subdivision_id ?? ""),
    wardId: initial.ward_type === "GBA" ? (initial.gba_ward_id ?? "") : (initial.ward_id ?? ""),
    contactId: initial.contact_id ?? "",
    publicAuthority: initial.public_authority ?? "",
    department: initial.department ?? "",
    officeAddress: initial.office_address ?? "",
    pioName: initial.pio_name ?? "",
    pioDesignation: initial.pio_designation ?? "",
    pioPhone: initial.pio_phone ?? "",
    pioEmail: initial.pio_email ?? "",
    faaName: initial.faa_name ?? "",
    faaDesignation: initial.faa_designation ?? "",
    faaPhone: initial.faa_phone ?? "",
    faaEmail: initial.faa_email ?? "",
    applicantName: initial.applicant_name ?? "",
    applicantPhone: initial.applicant_phone ?? "",
    applicantEmail: initial.applicant_email ?? "",
    applicantAddress: initial.applicant_address ?? "",
    dateDrafted: initial.date_drafted ?? "",
    dateFiled: initial.date_filed ?? "",
    dateReceived: initial.date_received ?? "",
    replyDate: initial.reply_date ?? "",
    postalReceiptNo: initial.postal_receipt_no ?? "",
    onlineRegNo: initial.online_reg_no ?? "",
    feeMode: initial.fee_mode ?? "",
    satisfactionStatus: initial.satisfaction_status ?? "",
    applicationFeePaid: initial.application_fee_paid ?? false,
    reminderEnabled: initial.reminder_enabled ?? true,
    replySummary: initial.reply_summary ?? "",
    nextAction: initial.next_action ?? "",
    nextActionDate: initial.next_action_date ?? "",
    tags: initial.tags?.join(", ") ?? "",
    publicNotes: initial.public_notes ?? "",
    internalNotes: initial.internal_notes ?? "",
  };
}

interface RtiWizardContextType {
  formData: RtiFormData;
  updateField: <K extends keyof RtiFormData>(name: K, value: RtiFormData[K]) => void;
  setFormData: React.Dispatch<React.SetStateAction<RtiFormData>>;
}

const RtiWizardContext = React.createContext<RtiWizardContextType | undefined>(undefined);

export function RtiWizardProvider({
  children,
  initial,
}: {
  children: React.ReactNode;
  initial?: any;
}) {
  const [formData, setFormData] = React.useState<RtiFormData>(() => mapRtiToFormData(initial));

  const updateField = React.useCallback(<K extends keyof RtiFormData>(name: K, value: RtiFormData[K]) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }, []);

  return (
    <RtiWizardContext.Provider value={{ formData, updateField, setFormData }}>
      {children}
    </RtiWizardContext.Provider>
  );
}

export function useRtiWizard() {
  const ctx = React.useContext(RtiWizardContext);
  if (ctx === undefined) {
    throw new Error("useRtiWizard must be used within an RtiWizardProvider");
  }
  return ctx;
}
