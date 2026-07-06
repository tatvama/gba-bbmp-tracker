"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  Loader2, 
  UploadCloud, 
  FileText, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  Trash2, 
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Info,
  Calendar,
  User,
  MapPin,
  Mail,
  Phone,
  Link2,
  Paperclip,
  Check,
  Globe
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { commitComplaintIntakeAction } from "@/lib/actions/complaint-intake";
import type { DetectedComplaint, CreatedComplaintSummary } from "@/lib/complaints/multi-intake";
import type { ComplaintIntakeExtraction } from "@/lib/ai/complaint-intake-analyzer";

const COMPLAINT_TYPES = [
  "Road", "Drain", "Garbage", "Streetlight", "Footpath", "Park", "Water Logging",
  "Encroachment", "Building Violation", "Public Works", "Bill Payment",
  "Tender Irregularity", "Contractor Issue", "Health Issue", "Revenue Issue",
  "Engineer Non Response", "Ward Office Issue", "Other",
];

type Phase = "idle" | "analyzing" | "review" | "committing" | "done";

interface CardStatus {
  status: "pending" | "loading" | "done" | "error";
  message?: string;
  error?: string;
}

export function ComplaintIntakeImport({
  presetFiles,
  onReset,
}: {
  presetFiles?: File[];
  onReset?: () => void;
} = {}) {
  const router = useRouter();
  const [files, setFiles] = React.useState<File[]>([]);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  
  // Streaming states
  const [progressSteps, setProgressSteps] = React.useState<string[]>([]);
  const [currentProgress, setCurrentProgress] = React.useState("");
  
  const [storagePath, setStoragePath] = React.useState("");
  const [originalName, setOriginalName] = React.useState("");
  const [pageCount, setPageCount] = React.useState(0);
  
  const [complaints, setComplaints] = React.useState<DetectedComplaint[]>([]);
  const [cardStatuses, setCardStatuses] = React.useState<Record<number, CardStatus>>({});
  const [activeTabs, setActiveTabs] = React.useState<Record<number, "primary" | "advanced">>({});
  const [validationErrors, setValidationErrors] = React.useState<Record<number, Record<string, boolean>>>({});
  const [created, setCreated] = React.useState<CreatedComplaintSummary[]>([]);

  const multi = complaints.length > 1;

  function setField<K extends keyof ComplaintIntakeExtraction>(idx: number, k: K, v: ComplaintIntakeExtraction[K]) {
    setComplaints((prev) => prev.map((c, i) => (i === idx ? { ...c, extraction: { ...c.extraction, [k]: v } } : c)));
    // Clear validation error if corrected
    setValidationErrors((prev) => {
      const cardErrs = { ...prev[idx] };
      delete cardErrs[k as string];
      return { ...prev, [idx]: cardErrs };
    });
  }

  function removeComplaint(idx: number) {
    setComplaints((prev) => prev.filter((_, i) => i !== idx));
    setCardStatuses((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  }

  React.useEffect(() => {
    if (presetFiles && presetFiles.length) {
      setFiles(presetFiles);
      void analyze(presetFiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files ?? []));
    setError(null);
    e.target.value = "";
  }

  async function analyze(fs: File[] = files) {
    if (fs.length === 0) return;
    setPhase("analyzing");
    setError(null);
    setProgressSteps([]);
    setCurrentProgress("Initializing analysis...");
    
    try {
      const fd = new FormData();
      fs.forEach((f) => fd.append("files", f));

      const response = await fetch("/api/complaints/import/analyze", {
        method: "POST",
        body: fd,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Server error during analysis.");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Could not read response stream.");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }

          if (event.type === "progress") {
            setCurrentProgress(event.message);
            setProgressSteps((prev) => [...prev, event.message]);
          } else if (event.type === "detected") {
            setStoragePath(event.storagePath || "");
            setOriginalName(event.originalName || "");
            setPageCount(event.pageCount || 0);
            
            // Pre-initialize empty card placeholders
            const initialComplaints: DetectedComplaint[] = event.letters.map((l: any, idx: number) => ({
              pageStart: l.startPage,
              pageEnd: l.endPage,
              ocrText: "",
              extraction: {
                subject: l.subject || "",
                complaintType: "Other",
                department: l.department || "",
                areaOrWard: "",
                officerNames: [],
                reporterName: "",
                requestedAction: "",
                summary: "",
                documentType: "letter",
                referenceNumber: l.referenceNumber || "",
                jobNumber: "",
                importantDates: [],
                suggestedStatus: "Draft",
                suggestedNextActions: [],
                recommendedEscalation: "",
                confidence: "Low",
                needsManualReview: true,
              },
            }));
            setComplaints(initialComplaints);

            const initialStatuses: Record<number, CardStatus> = {};
            initialComplaints.forEach((_, idx) => {
              initialStatuses[idx] = { status: "pending", message: "Queued for extraction..." };
              setActiveTabs((prev) => ({ ...prev, [idx]: "primary" }));
            });
            setCardStatuses(initialStatuses);
            setPhase("review");
          } else if (event.type === "card_progress") {
            setCardStatuses((prev) => ({
              ...prev,
              [event.index]: { status: "loading", message: event.message },
            }));
          } else if (event.type === "complaint") {
            setComplaints((prev) => {
              const next = [...prev];
              next[event.index] = event.complaint;
              return next;
            });
            setCardStatuses((prev) => ({
              ...prev,
              [event.index]: { status: "done" },
            }));
          } else if (event.type === "complaint_error") {
            setCardStatuses((prev) => ({
              ...prev,
              [event.index]: { status: "error", error: event.error },
            }));
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setPhase("idle");
    }
  }

  async function commit() {
    if (complaints.length === 0) return;

    // Validate Subject, Type, Department, Summary, Area/Ward on each card
    const errors: Record<number, Record<string, boolean>> = {};
    let hasErrors = false;

    complaints.forEach((c, idx) => {
      const ex = c.extraction;
      const cardErrs: Record<string, boolean> = {};

      if (!ex.subject || !ex.subject.trim()) {
        cardErrs.subject = true;
        hasErrors = true;
      }
      if (!ex.complaintType || !ex.complaintType.trim()) {
        cardErrs.complaintType = true;
        hasErrors = true;
      }
      if (!ex.department || !ex.department.trim()) {
        cardErrs.department = true;
        hasErrors = true;
      }
      if (!ex.summary || !ex.summary.trim()) {
        cardErrs.summary = true;
        hasErrors = true;
      }
      if (!ex.areaOrWard || !ex.areaOrWard.trim()) {
        cardErrs.areaOrWard = true;
        hasErrors = true;
      }

      if (Object.keys(cardErrs).length > 0) {
        errors[idx] = cardErrs;
      }
    });

    if (hasErrors) {
      setValidationErrors(errors);
      setError("Please fill in all highlighted missing fields before proceeding.");
      
      // Auto-switch tabs of invalid cards to primary
      complaints.forEach((_, idx) => {
        if (errors[idx]) {
          setActiveTabs((prev) => ({ ...prev, [idx]: "primary" }));
        }
      });
      return;
    }

    setPhase("committing");
    setError(null);
    try {
      const res = await commitComplaintIntakeAction({
        storagePath,
        originalName,
        complaints: complaints.map((c) => ({
          pageStart: c.pageStart,
          pageEnd: c.pageEnd,
          ocrText: c.ocrText,
          extraction: c.extraction,
        })),
      });
      if (res.error || !res.success || !res.created?.length) {
        setError(res.error || "Could not create the complaint(s).");
        setPhase("review");
        return;
      }
      setCreated(res.created);
      if (res.created.length === 1) {
        router.push(`/complaints/${res.created[0]!.complaintId}`);
        router.refresh();
        return;
      }
      setPhase("done");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Commit failed");
      setPhase("review");
    }
  }

  function reset() {
    setPhase("idle");
    setComplaints([]);
    setCreated([]);
    setFiles([]);
    setCardStatuses({});
    setActiveTabs({});
    setValidationErrors({});
    setError(null);
    if (onReset) onReset();
  }

  if (phase === "analyzing" || phase === "committing") {
    return (
      <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl overflow-hidden">
        <CardContent className="flex flex-col items-center justify-center gap-5 p-10 text-center">
          <div className="relative flex items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <Sparkles className="absolute h-5 w-5 text-indigo-500 animate-pulse" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-bold">
              {phase === "analyzing" ? "Intelligent Document Intake Pipeline" : "Creating Cases"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md animate-pulse">
              {phase === "analyzing" ? currentProgress : `Creating ${complaints.length} distinct complaints...`}
            </p>
          </div>
          
          {phase === "analyzing" && progressSteps.length > 0 && (
            <div className="w-full max-w-md mt-4 border border-slate-100 dark:border-slate-800 rounded-lg p-4 bg-slate-50/50 dark:bg-slate-950/20 text-left space-y-2 max-h-40 overflow-y-auto">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Processing Steps</span>
              {progressSteps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs">
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500 mt-0.5" />
                  <span className="text-slate-600 dark:text-slate-400 font-medium">{step}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (phase === "done") {
    return (
      <Card className="border border-emerald-200 bg-white dark:border-emerald-900/40 dark:bg-slate-900 shadow-sm rounded-xl">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Processing Complete</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Original PDF: <span className="font-semibold text-slate-700 dark:text-slate-300">{originalName || "upload"}</span>
          </p>
          <div className="rounded-lg border border-slate-150 dark:border-slate-800">
            <div className="border-b border-slate-100 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800">
              Created Complaints
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {created.map((c) => (
                <li key={c.complaintId} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  <Link href={`/complaints/${c.complaintId}`} className="min-w-0 flex-1 truncate font-semibold hover:underline text-slate-800 dark:text-slate-200">
                    {c.subject || "Complaint"}
                  </Link>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{c.caseNumber}</span>
                  <span className="shrink-0 text-xs text-slate-400">Pages {c.pageStart}–{c.pageEnd}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
            <span className="text-sm font-bold">Total Complaints Created: {created.length}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={reset}>Upload another</Button>
              <Button size="sm" asChild><Link href="/complaints">View All Complaints <ArrowRight className="h-4 w-4 ml-1" /></Link></Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (phase === "review" && complaints.length > 0) {
    return (
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50/20 p-3.5 text-sm text-rose-600 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
        )}

        {multi && (
          <div className="flex items-start gap-2.5 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3.5 dark:border-slate-800 dark:bg-slate-950/30">
            <Layers className="h-4.5 w-4.5 shrink-0 text-indigo-600 dark:text-indigo-400 mt-0.5" />
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Detected <strong>{complaints.length} complaint letters</strong> in <span className="font-semibold">{originalName || "this PDF"}</span> ({pageCount} pages).
              Each card below represents a separate complaint parsed from the pages. Make edits or exclude letters using the &quot;Remove&quot; button if necessary.
            </p>
          </div>
        )}

        {complaints.map((c, idx) => {
          const ex = c.extraction;
          const status = cardStatuses[idx] || { status: "pending", message: "Queued" };
          const activeTab = activeTabs[idx] || "primary";
          const cardErrors = validationErrors[idx] || {};

          // Field confidence styles helper
          const getConfBadge = (level: "High" | "Medium" | "Low" | undefined) => {
            if (level === "High") {
              return (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <ShieldCheck className="h-3 w-3" /> High
                </span>
              );
            }
            if (level === "Medium") {
              return (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                  <Info className="h-3 w-3" /> Medium
                </span>
              );
            }
            return (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                <ShieldAlert className="h-3 w-3" /> Low
              </span>
            );
          };

          const isFieldInvalid = (fieldName: string) => !!cardErrors[fieldName];

          if (status.status === "pending" || status.status === "loading") {
            return (
              <Card key={idx} className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl overflow-hidden">
                <CardContent className="p-6 flex items-center gap-4">
                  <Loader2 className="h-6 w-6 animate-spin text-primary shrink-0" />
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Complaint {idx + 1}</span>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      {status.message || "Initializing extraction..."}
                    </p>
                    <p className="text-[11px] text-slate-400">Page range: {c.pageStart} to {c.pageEnd}</p>
                  </div>
                </CardContent>
              </Card>
            );
          }

          if (status.status === "error") {
            return (
              <Card key={idx} className="border border-rose-200 bg-rose-50/10 dark:border-rose-900/40 shadow-sm rounded-xl">
                <CardContent className="p-5 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-rose-500 uppercase tracking-wide">Extraction Failed (Complaint {idx + 1})</span>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {status.error || "Requires manual input."}
                    </p>
                    <p className="text-[11px] text-slate-400">Pages {c.pageStart} to {c.pageEnd}</p>
                  </div>
                  <button type="button" onClick={() => removeComplaint(idx)} className="shrink-0 inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20">
                    <Trash2 className="h-4 w-4" /> Remove
                  </button>
                </CardContent>
              </Card>
            );
          }

          return (
            <Card key={idx} className={`border bg-white shadow-sm rounded-xl overflow-hidden transition-colors ${Object.keys(cardErrors).length > 0 ? "border-rose-350 dark:border-rose-900/60" : "border-slate-200 dark:border-slate-800"}`}>
              {/* Header */}
              <div className="bg-slate-50/50 dark:bg-slate-950/20 px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-bold text-white dark:bg-slate-200 dark:text-slate-900">
                    Complaint {idx + 1}
                  </span>
                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Pages {c.pageStart}–{c.pageEnd}
                  </span>
                  <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/20 px-2.5 py-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                    <Globe className="h-3 w-3" /> {ex.language || "English"}
                  </span>
                  {ex.wardName && (
                    <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/20 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      Ward {ex.wardNo || ""}: {ex.wardName}
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-3">
                  {multi && (
                    <button type="button" onClick={() => removeComplaint(idx)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20">
                      <Trash2 className="h-3.5 w-3.5" /> Remove Card
                    </button>
                  )}
                </div>
              </div>

              <CardContent className="p-5 space-y-4">
                {/* Tab selector */}
                <div className="flex border-b border-slate-100 dark:border-slate-800 pb-px">
                  <button 
                    type="button" 
                    onClick={() => setActiveTabs(prev => ({ ...prev, [idx]: "primary" }))}
                    className={`pb-2 px-4 text-xs font-bold transition-all border-b-2 -mb-px ${activeTab === "primary" ? "border-primary text-primary" : "border-transparent text-slate-400 hover:text-slate-600"}`}
                  >
                    Primary Grievance Info
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setActiveTabs(prev => ({ ...prev, [idx]: "advanced" }))}
                    className={`pb-2 px-4 text-xs font-bold transition-all border-b-2 -mb-px ${activeTab === "advanced" ? "border-primary text-primary" : "border-transparent text-slate-400 hover:text-slate-600"}`}
                  >
                    Advanced Metadata
                  </button>
                </div>

                {activeTab === "primary" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs font-bold text-slate-600 dark:text-slate-400">Subject</Label>
                        {getConfBadge(ex.fieldConfidence?.subject)}
                      </div>
                      <Input 
                        value={ex.subject} 
                        onChange={(e) => setField(idx, "subject", e.target.value)} 
                        placeholder="Generate/Edit complaint subject" 
                        className={`transition-colors ${isFieldInvalid("subject") ? "border-rose-500 bg-rose-50/5 focus-visible:ring-rose-500" : ex.fieldConfidence?.subject === "Low" ? "border-amber-300 dark:border-amber-900 bg-amber-50/5" : ""}`}
                      />
                      {isFieldInvalid("subject") && <span className="text-[10px] font-bold text-rose-500 mt-1 block">Subject is required</span>}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs font-bold text-slate-600 dark:text-slate-400">Complaint Type</Label>
                        {getConfBadge(ex.fieldConfidence?.complaintType)}
                      </div>
                      <select 
                        value={ex.complaintType} 
                        onChange={(e) => setField(idx, "complaintType", e.target.value)} 
                        className={`h-10 w-full rounded-md border bg-background px-2 text-sm transition-colors ${isFieldInvalid("complaintType") ? "border-rose-500 bg-rose-50/5" : ex.fieldConfidence?.complaintType === "Low" ? "border-amber-300 dark:border-amber-900 bg-amber-50/5" : "border-input"}`}
                      >
                        {COMPLAINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {isFieldInvalid("complaintType") && <span className="text-[10px] font-bold text-rose-500 mt-1 block">Complaint type is required</span>}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs font-bold text-slate-600 dark:text-slate-400">Department</Label>
                        {getConfBadge(ex.fieldConfidence?.department)}
                      </div>
                      <Input 
                        value={ex.department} 
                        onChange={(e) => setField(idx, "department", e.target.value)} 
                        className={`transition-colors ${isFieldInvalid("department") ? "border-rose-500 bg-rose-50/5 focus-visible:ring-rose-500" : ex.fieldConfidence?.department === "Low" ? "border-amber-300 dark:border-amber-900 bg-amber-50/5" : ""}`}
                      />
                      {isFieldInvalid("department") && <span className="text-[10px] font-bold text-rose-500 mt-1 block">Department is required</span>}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs font-bold text-slate-600 dark:text-slate-400">Area / Ward Name</Label>
                        {getConfBadge(ex.fieldConfidence?.areaOrWard)}
                      </div>
                      <Input 
                        value={ex.areaOrWard} 
                        onChange={(e) => setField(idx, "areaOrWard", e.target.value)} 
                        className={`transition-colors ${isFieldInvalid("areaOrWard") ? "border-rose-500 bg-rose-50/5 focus-visible:ring-rose-500" : ex.fieldConfidence?.areaOrWard === "Low" ? "border-amber-300 dark:border-amber-900 bg-amber-50/5" : ""}`}
                      />
                      {isFieldInvalid("areaOrWard") && <span className="text-[10px] font-bold text-rose-500 mt-1 block">Area / Ward is required</span>}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs font-bold text-slate-600 dark:text-slate-400">Reporter / Complainant</Label>
                        {getConfBadge(ex.fieldConfidence?.reporterName)}
                      </div>
                      <Input 
                        value={ex.reporterName} 
                        onChange={(e) => setField(idx, "reporterName", e.target.value)} 
                        className={`transition-colors ${isFieldInvalid("reporterName") ? "border-rose-500 bg-rose-50/5 focus-visible:ring-rose-500" : ex.fieldConfidence?.reporterName === "Low" ? "border-amber-300 dark:border-amber-900 bg-amber-50/5" : ""}`}
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs font-bold text-slate-600 dark:text-slate-400">Requested Action</Label>
                        {getConfBadge(ex.fieldConfidence?.requestedAction)}
                      </div>
                      <Input 
                        value={ex.requestedAction} 
                        onChange={(e) => setField(idx, "requestedAction", e.target.value)} 
                        placeholder="What needs to be done exactly"
                        className={`transition-colors ${ex.fieldConfidence?.requestedAction === "Low" ? "border-amber-300 dark:border-amber-900 bg-amber-50/5" : ""}`}
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs font-bold text-slate-600 dark:text-slate-400">Job Number</Label>
                        {getConfBadge(ex.fieldConfidence?.jobNumber)}
                      </div>
                      <Input 
                        value={ex.jobNumber} 
                        onChange={(e) => setField(idx, "jobNumber", e.target.value)} 
                        placeholder="ddd-yy-nnnnnn (e.5. 225-25-001234)" 
                        pattern="\d{3}-\d{2}-\d{6}" 
                        className={`transition-colors ${ex.fieldConfidence?.jobNumber === "Low" ? "border-amber-300 dark:border-amber-900 bg-amber-50/5" : ""}`}
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs font-bold text-slate-600 dark:text-slate-400">Complaint Summary</Label>
                        {getConfBadge(ex.fieldConfidence?.summary)}
                      </div>
                      <textarea 
                        value={ex.summary} 
                        onChange={(e) => setField(idx, "summary", e.target.value)} 
                        rows={3}
                        className={`w-full rounded-md border bg-background px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isFieldInvalid("summary") ? "border-rose-500 bg-rose-50/5 focus-visible:ring-rose-500" : ex.fieldConfidence?.summary === "Low" ? "border-amber-300 dark:border-amber-900 bg-amber-50/5" : "border-input"}`}
                      />
                      {isFieldInvalid("summary") && <span className="text-[10px] font-bold text-rose-500 mt-1 block">Summary is required</span>}
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 text-sm">
                    {/* Advanced metadata section */}
                    <div>
                      <Label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        <Calendar className="h-3.5 w-3.5" /> Complaint Date
                      </Label>
                      <Input value={ex.complaintDate || ""} onChange={(e) => setField(idx, "complaintDate", e.target.value)} placeholder="YYYY-MM-DD" />
                    </div>

                    <div>
                      <Label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        <User className="h-3.5 w-3.5" /> Receiver Block
                      </Label>
                      <Input value={ex.receiver || ""} onChange={(e) => setField(idx, "receiver", e.target.value)} placeholder="Receiver designation" />
                    </div>

                    <div className="sm:col-span-2">
                      <Label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        <MapPin className="h-3.5 w-3.5" /> Addressed To
                      </Label>
                      <Input value={ex.addressedTo || ""} onChange={(e) => setField(idx, "addressedTo", e.target.value)} placeholder="Complete recipient address" />
                    </div>

                    <div>
                      <Label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        <Mail className="h-3.5 w-3.5" /> Emails Found
                      </Label>
                      <Input 
                        value={ex.emails?.join(", ") || ""} 
                        onChange={(e) => setField(idx, "emails", e.target.value.split(",").map(x => x.trim()))} 
                        placeholder="Comma separated emails" 
                      />
                    </div>

                    <div>
                      <Label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        <Phone className="h-3.5 w-3.5" /> Contact Numbers
                      </Label>
                      <Input 
                        value={ex.contactNumbers?.join(", ") || ""} 
                        onChange={(e) => setField(idx, "contactNumbers", e.target.value.split(",").map(x => x.trim()))} 
                        placeholder="Comma separated numbers" 
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <Label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        <MapPin className="h-3.5 w-3.5" /> Mentions / Addresses
                      </Label>
                      <Input 
                        value={ex.addresses?.join("; ") || ""} 
                        onChange={(e) => setField(idx, "addresses", e.target.value.split(";").map(x => x.trim()))} 
                        placeholder="Semicolon separated addresses" 
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <Label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        <Link2 className="h-3.5 w-3.5" /> References Cited
                      </Label>
                      <Input 
                        value={ex.references?.join("; ") || ""} 
                        onChange={(e) => setField(idx, "references", e.target.value.split(";").map(x => x.trim()))} 
                        placeholder="Semicolon separated references" 
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <Label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        <Paperclip className="h-3.5 w-3.5" /> Attachments Mentioned
                      </Label>
                      <Input 
                        value={ex.attachments?.join(", ") || ""} 
                        onChange={(e) => setField(idx, "attachments", e.target.value.split(",").map(x => x.trim()))} 
                        placeholder="Attachments list" 
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800/85">
          <Button type="button" variant="outline" onClick={reset} className="h-10">Start over</Button>
          <Button type="button" onClick={commit} className="h-10 font-bold">
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            {multi ? `Create ${complaints.length} complaints` : "Create complaint"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl">
      <CardContent className="p-6 space-y-5">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50/20 p-3 text-sm text-rose-600 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
        )}
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-100 bg-amber-50/30 p-3.5 dark:border-slate-800 dark:bg-slate-950/30">
          <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Upload complaint letters (PDF or photos). AI reads the document, and if it contains <strong>several complaint letters</strong> it
            detects each one and creates a separate complaint per letter — otherwise it creates a single complaint, as before. Review before creating.
          </p>
        </div>
        <label htmlFor="intake-file" className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/40 px-4 py-10 text-center transition-colors hover:border-primary/50 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/30 dark:hover:bg-slate-900/50">
          <UploadCloud className="h-8 w-8 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Choose a letter or multi-complaint PDF</span>
          <span className="text-xs text-slate-400">PDF, JPEG, PNG or WebP</span>
          <input id="intake-file" type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={onPick} />
        </label>
        {files.length > 0 && (
          <ul className="space-y-1.5">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{f.name}</span>
                <span className="ml-auto shrink-0 text-slate-400">{(f.size / 1_048_576).toFixed(1)} MB</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end border-t border-slate-100 dark:border-slate-800/85 pt-4">
          <Button type="button" onClick={() => analyze()} disabled={files.length === 0} className="h-10 font-bold">
            <Sparkles className="h-4 w-4 mr-1.5" /> Analyze
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
