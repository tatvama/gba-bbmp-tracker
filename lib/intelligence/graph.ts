import type {
  CaseGraph, GraphNode, GraphEdge, Evidence, Observation, TimelineEvent,
  Reference, OfficerRef, ComplianceItem, LegalRef,
} from "./types";

/**
 * Build the Case Knowledge Graph as a DERIVED projection over the assembled
 * artifact (single source of truth for graph construction — stages emit domain
 * data, this turns it into typed nodes + edges). The graph makes the evidence
 * rule traversable: an Observation's evidence/rule/officer/timeline/document
 * links are its outgoing edges.
 */
export interface GraphInput {
  evidence: Evidence[];
  documents: { id: string; type: string | null; name: string }[];
  contractor: { name: string | null; gstin?: string | null; pan?: string | null };
  officers: OfficerRef[];
  references: Reference[];
  project: { workDescription: string | null; ward?: string | null; division?: string | null };
  timeline: TimelineEvent[];
  findings: Observation[];
  correlations: Observation[];
  compliance: ComplianceItem[];
  legalFramework: LegalRef[];
}

const refNodeType = (label: string): GraphNode["type"] => {
  const l = label.toLowerCase();
  if (l.includes("government order") || l.startsWith("go")) return "GovernmentOrder";
  if (l.includes("tender")) return "TenderPackage";
  if (l.includes("work order")) return "WorkOrder";
  if (l.includes("agreement")) return "Agreement";
  if (l.includes("bill")) return "RunningBill";
  return "Document";
};

export function buildGraph(input: GraphInput): CaseGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const push = (n: GraphNode) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };
  const link = (from: string, to: string, type: GraphEdge["type"], label?: string) => {
    if (from && to) edges.push({ from, to, type, label });
  };

  // Project (single anchor)
  push({ id: "project", type: "Project", label: input.project.workDescription ?? "Project", data: { ...input.project } });

  // Contractor
  if (input.contractor.name) {
    push({ id: "contractor", type: "Contractor", label: input.contractor.name, data: { gstin: input.contractor.gstin, pan: input.contractor.pan } });
    link("project", "contractor", "awarded_to");
  }

  // Documents + Evidence
  for (const d of input.documents) push({ id: `doc_${d.id}`, type: "Document", label: d.name || d.type || d.id, data: { docType: d.type } });
  for (const e of input.evidence) {
    push({ id: e.id, type: "Evidence", label: e.extract.slice(0, 80), data: { sourceTable: e.sourceTable, docType: e.docType, confidence: e.confidence, page: e.page } });
    if (e.sourceDocId) link(e.id, `doc_${e.sourceDocId}`, "relates_to");
  }

  // Officers
  for (const o of input.officers) {
    push({ id: o.id, type: "Officer", label: o.name, data: { designation: o.designation, office: o.office, contactId: o.contactId, roles: o.roles } });
    for (const ev of o.evidenceIds) link(o.id, ev, "supported_by");
  }

  // Timeline (chain by array order, which stages sort by date)
  input.timeline.forEach((t, i) => {
    push({ id: t.id, type: "TimelineEvent", label: `${t.date ?? "?"} ${t.event}`.slice(0, 100), data: { date: t.date, source: t.source } });
    for (const ev of t.evidenceIds) link(t.id, ev, "supported_by");
    if (i > 0) link(input.timeline[i - 1]!.id, t.id, "precedes");
  });

  // Rules (one node per legal instrument)
  const ruleIdByKey = new Map<string, string>();
  input.legalFramework.forEach((r, i) => {
    const id = `rule_${i + 1}`;
    push({ id, type: "Rule", label: r.instrument, data: { provision: r.provision, relevance: r.relevance } });
    for (const key of r.ruleRefKeys) ruleIdByKey.set(key, id);
  });

  // References
  input.references.forEach((ref, i) => {
    const id = `ref_${i + 1}`;
    push({ id, type: refNodeType(ref.label), label: `${ref.label}: ${ref.value}`, data: { value: ref.value, date: ref.date } });
    for (const ev of ref.evidenceIds) link(id, ev, "supported_by");
    link("project", id, "relates_to");
  });

  // Compliance items
  input.compliance.forEach((c, i) => {
    const id = `comp_${i + 1}`;
    push({ id, type: "ComplianceItem", label: `${c.area}: ${c.requirement}`.slice(0, 100), data: { status: c.status, ruleRef: c.ruleRef } });
    for (const ev of c.evidenceIds) link(id, ev, "supported_by");
  });

  // Findings + correlations → Finding / Observation nodes with full edge set
  const linkObservation = (o: Observation, type: GraphNode["type"]) => {
    push({ id: o.id, type, label: (o.code ? `[${o.code}] ` : "") + o.statement.slice(0, 100), data: { code: o.code, category: o.category, severity: o.severity, evidenceGrade: o.evidenceGrade } });
    for (const ev of o.evidenceIds) link(o.id, ev, "supported_by");
    for (const rr of o.ruleRefs) { const rid = ruleIdByKey.get(rr); if (rid) link(o.id, rid, "cites_rule"); }
    for (const off of o.officerRefs) link(o.id, off, "responsible_for");
    for (const tl of o.relatedTimelineIds) link(o.id, tl, "relates_to");
    for (const doc of o.relatedDocumentIds) link(o.id, `doc_${doc}`, "derived_from");
  };
  for (const f of input.findings) linkObservation(f, "Finding");
  for (const c of input.correlations) linkObservation(c, "Observation");

  // Drop any dangling edges (e.g. a document node was never minted for an
  // evidence's sourceDocId that is actually a complaint id / job number, not a
  // document id) so the graph has referential integrity.
  const nodeIds = new Set(nodes.map((n) => n.id));
  const cleanEdges = edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));

  return { nodes, edges: cleanEdges };
}
