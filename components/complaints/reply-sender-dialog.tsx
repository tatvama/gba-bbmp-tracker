"use client";

import * as React from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DEFAULT_DEPT_LETTER_SENDER, type DeptLetterSender, type DraftLanguage } from "@/lib/constants";

const COPY: Record<
  "counter_reply" | "reminder_letter",
  { title: string; description: string }
> = {
  counter_reply: {
    title: "Counter-reply — sender details",
    description:
      "The counter-reply is addressed to the officer on record for this case. Confirm or edit the FROM details below. These are used verbatim in the letter and saved as your default for next time.",
  },
  reminder_letter: {
    title: "Reminder letter — sender details",
    description:
      "The reminder letter is addressed to the officer on record for this case. Confirm or edit the FROM details below. These are used verbatim in the letter and saved as your default for next time.",
  },
};

/**
 * From-details form shown before drafting a department-facing letter (counter-
 * reply or reminder letter) — mirrors LegalNoticeSenderDialog's ask-and-edit
 * pattern, but scoped to the fields these letters actually use (no PIL-only
 * age/parentage/organisation/capacity, since these aren't a court petition).
 * Pre-filled from the saved default (`initial`) and fully editable. On confirm
 * it returns the (possibly edited) sender plus the chosen draft language; the
 * caller persists it as the new default and starts the draft. The TO block
 * (the ward officer) is resolved automatically and not editable here.
 */
export function ReplySenderDialog({
  open,
  onOpenChange,
  kind,
  initial,
  busy,
  icon: Icon,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: "counter_reply" | "reminder_letter";
  initial: DeptLetterSender | null;
  busy?: boolean;
  icon: LucideIcon;
  onConfirm: (sender: DeptLetterSender, language: DraftLanguage) => void;
}) {
  const seed = React.useCallback(
    (): DeptLetterSender => ({ ...DEFAULT_DEPT_LETTER_SENDER, ...(initial ?? {}) }),
    [initial],
  );
  const [s, setS] = React.useState<DeptLetterSender>(seed);
  const [language, setLanguage] = React.useState<DraftLanguage>("Kannada");

  // Re-seed from the latest saved default whenever the dialog (re)opens, so a
  // value fetched after the first render — or edited for the other letter kind
  // — is reflected without clobbering the user's in-progress edits mid-session.
  React.useEffect(() => {
    if (open) setS(seed());
  }, [open, seed]);

  const set = <K extends keyof DeptLetterSender>(k: K, v: DeptLetterSender[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));

  const nameOk = (s.name ?? "").trim().length > 0;
  const addressOk = (s.address ?? "").trim().length > 0;
  const canSubmit = nameOk && addressOk && !busy;
  const copy = COPY[kind];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" /> {copy.title}
          </DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="rs-name" className="mb-1.5 block text-sm font-medium">
              Full name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="rs-name"
              value={s.name ?? ""}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. K.G. Raghav Gowda"
              aria-invalid={!nameOk}
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="rs-addr" className="mb-1.5 block text-sm font-medium">
              Postal address <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="rs-addr"
              value={s.address ?? ""}
              onChange={(e) => set("address", e.target.value)}
              placeholder={"# 7, 2nd Floor, Gandhi Bazar Main,\nBasavanagudi, Bengaluru 560004"}
              className="min-h-[64px]"
              aria-invalid={!addressOk}
            />
          </div>

          <div>
            <Label htmlFor="rs-mobile" className="mb-1.5 block text-sm font-medium">
              Mobile
            </Label>
            <Input
              id="rs-mobile"
              value={s.mobile ?? ""}
              onChange={(e) => set("mobile", e.target.value)}
              placeholder="e.g. 98453 00071"
            />
          </div>
          <div>
            <Label htmlFor="rs-lang" className="mb-1.5 block text-sm font-medium">
              Draft language
            </Label>
            <select
              id="rs-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value as DraftLanguage)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="Kannada">ಕನ್ನಡ (Kannada)</option>
              <option value="English">English</option>
              <option value="Bilingual">Bilingual (English + ಕನ್ನಡ)</option>
            </select>
          </div>
        </div>

        {!canSubmit && !busy && (
          <p className="text-xs text-muted-foreground">Name and postal address are required.</p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onConfirm(s, language)} disabled={!canSubmit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
            {kind === "counter_reply" ? "Generate counter-reply" : "Generate reminder letter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
