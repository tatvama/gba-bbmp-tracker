"use client";

/**
 * Export an array of flat records to CSV or XLSX (SheetJS). Client-side download.
 * `xlsx` (~2.5MB) is dynamically imported here so it's only fetched when a user
 * actually triggers an export, instead of being bundled into every page that
 * merely offers an export button.
 */
export async function exportRows(
  rows: Record<string, unknown>[],
  fileBase: string,
  format: "csv" | "xlsx",
) {
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.json_to_sheet(rows);
  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    download(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `${fileBase}.csv`);
    return;
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
  const out = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  download(
    new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${fileBase}.xlsx`,
  );
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
