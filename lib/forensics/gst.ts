/**
 * GST rate on government works contracts (PURE, date-sensitive).
 * The GST 2.0 reform (effective 2025-09-22) moved most works contracts to 18%.
 * Before that date the general WC rate was 12%, and predominantly-earthwork
 * (>75%) contracts were 5%. Never assume a flat 18% — branch on the bill date.
 */
import { parseIndianDate } from "./date-parse";
import { GST_2_0_DATE, GST_WC_CURRENT, GST_WC_PRE, GST_WC_EARTHWORK_PRE } from "../constants";

export function expectedGstPct(
  billDate: string | null,
  earthworkSharePct?: number,
): { pct: number; basis: string } {
  const d = parseIndianDate(billDate);
  if (!d) {
    return { pct: GST_WC_CURRENT, basis: "bill date unknown — current 18% assumed; verify against the bill" };
  }
  const cutover = parseIndianDate(GST_2_0_DATE)!;
  if (d.getTime() >= cutover.getTime()) {
    return { pct: GST_WC_CURRENT, basis: `on/after ${GST_2_0_DATE} (GST 2.0) — works contract 18%` };
  }
  if (typeof earthworkSharePct === "number" && earthworkSharePct > 75) {
    return { pct: GST_WC_EARTHWORK_PRE, basis: `before ${GST_2_0_DATE}, earthwork share ${earthworkSharePct}% (>75%) — 5%` };
  }
  return { pct: GST_WC_PRE, basis: `before ${GST_2_0_DATE} — general works contract 12%` };
}
