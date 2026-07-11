import { describe, it, expect } from "vitest";
import { scoreAckMatch, type PoolComplaint } from "@/lib/complaints/ack-matcher";

const pool: PoolComplaint[] = [
  { id: "a", internal_case_number: "DM-CMP-2026-000027", complaint_number: "BBMP/2026/551", job_number: "001-24-000014", title: "Pothole on 5th Cross, Yelahanka", location: "Yelahanka Ward 1", reporter_name: "Raghav Gowda", status: "Filed" },
  { id: "b", internal_case_number: "DM-CMP-2026-000028", complaint_number: null, job_number: "001-23-000001", title: "Broken storm water drain near market", location: "Bommanahalli", reporter_name: "Sharath Babu", status: "Filed" },
  { id: "c", internal_case_number: "DM-CMP-2026-000029", complaint_number: null, job_number: "001-24-000014", title: "Road cutting not restored, 5th Cross", location: "Yelahanka Ward 1", reporter_name: "Sai Raghav", status: "Filed" },
];

describe("scoreAckMatch", () => {
  it("high confidence on a UNIQUE exact job code", () => {
    const r = scoreAckMatch({ jobNumber: "001-23-000001" }, pool);
    expect(r.confidence).toBe("high");
    expect(r.proposedComplaintId).toBe("b");
  });

  it("only medium when a job code is shared by several complaints (work-splitting)", () => {
    const r = scoreAckMatch({ jobNumber: "001-24-000014" }, pool);
    expect(r.confidence).toBe("medium");
    // Both a and c should surface as candidates for the human to pick.
    const ids = r.candidates.map((c) => c.complaintId).sort();
    expect(ids).toContain("a");
    expect(ids).toContain("c");
  });

  it("high confidence on an exact internal case number in the reference", () => {
    const r = scoreAckMatch({ referenceNumber: "DM-CMP-2026-000028" }, pool);
    expect(r.confidence).toBe("high");
    expect(r.proposedComplaintId).toBe("b");
  });

  it("matches a BBMP complaint number", () => {
    const r = scoreAckMatch({ referenceNumber: "BBMP/2026/551" }, pool);
    expect(r.proposedComplaintId).toBe("a");
    expect(r.confidence).toBe("high");
  });

  it("falls back to fuzzy subject similarity when there is no identifier", () => {
    const r = scoreAckMatch({ subject: "Storm water drain broken near the market" }, pool);
    expect(r.proposedComplaintId).toBe("b");
    expect(["medium", "low"]).toContain(r.confidence);
  });

  it("returns no proposal when nothing meaningfully matches", () => {
    const r = scoreAckMatch({ subject: "Streetlight not working in Indiranagar" }, pool);
    expect(r.confidence).toBe("none");
    expect(r.proposedComplaintId).toBeNull();
  });

  it("does not mistake a case number for a job code", () => {
    // "DM-CMP-2026-000027" must not be parsed as a ddd-yy-nnnnnn job code.
    const r = scoreAckMatch({ referenceNumber: "DM-CMP-2026-000027" }, pool);
    expect(r.proposedComplaintId).toBe("a");
  });

  it("matches when AI vision transcribed the job code with a Unicode dash", () => {
    // Real production failure: a scanned Kannada acknowledgment for job
    // 001-23-000001 was extracted with en/em dashes ("001–23–000001"), which
    // visually equals the ASCII code on the complaint but used to string-mismatch
    // it → "No Match" despite an existing complaint. Must now match with high
    // confidence just like the ASCII form.
    for (const jobNumber of ["001–23–000001", "001—23—000001", "001 - 23 - 000001"]) {
      const r = scoreAckMatch({ jobNumber }, pool);
      expect(r.proposedComplaintId).toBe("b");
      expect(r.confidence).toBe("high");
    }
  });

  it("treats an extracted-but-untracked job code as unmatched, even with a plausible-looking fuzzy candidate", () => {
    // Real production case: the ack clearly carries job code 040-23-000002
    // (visible in the extracted fields), but no complaint has that job code
    // yet — a DIFFERENT job's complaint just happens to share enough generic
    // words ("roads", "drains", "layout", "ward") plus the same area to score
    // "Low Confidence" (~0.49) under the old rules. A specific, unmistakable
    // job code with nothing tracking it should route to "create complaint",
    // not a misleading fuzzy pick against an unrelated job.
    const untracked: PoolComplaint[] = [
      {
        id: "x",
        internal_case_number: "DM-CMP-2026-000221",
        complaint_number: null,
        job_number: "088-24-000055",
        title: "Improvements of roads and drains in the layout, ward",
        location: "Kengeri Division",
        reporter_name: null,
        status: "Filed",
      },
    ];
    const r = scoreAckMatch(
      {
        jobNumber: "040-23-000002",
        subject: "Irregularities corruption found in the roads and drains layout, ward works",
        areaOrWard: "Kengeri Division",
      },
      untracked,
    );
    expect(r.confidence).toBe("none");
    expect(r.proposedComplaintId).toBeNull();
  });

  it("still allows a fuzzy match on the same text when no job code was extracted at all", () => {
    // Confirms the suppression above is scoped to "job code present but
    // unmatched" — with no job code to trust over it, fuzzy text similarity
    // should still work exactly as before.
    const untracked: PoolComplaint[] = [
      {
        id: "x",
        internal_case_number: "DM-CMP-2026-000221",
        complaint_number: null,
        job_number: "088-24-000055",
        title: "Improvements of roads and drains in the layout, ward",
        location: "Kengeri Division",
        reporter_name: null,
        status: "Filed",
      },
    ];
    const r = scoreAckMatch(
      {
        subject: "Irregularities corruption found in the roads and drains layout, ward works",
        areaOrWard: "Kengeri Division",
      },
      untracked,
    );
    expect(r.confidence).not.toBe("none");
    expect(r.proposedComplaintId).toBe("x");
  });
});
