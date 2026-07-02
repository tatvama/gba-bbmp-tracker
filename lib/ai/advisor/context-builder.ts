import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getComplaintSettings } from "@/lib/settings";
import type {
  ComplaintWithRelations,
  ComplaintTimelineEntry,
  ComplaintReply,
  ComplaintActionTaken,
  ComplaintDocument,
  Reminder,
} from "@/lib/types";
import type { AdvisorContext, EscalationLogRow, RecommendationRow } from "./types";

const COMPLAINT_SELECT =
  "*, ward:wards!ward_id(id,new_no,new_name), division:divisions!division_id(id,name), eng_subdivision:eng_subdivisions!eng_subdivision_id(id,name), assigned_engineer:contacts!assigned_engineer_id(id,full_name,designation,phone,whatsapp,email), assigned_officer:contacts!assigned_officer_id(id,full_name,designation)";

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Fan out the same query shapes `buildCaseHistory()` in lib/ai/complaint-draft.ts
 * already uses (timeline/replies/actions/escalations), plus documents, reminders,
 * and the previously cached recommendation row — everything the advisor needs in
 * one place. Returns null when the complaint doesn't exist (deleted mid-flight).
 */
export async function buildAdvisorContext(
  admin: SupabaseClient,
  complaintId: string,
): Promise<AdvisorContext | null> {
  const [{ data: complaint }, settings] = await Promise.all([
    admin.from("complaints").select(COMPLAINT_SELECT).eq("id", complaintId).is("deleted_at", null).maybeSingle(),
    getComplaintSettings(),
  ]);
  if (!complaint) return null;

  const [
    { data: timeline },
    { data: replies },
    { data: actions },
    { data: escalations },
    { data: reminders },
    { data: documents },
    { data: previousRecommendation },
  ] = await Promise.all([
    admin.from("complaint_timeline").select("*").eq("complaint_id", complaintId).order("event_date", { ascending: true }).limit(200),
    admin.from("complaint_replies").select("*").eq("complaint_id", complaintId).order("created_at", { ascending: true }).limit(100),
    admin.from("complaint_action_taken").select("*").eq("complaint_id", complaintId).order("created_at", { ascending: true }).limit(100),
    admin.from("escalation_logs").select("id,escalated_on,to_level,to_officer,reason,status,response_received").eq("entity_type", "complaint").eq("entity_id", complaintId).order("escalated_on", { ascending: true }).limit(50),
    admin.from("reminders").select("*").eq("entity_type", "complaint").eq("entity_id", complaintId).order("due_date", { ascending: true }).limit(100),
    admin.from("complaint_documents").select("*").eq("complaint_id", complaintId).order("uploaded_at", { ascending: true }).limit(200),
    admin.from("complaint_ai_recommendations").select("*").eq("complaint_id", complaintId).maybeSingle(),
  ]);

  const timelineRows = (timeline as ComplaintTimelineEntry[]) ?? [];
  const reopenedCount = timelineRows.filter(
    (e) => e.event_type === "Reopened" || /reopen/i.test(e.title ?? ""),
  ).length;

  return {
    complaint: complaint as unknown as ComplaintWithRelations,
    timeline: timelineRows,
    replies: (replies as ComplaintReply[]) ?? [],
    actions: (actions as ComplaintActionTaken[]) ?? [],
    escalations: (escalations as EscalationLogRow[]) ?? [],
    reminders: (reminders as Reminder[]) ?? [],
    documents: (documents as ComplaintDocument[]) ?? [],
    previousRecommendation: (previousRecommendation as RecommendationRow | null) ?? null,
    settings,
    reopenedCount,
    today: todayISO(),
  };
}
