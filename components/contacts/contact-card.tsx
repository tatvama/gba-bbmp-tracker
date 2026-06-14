"use client";

import * as React from "react";
import Link from "next/link";
import { Phone, MessageCircle, Mail, Copy, Check, MapPin, Clock } from "lucide-react";
import type { ContactWithRelations } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  VerificationBadge,
  ConfidenceBadge,
  UnverifiedSeedTag,
  SampleBadge,
} from "@/components/badges";
import { telLink, waLink, formatPhone } from "@/lib/phone";
import { orDash } from "@/lib/format";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const AVATAR_COLORS = [
  "bg-primary/15 text-primary",
  "bg-teal/15 text-teal",
  "bg-amber/15 text-amber-dark",
  "bg-destructive/10 text-destructive",
];

function avatarColor(name: string) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx] ?? AVATAR_COLORS[0]!;
}

export function ContactCard({
  contact,
  href,
}: {
  contact: ContactWithRelations;
  href?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const tel = telLink(contact.phone);
  const wa = waLink(contact.whatsapp ?? contact.phone);

  async function copyContact() {
    const lines = [
      contact.full_name,
      contact.designation,
      contact.eng_subdivision?.name && `Sub-division: ${contact.eng_subdivision.name}`,
      contact.phone && `Phone: ${formatPhone(contact.phone)}`,
      contact.email && `Email: ${contact.email}`,
      contact.office_address && `Address: ${contact.office_address}`,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }

  const avatarCls = avatarColor(contact.full_name);

  return (
    <Card className="print-card flex h-full flex-col shadow-sm transition-all duration-200 hover:shadow-md">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold",
              avatarCls,
            )}
            aria-hidden
          >
            {initials(contact.full_name)}
          </div>

          <div className="min-w-0 flex-1">
            {href ? (
              <Link
                href={href}
                className="block truncate text-sm font-semibold leading-snug hover:text-primary"
              >
                {contact.full_name}
              </Link>
            ) : (
              <span className="block truncate text-sm font-semibold leading-snug">
                {contact.full_name}
              </span>
            )}
            <p className="truncate text-xs text-muted-foreground">
              {contact.designation}
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="no-print h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={copyContact}
            aria-label="Copy contact details"
            title="Copy contact"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-teal" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        {/* Org context */}
        {(contact.eng_subdivision || contact.division || contact.corporation) && (
          <p className="truncate rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] text-muted-foreground">
            {[
              contact.eng_subdivision?.name,
              contact.division?.name,
              contact.corporation?.name,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}

        {/* Contact details */}
        <dl className="space-y-1.5 text-xs">
          {contact.office_address && (
            <div className="flex items-start gap-1.5 text-foreground/70">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="line-clamp-2">{contact.office_address}</span>
            </div>
          )}
          {contact.office_timing && (
            <div className="flex items-center gap-1.5 text-foreground/70">
              <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span>{contact.office_timing}</span>
            </div>
          )}
          {contact.phone && (
            <div className="flex items-center gap-1.5 text-foreground/70">
              <Phone className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="tabular-nums">{formatPhone(contact.phone)}</span>
            </div>
          )}
          {!contact.phone && !contact.email && (
            <p className="italic text-muted-foreground">
              {orDash(null)} No contact channel on record.
            </p>
          )}
        </dl>

        {/* Badges */}
        <div className="mt-auto flex flex-wrap gap-1 pt-1">
          <VerificationBadge status={contact.verification_status} />
          <ConfidenceBadge score={contact.confidence_score} />
          {contact.source === "engineers_seed.json" && <UnverifiedSeedTag />}
          {contact.source === "sample" && <SampleBadge />}
        </div>

        {/* Action buttons */}
        <div className="no-print flex flex-wrap gap-1.5">
          {tel && (
            <Button asChild size="sm" variant="outline" className="h-8 flex-1 text-xs">
              <a href={tel}>
                <Phone className="h-3.5 w-3.5" /> Call
              </a>
            </Button>
          )}
          {wa && (
            <Button asChild size="sm" variant="outline" className="h-8 flex-1 text-xs">
              <a href={wa} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
            </Button>
          )}
          {contact.email && (
            <Button asChild size="sm" variant="outline" className="h-8 flex-1 text-xs">
              <a href={`mailto:${contact.email}`}>
                <Mail className="h-3.5 w-3.5" /> Email
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
