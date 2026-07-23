"use client";

import * as React from "react";
import { Loader2, ShieldAlert } from "lucide-react";
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
import { TvccDivisionSelect, TvccLanguageSelect } from "@/components/complaints/tvcc-copy-option";
import { TVCC_OFFICES, DEFAULT_TVCC_SENDER, type TvccOffice, type TvccSender } from "@/lib/distribution/tvcc";
import { getTvccOfficesAction, getTvccSenderAction } from "@/lib/actions/complaints";
import type { CorporationCode, DraftLanguage } from "@/lib/constants";

export interface TvccCopyConfirm {
  division: CorporationCode;
  language: DraftLanguage;
  /** The TO address on screen (possibly edited) — saved as the default. */
  office: TvccOffice;
  /** The FROM / signatory on screen (possibly edited) — saved as the default. */
  sender: TvccSender;
}

const linesToText = (lines: string[]) => lines.join("\n");
const textToLines = (text: string) => text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

/**
 * Ask-and-edit dialog for a TVCC complaint copy — mirrors the legal-notice
 * sender dialog. The letter is AI-DRAFTED in the standard letter format,
 * addressed TO the chosen division's TVCC and FROM the sender below. Both the
 * TO office address and the FROM details are pre-filled from the saved defaults,
 * fully editable, and saved back on confirm. The designation (Executive
 * Engineer, T.V.C.C.) is fixed.
 */
export function TvccCopyDialog({
  open,
  onOpenChange,
  defaultDivision,
  busy,
  confirmLabel = "Prepare TVCC copy",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultDivision: CorporationCode | null;
  busy?: boolean;
  confirmLabel?: string;
  onConfirm: (c: TvccCopyConfirm) => void;
}) {
  const [offices, setOffices] = React.useState<Record<CorporationCode, TvccOffice>>(() => ({ ...TVCC_OFFICES }));
  const [loading, setLoading] = React.useState(false);
  const [division, setDivision] = React.useState<CorporationCode | null>(defaultDivision);
  const [language, setLanguage] = React.useState<DraftLanguage>("Kannada");
  const [en, setEn] = React.useState("");
  const [kn, setKn] = React.useState("");
  const [sender, setSender] = React.useState<TvccSender>(DEFAULT_TVCC_SENDER);

  // Fetch the saved offices + sender whenever the dialog opens.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([getTvccOfficesAction(), getTvccSenderAction()])
      .then(([o, s]) => {
        if (cancelled) return;
        setOffices(o.offices);
        setSender(s.sender);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Adopt a late-arriving default division while none is picked.
  React.useEffect(() => {
    if (open) setDivision((d) => d ?? defaultDivision);
  }, [open, defaultDivision]);

  // Load the selected division's address into the editable textareas (re-runs
  // once the fetched offices arrive, reflecting any saved edits).
  React.useEffect(() => {
    if (!division) {
      setEn("");
      setKn("");
      return;
    }
    const o = offices[division];
    setEn(linesToText(o.addressLinesEn));
    setKn(linesToText(o.addressLinesKn));
  }, [division, offices]);

  const setSenderField = <K extends keyof TvccSender>(k: K, v: TvccSender[K]) =>
    setSender((prev) => ({ ...prev, [k]: v }));

  const addressOk = en.trim().length > 0 || kn.trim().length > 0;
  const fromOk = sender.name.trim().length > 0 && sender.address.trim().length > 0;
  const canSubmit = !!division && addressOk && fromOk && !busy;

  function confirm() {
    if (!division) return;
    onConfirm({
      division,
      language,
      office: {
        corporationName: offices[division].corporationName,
        addressLinesEn: textToLines(en),
        addressLinesKn: textToLines(kn),
      },
      sender: {
        name: sender.name.trim(),
        address: sender.address.trim(),
        mobile: sender.mobile.trim(),
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" /> Prepare complaint copy for the TVCC
          </DialogTitle>
          <DialogDescription>
            A formal complaint letter is drafted (in the standard letter format) addressed to the Executive Engineer,
            Technical Vigilance &amp; Control Cell (T.V.C.C.). Confirm or edit the office (TO) address and your own
            (FROM) details below — both are saved as your defaults for next time — and choose the language.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-sm font-medium">Division</Label>
            <TvccDivisionSelect value={division} onChange={setDivision} />
          </div>
          <div>
            <Label className="mb-1.5 block text-sm font-medium">Language</Label>
            <TvccLanguageSelect value={language} onChange={setLanguage} />
          </div>

          {/* TO — the TVCC office */}
          <div className="sm:col-span-2 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
            To (fixed):{" "}
            <span className="font-medium text-foreground">
              The Executive Engineer, Technical Vigilance &amp; Control Cell (T.V.C.C.)
            </span>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="tvcc-addr-en" className="mb-1.5 block text-sm font-medium">
              Office address — English <span className="font-normal text-muted-foreground">(one line per row)</span>
            </Label>
            <Textarea
              id="tvcc-addr-en"
              value={en}
              onChange={(e) => setEn(e.target.value)}
              className="min-h-[96px] font-mono text-xs"
              placeholder={"Bengaluru South City Corporation,\nOffice of the Chief Engineer,\n…\nBengaluru - 560068."}
              disabled={!division || loading}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="tvcc-addr-kn" className="mb-1.5 block text-sm font-medium">
              Office address — ಕನ್ನಡ <span className="font-normal text-muted-foreground">(ಪ್ರತಿ ಸಾಲಿಗೆ ಒಂದು)</span>
            </Label>
            <Textarea
              id="tvcc-addr-kn"
              value={kn}
              onChange={(e) => setKn(e.target.value)}
              className="min-h-[96px] font-mono text-xs"
              placeholder={"ಬೆಂಗಳೂರು ದಕ್ಷಿಣ ನಗರ ಪಾಲಿಕೆ,\n…\nಬೆಂಗಳೂರು – 560068."}
              disabled={!division || loading}
            />
          </div>

          {/* FROM — the complainant */}
          <div className="sm:col-span-2 mt-1 border-t pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            From (sender / signatory)
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="tvcc-from-name" className="mb-1.5 block text-sm font-medium">
              Full name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tvcc-from-name"
              value={sender.name}
              onChange={(e) => setSenderField("name", e.target.value)}
              placeholder="e.g. K.G. Raghav Gowda"
              aria-invalid={!sender.name.trim()}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="tvcc-from-addr" className="mb-1.5 block text-sm font-medium">
              Postal address <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="tvcc-from-addr"
              value={sender.address}
              onChange={(e) => setSenderField("address", e.target.value)}
              className="min-h-[64px]"
              placeholder={"# 7, 2nd Floor, Gandhi Bazar Main,\nBasavanagudi, Bengaluru 560004"}
              aria-invalid={!sender.address.trim()}
            />
          </div>
          <div>
            <Label htmlFor="tvcc-from-mobile" className="mb-1.5 block text-sm font-medium">
              Mobile
            </Label>
            <Input
              id="tvcc-from-mobile"
              value={sender.mobile}
              onChange={(e) => setSenderField("mobile", e.target.value)}
              placeholder="e.g. 98453 00071"
            />
          </div>
        </div>

        {!canSubmit && !busy && (
          <p className="text-xs text-muted-foreground">
            Choose a division and fill the FROM name and postal address.
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={confirm} disabled={!canSubmit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />} {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
