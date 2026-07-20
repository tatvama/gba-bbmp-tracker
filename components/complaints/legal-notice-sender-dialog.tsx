"use client";

import * as React from "react";
import { Loader2, Gavel } from "lucide-react";
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
import { DEFAULT_LEGAL_NOTICE_SENDER, type LegalNoticeSender, type DraftLanguage } from "@/lib/constants";

/**
 * From-details form for the legal notice (a PIL letter petition to the Hon'ble
 * Chief Justice). Shown each time the user generates a legal notice, pre-filled
 * from the saved default (`initial`) and fully editable. On confirm it returns
 * the (possibly edited) petitioner identity plus the chosen draft language; the
 * caller persists it as the new default and starts the draft. The TO block (the
 * Chief Justice) is fixed and not editable here.
 */
export function LegalNoticeSenderDialog({
  open,
  onOpenChange,
  initial,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: LegalNoticeSender | null;
  busy?: boolean;
  onConfirm: (sender: LegalNoticeSender, language: DraftLanguage) => void;
}) {
  const seed = React.useCallback(
    (): LegalNoticeSender => ({ ...DEFAULT_LEGAL_NOTICE_SENDER, ...(initial ?? {}) }),
    [initial],
  );
  const [s, setS] = React.useState<LegalNoticeSender>(seed);
  const [language, setLanguage] = React.useState<DraftLanguage>("English");

  // Re-seed from the latest saved default whenever the dialog (re)opens, so a
  // value fetched after the first render — or edited on a previous complaint —
  // is reflected without clobbering the user's in-progress edits mid-session.
  React.useEffect(() => {
    if (open) setS(seed());
  }, [open, seed]);

  const set = <K extends keyof LegalNoticeSender>(k: K, v: LegalNoticeSender[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));

  const nameOk = (s.name ?? "").trim().length > 0;
  const addressOk = (s.address ?? "").trim().length > 0;
  const canSubmit = nameOk && addressOk && !busy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="h-4 w-4 text-primary" /> Legal notice — petitioner details
          </DialogTitle>
          <DialogDescription>
            The legal notice is drafted as a Public Interest Litigation letter petition to the Hon&apos;ble Chief
            Justice, High Court of Karnataka. Confirm or edit the FROM details below. These are used verbatim in the
            petition and saved as your default for next time.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="ln-name" className="mb-1.5 block text-sm font-medium">
              Full name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ln-name"
              value={s.name ?? ""}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. K.N. Sharath Babu"
              aria-invalid={!nameOk}
            />
          </div>

          <div>
            <Label htmlFor="ln-age" className="mb-1.5 block text-sm font-medium">
              Age (years)
            </Label>
            <Input
              id="ln-age"
              value={s.ageYears ?? ""}
              onChange={(e) => set("ageYears", e.target.value)}
              placeholder="e.g. 46"
              inputMode="numeric"
            />
          </div>
          <div>
            <Label htmlFor="ln-parentage" className="mb-1.5 block text-sm font-medium">
              Parentage
            </Label>
            <Input
              id="ln-parentage"
              value={s.parentage ?? ""}
              onChange={(e) => set("parentage", e.target.value)}
              placeholder="e.g. S/o D.K. Nagaraju"
            />
          </div>

          <div>
            <Label htmlFor="ln-org" className="mb-1.5 block text-sm font-medium">
              Organisation / trust
            </Label>
            <Input
              id="ln-org"
              value={s.organisation ?? ""}
              onChange={(e) => set("organisation", e.target.value)}
              placeholder="e.g. Sree Shirdi Sai Darshanam Trust"
            />
          </div>
          <div>
            <Label htmlFor="ln-role" className="mb-1.5 block text-sm font-medium">
              Capacity / designation
            </Label>
            <Input
              id="ln-role"
              value={s.role ?? ""}
              onChange={(e) => set("role", e.target.value)}
              placeholder="e.g. member / trustee"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="ln-addr" className="mb-1.5 block text-sm font-medium">
              Postal address <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="ln-addr"
              value={s.address ?? ""}
              onChange={(e) => set("address", e.target.value)}
              placeholder={"# CA-2, M.S. Ramaiah City,\nJ.P. Nagar 8th Phase, Bengaluru 560076"}
              className="min-h-[64px]"
              aria-invalid={!addressOk}
            />
          </div>

          <div>
            <Label htmlFor="ln-mobile" className="mb-1.5 block text-sm font-medium">
              Mobile
            </Label>
            <Input
              id="ln-mobile"
              value={s.mobile ?? ""}
              onChange={(e) => set("mobile", e.target.value)}
              placeholder="e.g. 98453 00071"
            />
          </div>
          <div>
            <Label htmlFor="ln-email" className="mb-1.5 block text-sm font-medium">
              Email
            </Label>
            <Input
              id="ln-email"
              type="email"
              value={s.email ?? ""}
              onChange={(e) => set("email", e.target.value)}
              placeholder="e.g. name@example.com"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="ln-lang" className="mb-1.5 block text-sm font-medium">
              Draft language
            </Label>
            <select
              id="ln-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value as DraftLanguage)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="English">English</option>
              <option value="Kannada">ಕನ್ನಡ (Kannada)</option>
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
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
            Generate legal notice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
