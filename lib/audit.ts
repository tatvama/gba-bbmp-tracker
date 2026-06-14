import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface FieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

/** Compute changed fields between an old row and a new partial (snake_case keys). */
export function diffFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const [field, newValue] of Object.entries(after)) {
    const oldValue = before ? before[field] : undefined;
    const norm = (v: unknown) =>
      v === null || v === undefined ? "" : Array.isArray(v) ? v.join("; ") : String(v);
    if (norm(oldValue) !== norm(newValue)) {
      changes.push({ field, oldValue, newValue });
    }
  }
  return changes;
}

/** Entities tracked in audit_logs. */
export type AuditEntityType =
  | "contact"
  | "ward"
  | "complaint"
  | "officer"
  | "rti"
  | "rti_first_appeal"
  | "rti_second_appeal"
  | "reminder"
  | "communication"
  | "escalation"
  | "template"
  | "attachment";

/** Write one audit_logs row per changed field. Called on EVERY tracked mutation. */
export async function writeAudit(
  supabase: SupabaseClient,
  params: {
    entityType: AuditEntityType;
    entityId: string;
    changedBy: string;
    changes: FieldChange[];
  },
) {
  if (params.changes.length === 0) return;
  const stringify = (v: unknown) =>
    v === null || v === undefined ? null : Array.isArray(v) ? v.join("; ") : String(v);

  const rows = params.changes.map((c) => ({
    entity_type: params.entityType,
    entity_id: params.entityId,
    field_name: c.field,
    old_value: stringify(c.oldValue),
    new_value: stringify(c.newValue),
    changed_by: params.changedBy,
  }));
  const { error } = await supabase.from("audit_logs").insert(rows);
  if (error) console.error("[writeAudit]", error);
}
