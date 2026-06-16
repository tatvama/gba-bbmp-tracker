/** Shared, framework-free types for the forensic bill-audit engine. */

export interface BillLineItem {
  slNo?: string | null;
  description: string;
  unit?: string | null;
  qty: number | null;
  rate: number | null;
  amount: number | null;
  srCode?: string | null;
}
export interface BillTax {
  name: string;
  pct: number | null;
  amount: number | null;
}
export interface BillDeduction {
  name: string;
  amount: number | null;
}

export interface StructuredBill {
  billType?: string | null;
  billNo?: string | null;
  billDate?: string | null;
  workOrderRef?: string | null;
  workOrderDate?: string | null;
  sanctionedAmount?: number | null;
  contractor?: string | null;
  lineItems: BillLineItem[];
  taxes: BillTax[];
  deductions: BillDeduction[];
  subTotal?: number | null;
  grandTotal?: number | null;
  netPayable?: number | null;
  /** Names of statutory recoveries the bill shows (royalty, TDS, etc.). */
  recoveriesPresent?: string[];
  confidence?: "High" | "Medium" | "Low";
  needsManualReview?: boolean;
}

export type Severity = "High" | "Medium" | "Low";

export interface BillFinding {
  code: string;
  title: string;
  severity: Severity;
  detail: string;
  expected?: string;
  actual?: string;
}
