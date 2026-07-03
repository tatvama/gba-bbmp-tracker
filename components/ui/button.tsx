import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none",
    "ring-offset-background transition-all duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "active:scale-[0.98] active:duration-75",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/95 hover:opacity-[0.99]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/95 hover:opacity-[0.99]",
        outline:
          "border border-border/80 bg-background shadow-3xs hover:bg-muted/70 hover:border-border/100 hover:text-foreground",
        secondary:
          "bg-secondary/80 text-secondary-foreground shadow-3xs hover:bg-secondary hover:text-foreground",
        ghost:
          "hover:bg-muted/70 hover:text-foreground",
        link:
          "h-auto p-0 text-primary underline-offset-4 hover:underline shadow-none",
        teal:
          "bg-accent text-accent-foreground shadow-xs hover:bg-accent/95 hover:opacity-[0.99]",
        amber:
          "bg-amber text-white shadow-xs hover:bg-amber/95 hover:opacity-[0.99]",
      },
      size: {
        default:   "h-9 rounded-md px-4 text-sm [&_svg]:size-4",
        sm:        "h-8 rounded-md px-3 text-xs [&_svg]:size-3.5",
        lg:        "h-10 rounded-md px-6 text-sm [&_svg]:size-4",
        xl:        "h-11 rounded-lg px-8 text-base [&_svg]:size-5",
        icon:      "h-9 w-9 rounded-md [&_svg]:size-4",
        "icon-sm": "h-7 w-7 rounded-md [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function BtnSpinner() {
  return (
    <svg
      className="animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        aria-busy={(!asChild && loading) || undefined}
        disabled={props.disabled || (!asChild && loading)}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <BtnSpinner />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
