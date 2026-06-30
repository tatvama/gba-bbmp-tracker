/**
 * PURE work-splitting / KTPP threshold-evasion detector (no I/O — unit-testable).
 *
 * Splitting one large work into several smaller awards to the SAME contractor in the
 * SAME division/year so each stays under a tender/approval threshold is a classic
 * Karnataka Transparency in Public Procurement (KTPP) evasion pattern. We flag, per
 * contractor+division+year, when the COMBINED value crosses a threshold that no single
 * job reaches — a documented suspicion requiring enquiry, never an accusation.
 */

export interface WorkSplitJob {
  jobNumber: string;
  contractor: string | null;
  division: string | null;
  year: string | null;
  amount: number | null;
}

export interface WorkSplitFinding {
  contractor: string;
  division: string | null;
  year: string | null;
  jobNumbers: string[];
  total: number;
  maxSingle: number;
  thresholdCrossed: number;
  note: string;
}

/** Common KTPP / approval thresholds in ₹ (cautious, generic; tune as needed). */
export const DEFAULT_KTPP_THRESHOLDS = [50_000, 100_000, 500_000, 1_000_000, 5_000_000, 20_000_000];

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function detectWorkSplitting(
  jobs: WorkSplitJob[],
  opts?: { thresholds?: number[] },
): WorkSplitFinding[] {
  const thresholds = (opts?.thresholds ?? DEFAULT_KTPP_THRESHOLDS).slice().sort((a, b) => a - b);
  const groups = new Map<string, WorkSplitJob[]>();
  for (const j of jobs) {
    if (!j.contractor) continue;
    const key = `${j.contractor}||${j.division ?? ""}||${j.year ?? ""}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(j);
  }

  const findings: WorkSplitFinding[] = [];
  for (const group of groups.values()) {
    const withAmt = group.filter((g) => typeof g.amount === "number" && (g.amount as number) > 0);
    if (withAmt.length < 2) continue;
    const amounts = withAmt.map((g) => g.amount as number);
    const total = Math.round(amounts.reduce((s, n) => s + n, 0) * 100) / 100;
    const maxSingle = Math.max(...amounts);
    // The combined value crosses a threshold that NO single job reaches.
    const crossed = thresholds.find((t) => total >= t && maxSingle < t);
    if (crossed == null) continue;
    const first = withAmt[0]!;
    findings.push({
      contractor: first.contractor as string,
      division: first.division,
      year: first.year,
      jobNumbers: withAmt.map((g) => g.jobNumber),
      total,
      maxSingle,
      thresholdCrossed: crossed,
      note:
        `${withAmt.length} jobs to the same contractor` +
        `${first.division ? ` in ${first.division}` : ""}${first.year ? ` (${first.year})` : ""}` +
        ` total ${inr(total)}, crossing the ${inr(crossed)} limit, while each job stays under it` +
        ` (largest ${inr(maxSingle)}). Possible splitting to avoid the higher tender/approval — requires enquiry.`,
    });
  }
  // Largest combined exposure first.
  findings.sort((a, b) => b.total - a.total);
  return findings;
}
