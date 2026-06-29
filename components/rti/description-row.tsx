import * as React from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DescriptionRowProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  onCopy?: () => void;
}

export function DescriptionRow({
  label,
  value,
  icon,
  badge,
  onCopy,
}: DescriptionRowProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (onCopy) {
      onCopy();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 gap-x-4 gap-y-1 py-2.5 border-b border-slate-50 dark:border-slate-800/60 last:border-0 min-w-0 items-start">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 sm:col-span-4 lg:col-span-5 flex items-center gap-1.5 pt-0.5 whitespace-normal break-words">
        {icon && <span className="text-slate-400 shrink-0">{icon}</span>}
        <span>{label}</span>
      </dt>
      <dd className="text-xs font-semibold text-slate-800 dark:text-slate-200 sm:col-span-8 lg:col-span-7 min-w-0 break-words whitespace-normal flex flex-wrap items-center gap-1.5">
        <span className="flex-1 min-w-0 break-words overflow-wrap-anywhere">{value}</span>
        {badge && <span className="shrink-0">{badge}</span>}
        {onCopy && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            className="h-5 w-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0"
            aria-label={`Copy ${label}`}
          >
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </Button>
        )}
      </dd>
    </div>
  );
}
