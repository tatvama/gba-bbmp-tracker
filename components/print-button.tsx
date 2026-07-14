"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/client";

export function PrintButton({ className }: { className?: string }) {
  const { t } = useTranslation("common");
  return (
    <Button size="sm" variant="outline" onClick={() => window.print()} className={className}>
      <Printer className="h-4 w-4 mr-1" /> {t("action.print")}
    </Button>
  );
}
