/**
 * Reusable placeholder replacement engine.
 * Supports case-insensitivity, variable whitespace matching, and custom value resolvers.
 */

export interface PlaceholderMapping {
  placeholder: string; // e.g. "[PUBLIC AUTHORITY]"
  fieldKey: string;    // e.g. "publicAuthority"
  resolveValue?: (data: any) => string; // Optional custom value resolver
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    // YYYY-MM-DD to DD/MM/YYYY
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Standard placeholder mappings for RTI documents (applications, appeals, etc.).
 */
export const RTI_PLACEHOLDER_MAPPINGS: PlaceholderMapping[] = [
  { placeholder: "[PUBLIC AUTHORITY]", fieldKey: "publicAuthority" },
  { placeholder: "[ADDRESS OF PUBLIC AUTHORITY]", fieldKey: "officeAddress" },
  { placeholder: "[PIO NAME]", fieldKey: "pioName" },
  { placeholder: "[PIO DESIGNATION]", fieldKey: "pioDesignation" },
  { placeholder: "[FAA NAME]", fieldKey: "faaName" },
  { placeholder: "[FAA DESIGNATION]", fieldKey: "faaDesignation" },
  { placeholder: "[APPLICANT NAME]", fieldKey: "applicantName" },
  { placeholder: "[APPLICANT'S ADDRESS]", fieldKey: "applicantAddress" },
  { placeholder: "[APPLICANT ADDRESS]", fieldKey: "applicantAddress" },
  { placeholder: "[APPLICANT'S CONTACT NUMBER]", fieldKey: "applicantPhone" },
  { placeholder: "[APPLICANT CONTACT NUMBER]", fieldKey: "applicantPhone" },
  { placeholder: "[APPLICANT'S EMAIL ADDRESS]", fieldKey: "applicantEmail" },
  { placeholder: "[APPLICANT EMAIL ADDRESS]", fieldKey: "applicantEmail" },
  { placeholder: "[APPLICANT EMAIL]", fieldKey: "applicantEmail" },
  {
    placeholder: "[DATE OF APPLICATION]",
    fieldKey: "dateFiled",
    resolveValue: (data: any) => {
      let dateVal = data.dateFiled || data.date_filed;
      if (dateVal) {
        return formatDate(dateVal);
      }
      // If date is missing, default to today's date formatted to DD/MM/YYYY
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, "0");
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const yyyy = today.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
  }
];

/**
 * Replaces placeholders in a given template text based on mapped form data values.
 * Only replaces placeholders for which a value exists in the data object.
 * Matching is case-insensitive and resilient to variable whitespace.
 */
export function replacePlaceholdersGeneric(
  text: string,
  data: Record<string, any>,
  mappings: PlaceholderMapping[]
): string {
  if (!text) return text;
  let result = text;

  for (const mapping of mappings) {
    let value = "";
    if (mapping.resolveValue) {
      value = mapping.resolveValue(data);
    } else {
      value = String(data[mapping.fieldKey] ?? "");
    }

    if (value && value.trim()) {
      // Escape brackets and special characters
      let escaped = mapping.placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      // Allow flexible whitespace: spaces in placeholder matches any whitespace (\s+)
      escaped = escaped.replace(/\s+/g, "\\s+");
      // Allow optional spaces inside brackets: [PUBLIC AUTHORITY] matches [ PUBLIC AUTHORITY ]
      escaped = escaped.replace(/^\\\[/, "\\[\\s*").replace(/\\\]$/, "\\s*\\]");
      
      const regex = new RegExp(escaped, "gi");
      result = result.replace(regex, value.trim());
    }
  }

  return result;
}
