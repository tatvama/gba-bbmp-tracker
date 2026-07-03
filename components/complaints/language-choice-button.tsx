"use client";

import * as React from "react";
import { ChevronDown, Loader2, Languages } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { DraftLanguage } from "@/lib/constants";

/**
 * A drop-in replacement for an action button that generates a letter/draft.
 * Instead of firing immediately, clicking it opens a small menu asking the user
 * to draft in English or Kannada ("ask each time"), then calls onChoose with the
 * picked language. Only English / Kannada are offered — the two languages the
 * user works in for BBMP/GBA correspondence.
 */
export function LanguageChoiceButton({
  onChoose,
  busy,
  disabled,
  icon: Icon,
  children,
  size = "sm",
  variant = "default",
  className,
}: {
  onChoose: (language: DraftLanguage) => void;
  busy?: boolean;
  disabled?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled || busy}>
        <Button size={size} variant={variant} className={className} disabled={disabled || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : <Languages className="h-4 w-4" />}
          {children}
          {!busy && <ChevronDown className="ml-auto h-3.5 w-3.5 opacity-70" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[10rem]">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          ಯಾವ ಭಾಷೆಯಲ್ಲಿ ಕರಡು? / Draft in…
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onChoose("Kannada")}>ಕನ್ನಡ (Kannada)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onChoose("English")}>English</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
