/**
 * Amount calculations for the BBMP work-search feature. Always derived at
 * read time — bbmp_works stores sanctioned_amount/paid_amount only, never a
 * redundant pending_amount/financial_progress column.
 */

export function calculatePendingAmount(
  sanctionedAmount: number | null | undefined,
  paidAmount: number | null | undefined,
): number {
  const sanctioned = sanctionedAmount ?? 0;
  const paid = paidAmount ?? 0;
  return Math.max(sanctioned - paid, 0);
}

/** Percentage paid against sanctioned amount, rounded to 2dp, or null when
 *  there's no sanctioned amount to measure against. */
export function calculateFinancialProgress(
  paidAmount: number | null | undefined,
  sanctionedAmount: number | null | undefined,
): number | null {
  if (!sanctionedAmount || sanctionedAmount <= 0) return null;
  const paid = paidAmount ?? 0;
  return Math.round((paid / sanctionedAmount) * 100 * 100) / 100;
}
