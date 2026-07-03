"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DESIGNATIONS, VERIFICATION_STATUSES, CONFIDENCE_SCORES } from "@/lib/constants";
import type { ContactWithRelations } from "@/lib/types";
import type { ActionState } from "@/lib/actions/contacts";
import {
  getCorporationsAction,
  getDivisionsAction,
  getSubdivisionsAction,
} from "@/lib/actions/complaints";

type Options = {
  corporations: { id: string; code: string; name: string }[];
  divisions: { id: string; name: string }[];
  subdivisions: { id: string; name: string }[];
};

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * COMPONENT DOCUMENTATION: ContactForm
 * ─────────────────────────────────────────────────────────────────────────────
 * Purpose:
 *   Guided form template for creating or modifying officer contact records.
 *   Provides dynamic dependent select fields for BBMP territorial hierarchy.
 *
 * Usage:
 *   ```tsx
 *   import { ContactForm } from "@/components/contacts/contact-form";
 *
 *   <ContactForm action={saveAction} options={options} initial={contactData} />
 *   ```
 *
 * Props:
 *   - action (function): Form server action handler.
 *   - options (Options): Selection lists for corporations, divisions, and subdivisions.
 *   - initial (ContactWithRelations, optional): Initial data for editing records.
 *
 * Responsive Behavior:
 *   - Grid fields scale from single-column (mobile) to two/three-columns (desktop).
 *   - Actions footer remains sticky at the bottom on all screen sizes.
 *
 * Accessibility:
 *   - Required inputs marked with asterisks and validated inline.
 *   - Focus rings enabled on all inputs and selectors.
 *
 * Do's:
 *   - Do specify clear coordinates placeholders.
 *
 * Don'ts:
 *   - Don't use custom styled inputs outside tailwind input tokens.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function ContactForm({
  action,
  options,
  initial,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  options: Options;
  initial?: ContactWithRelations;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, {});

  // Selected values
  const [corpId, setCorpId] = React.useState<string>(initial?.corporation_id ?? "");
  const [divId, setDivId] = React.useState<string>(initial?.division_id ?? "");
  const [subDivId, setSubDivId] = React.useState<string>(initial?.eng_subdivision_id ?? "");

  // Options lists
  const [corporations, setCorporations] = React.useState<{ id: string; code: string; name: string }[]>(() => {
    if (initial?.corporation_id && initial?.corporation) {
      return [{ id: initial.corporation_id, code: initial.corporation.code, name: initial.corporation.name }];
    }
    return [];
  });
  const [divisions, setDivisions] = React.useState<{ id: string; name: string }[]>(() => {
    if (initial?.division_id && initial?.division) {
      return [{ id: initial.division_id, name: initial.division.name }];
    }
    return [];
  });
  const [subdivisions, setSubdivisions] = React.useState<{ id: string; name: string }[]>(() => {
    if (initial?.eng_subdivision_id && initial?.eng_subdivision) {
      return [{ id: initial.eng_subdivision_id, name: initial.eng_subdivision.name }];
    }
    return [];
  });

  // Loading states
  const [loadingCorps, setLoadingCorps] = React.useState(false);
  const [loadingDivs, setLoadingDivs] = React.useState(false);
  const [loadingSubs, setLoadingSubs] = React.useState(false);

  // Load corporations on mount, and division/subdivisions if initial values are set
  React.useEffect(() => {
    async function loadData() {
      const fetches: Promise<any>[] = [];

      // Always fetch corporations on mount
      fetches.push(
        getCorporationsAction()
          .then(setCorporations)
          .catch((e) => console.error("Error loading corporations:", e))
      );

      if (initial?.corporation_id) {
        fetches.push(
          getDivisionsAction(initial.corporation_id, "BBMP")
            .then(setDivisions)
            .catch((e) => console.error("Error loading divisions:", e))
        );
      }

      if (initial?.division_id && initial?.corporation_id) {
        fetches.push(
          getSubdivisionsAction(initial.division_id, initial.corporation_id, "BBMP")
            .then(setSubdivisions)
            .catch((e) => console.error("Error loading subdivisions:", e))
        );
      }

      if (fetches.length > 0) {
        await Promise.all(fetches);
      }
    }

    loadData();
  }, [initial]);

  // Handlers
  const handleCorpChange = async (val: string) => {
    setCorpId(val);
    setDivId("");
    setSubDivId("");
    setDivisions([]);
    setSubdivisions([]);

    if (val) {
      setLoadingDivs(true);
      try {
        const divs = await getDivisionsAction(val, "BBMP");
        setDivisions(divs);
      } catch (error) {
        console.error("Failed to load divisions:", error);
      } finally {
        setLoadingDivs(false);
      }
    }
  };

  const handleDivChange = async (val: string) => {
    setDivId(val);
    setSubDivId("");
    setSubdivisions([]);

    if (val && corpId) {
      setLoadingSubs(true);
      try {
        const subs = await getSubdivisionsAction(val, corpId, "BBMP");
        setSubdivisions(subs);
      } catch (error) {
        console.error("Failed to load subdivisions:", error);
      } finally {
        setLoadingSubs(false);
      }
    }
  };

  const handleSubDivChange = (val: string) => {
    setSubDivId(val);
  };

  React.useEffect(() => {
    if (state.success && state.id) router.push(`/contacts/${state.id}`);
  }, [state, router]);

  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6 pb-20 relative">
      {state.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive animate-fade-in">
          {state.error}
        </div>
      )}

      <div className="grid gap-6">
        {/* Card 1: Core Identity & Organization */}
        <div className="border border-border/50 bg-card rounded-xl p-5 shadow-xs space-y-4.5">
          <div className="border-b border-border/45 pb-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground/75">1. Core Identity & Designation</h3>
            <p className="text-[11px] text-muted-foreground/50 mt-0.5 font-medium">Specify name, designation, department, and working hours.</p>
          </div>
          <div className="grid gap-4.5 sm:grid-cols-2">
            <Field label="Full name" error={fe.fullName} required>
              <Input name="fullName" defaultValue={initial?.full_name ?? ""} required className="h-9.5" />
            </Field>
            <Field label="Designation" error={fe.designation} required>
              <select name="designation" defaultValue={initial?.designation ?? ""} className={selectCls} required>
                <option value="" disabled>Select designation</option>
                {DESIGNATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Department" error={fe.department}>
              <Input name="department" defaultValue={initial?.department ?? ""} className="h-9.5" />
            </Field>
            <Field label="Office timing" error={fe.officeTiming}>
              <Input name="officeTiming" defaultValue={initial?.office_timing ?? ""} placeholder="e.g. 10am–5:30pm Mon–Sat" className="h-9.5" />
            </Field>
          </div>
        </div>

        {/* Card 2: Contact Communication Channels */}
        <div className="border border-border/50 bg-card rounded-xl p-5 shadow-xs space-y-4.5">
          <div className="border-b border-border/45 pb-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground/75">2. Contact Channels & Location</h3>
            <p className="text-[11px] text-muted-foreground/50 mt-0.5 font-medium">Verify primary reach lines and physical office location details.</p>
          </div>
          <div className="grid gap-4.5 sm:grid-cols-3">
            <Field label="Phone" error={fe.phone}>
              <Input name="phone" defaultValue={initial?.phone ?? ""} placeholder="9876543210" className="h-9.5" />
            </Field>
            <Field label="WhatsApp" error={fe.whatsapp}>
              <Input name="whatsapp" defaultValue={initial?.whatsapp ?? ""} placeholder="9876543210" className="h-9.5" />
            </Field>
            <Field label="Email" error={fe.email}>
              <Input name="email" type="email" defaultValue={initial?.email ?? ""} className="h-9.5" />
            </Field>
          </div>
          <div className="pt-2">
            <Field label="Office address" error={fe.officeAddress}>
              <Textarea name="officeAddress" defaultValue={initial?.office_address ?? ""} rows={2} className="min-h-[70px] text-sm" />
            </Field>
          </div>
        </div>

        {/* Card 3: Territorial Jurisdiction & Mapping */}
        <div className="border border-border/50 bg-card rounded-xl p-5 shadow-xs space-y-4.5">
          <div className="border-b border-border/45 pb-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground/75">3. Territorial Jurisdiction</h3>
            <p className="text-[11px] text-muted-foreground/50 mt-0.5 font-medium">Map this profile to the corresponding corporation structure units.</p>
          </div>
          
          {corpId && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground bg-muted/20 border border-border/40 p-3 rounded-lg sm:col-span-2">
              <span className="font-bold text-foreground/80 mr-1.5 uppercase tracking-wider text-[9px] bg-muted px-1.5 py-0.5 rounded border border-border/60">Hierarchy Path</span>
              <span>BBMP Wards</span>
              <span className="text-muted-foreground/60">&gt;</span>
              <span>{corporations.find((c) => c.id === corpId)?.name || (loadingCorps ? "Loading..." : corpId)}</span>
              {divId && (
                <>
                  <span className="text-muted-foreground/60">&gt;</span>
                  <span>{divisions.find((d) => d.id === divId)?.name || (loadingDivs ? "Loading..." : divId)}</span>
                </>
              )}
              {subDivId && (
                <>
                  <span className="text-muted-foreground/60">&gt;</span>
                  <span className="font-semibold text-primary">{subdivisions.find((s) => s.id === subDivId)?.name || (loadingSubs ? "Loading..." : subDivId)}</span>
                </>
              )}
            </div>
          )}

          <div className="grid gap-4.5 sm:grid-cols-3">
            <Field label="Corporation" error={fe.corporationId}>
              <select
                name="corporationId"
                value={corpId}
                onChange={(e) => handleCorpChange(e.target.value)}
                disabled={loadingCorps}
                className={selectCls}
              >
                {loadingCorps ? (
                  <option value="">Loading Corporations...</option>
                ) : corporations.length === 0 ? (
                  <option value="">No Corporations Found</option>
                ) : (
                  <>
                    <option value="">—</option>
                    {corporations.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </Field>

            <Field label="Division" error={fe.divisionId}>
              <select
                name="divisionId"
                value={divId}
                onChange={(e) => handleDivChange(e.target.value)}
                disabled={!corpId || loadingDivs}
                className={selectCls}
              >
                {loadingDivs ? (
                  <option value="">Loading Divisions...</option>
                ) : !corpId ? (
                  <option value="">Select Corporation First</option>
                ) : divisions.length === 0 ? (
                  <option value="">No Divisions Found</option>
                ) : (
                  <>
                    <option value="">—</option>
                    {divisions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </Field>

            <Field label="Engineering sub-division" error={fe.engSubDivisionId}>
              <select
                name="engSubDivisionId"
                value={subDivId}
                onChange={(e) => handleSubDivChange(e.target.value)}
                disabled={!divId || loadingSubs}
                className={selectCls}
              >
                {loadingSubs ? (
                  <option value="">Loading Sub-Divisions...</option>
                ) : !divId ? (
                  <option value="">Select Division First</option>
                ) : subdivisions.length === 0 ? (
                  <option value="">No Sub-Divisions Found</option>
                ) : (
                  <>
                    <option value="">—</option>
                    {subdivisions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </Field>
          </div>
        </div>

        {/* Card 4: Administrative Verification & Notes */}
        <div className="border border-border/50 bg-card rounded-xl p-5 shadow-xs space-y-4.5">
          <div className="border-b border-border/45 pb-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground/75">4. Audit & Verification Data</h3>
            <p className="text-[11px] text-muted-foreground/50 mt-0.5 font-medium">Verify validity, seed status, notes, and exact GPS coordinates.</p>
          </div>
          <div className="grid gap-4.5 sm:grid-cols-3">
            <Field label="Verification status" error={fe.verificationStatus} required>
              <select name="verificationStatus" defaultValue={initial?.verification_status ?? "PENDING"} className={selectCls} required>
                {VERIFICATION_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </Field>
            <Field label="Confidence" error={fe.confidenceScore} required>
              <select name="confidenceScore" defaultValue={initial?.confidence_score ?? "LOW"} className={selectCls} required>
                {CONFIDENCE_SCORES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Source" error={fe.source}>
              <Input name="source" defaultValue={initial?.source ?? ""} className="h-9.5" />
            </Field>
          </div>

          <div className="grid gap-4.5 sm:grid-cols-2">
            <Field label="Latitude" error={fe.latitude}>
              <Input name="latitude" defaultValue={initial?.latitude ?? ""} placeholder="12.9716" className="h-9.5" />
            </Field>
            <Field label="Longitude" error={fe.longitude}>
              <Input name="longitude" defaultValue={initial?.longitude ?? ""} placeholder="77.5946" className="h-9.5" />
            </Field>
          </div>

          <div className="space-y-4 pt-2">
            <Field label="Jurisdiction notes" error={fe.jurisdictionNotes}>
              <Textarea name="jurisdictionNotes" defaultValue={initial?.jurisdiction_notes ?? ""} rows={2} className="min-h-[70px]" />
            </Field>
            <Field label="Public notes" error={fe.publicNotes}>
              <Textarea name="publicNotes" defaultValue={initial?.public_notes ?? ""} rows={2} className="min-h-[70px]" />
            </Field>
            <Field label="Internal notes (not shown to viewers)" error={fe.internalNotes}>
              <Textarea name="internalNotes" defaultValue={initial?.internal_notes ?? ""} rows={2} className="min-h-[70px]" />
            </Field>
          </div>
        </div>
      </div>

      {/* Sticky Actions Bar at the bottom of the screen */}
      <div className="sticky bottom-4 left-0 right-0 z-30 border border-border/50 bg-background/90 px-6 py-4.5 backdrop-blur-md flex items-center justify-between shadow-lg rounded-xl mt-8">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">
            {initial ? "Modifying Profile" : "New Contact Creation"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()} className="font-semibold text-xs">
            Cancel
          </Button>
          <Button type="submit" disabled={pending} className="font-semibold text-xs min-w-[90px]">
            {pending ? "Saving…" : initial ? "Save changes" : "Create contact"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className={cn(error && "text-destructive")}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
