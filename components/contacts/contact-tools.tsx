"use client";

import * as React from "react";
import { MessageCircle, FileText, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { waLink } from "@/lib/phone";
import type { ContactWithRelations } from "@/lib/types";

export function ContactTools({ contact }: { contact: ContactWithRelations }) {
  const [copied, setCopied] = React.useState<string | null>(null);
  const wa = waLink(contact.whatsapp ?? contact.phone);

  const area = contact.eng_subdivision?.name ?? contact.division?.name ?? "our area";

  const waMessage =
    `Respected ${contact.full_name} (${contact.designation}),\n\n` +
    `I am writing regarding a civic issue in ${area}. ` +
    `[Describe the issue, location and date here.]\n\n` +
    `Requesting your attention and a timeline for resolution. Thank you.`;

  const rtiDraft =
    `To,\nThe Public Information Officer\n${contact.office_address ?? "[Office address]"}\n\n` +
    `Subject: Application under the Right to Information Act, 2005\n\n` +
    `Sir/Madam,\n\nUnder the RTI Act, 2005, I request the following information ` +
    `pertaining to ${area} (engineering sub-division: ${contact.eng_subdivision?.name ?? "—"}):\n\n` +
    `1. [Your specific question]\n2. [Your specific question]\n\n` +
    `I am ready to pay the prescribed fee. Please provide the information within 30 days.\n\n` +
    `Yours faithfully,\n[Name]\n[Address]\n[Date]`;

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="no-print flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => copy(waMessage, "wa")}>
        {copied === "wa" ? <Check className="h-4 w-4 text-teal" /> : <MessageCircle className="h-4 w-4" />}
        Copy WhatsApp message
      </Button>
      {wa && (
        <Button asChild variant="outline" size="sm">
          <a href={`${wa}?text=${encodeURIComponent(waMessage)}`} target="_blank" rel="noopener noreferrer">
            Open in WhatsApp
          </a>
        </Button>
      )}

      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm"><FileText className="h-4 w-4" /> Generate RTI draft</Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>RTI draft</DialogTitle>
          </DialogHeader>
          <Textarea defaultValue={rtiDraft} rows={16} className="font-mono text-xs" />
          <Button size="sm" onClick={() => copy(rtiDraft, "rti")}>
            {copied === "rti" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy draft
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
