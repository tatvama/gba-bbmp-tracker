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
          "border-destructive/20 bg-destructive/10 text-destructive",
        outline:
          "border-border text-foreground bg-transparent",
        success:
          "border-teal/25 bg-teal/10 text-teal",
        warning:
          "border-amber/30 bg-amber/10 text-amber-700 dark:text-amber-400",
        muted:
          "border-transparent bg-muted text-muted-foreground",
        info:
          "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
        critical:
          "border-transparent bg-destructive text-destructive-foreground",
        "primary-subtle":
          "border-primary/25 bg-primary/[0.08] text-primary",
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
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80"
        />
      )}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
