import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-none tracking-wide transition-colors focus:outline-none select-none",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.1)] dark:shadow-[0_0_15px_rgba(239,68,68,0.15)]",
        outline:
          "border-border text-foreground bg-transparent",
        success:
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)] dark:shadow-[0_0_15px_rgba(16,185,129,0.15)]",
        warning:
          "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.1)] dark:shadow-[0_0_15px_rgba(245,158,11,0.15)]",
        muted:
          "border-transparent bg-muted text-muted-foreground dark:bg-muted/60 dark:text-muted-foreground",
        info:
          "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-950/30 dark:text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.1)] dark:shadow-[0_0_15px_rgba(59,130,246,0.15)]",
        critical:
          "border-transparent bg-red-600 text-white dark:bg-red-500 dark:text-white",
        "primary-subtle":
          "border-primary/25 bg-primary/[0.08] text-primary dark:border-primary/30 dark:bg-primary/10 dark:text-primary-foreground",
        "teal-solid":
          "border-transparent bg-accent text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-90 animate-indicator-blink"
        />
      )}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
