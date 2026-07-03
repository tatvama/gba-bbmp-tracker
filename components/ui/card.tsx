import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { elevated?: boolean; interactive?: boolean }
>(({ className, elevated, interactive, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-border/60 bg-card text-card-foreground shadow-xs transition-all duration-200 ease-in-out hover:border-border/80",
      elevated && "shadow-md hover:shadow-lg hover:border-primary/10 transition-all duration-250",
      interactive && [
        "cursor-pointer transition-all duration-250 cubic-bezier(0.16, 1, 0.3, 1)",
        "hover:-translate-y-1 hover:shadow-md hover:border-primary/20 hover:bg-card/98",
        "active:translate-y-0 active:scale-[0.99] active:shadow-xs",
      ],
      !elevated && !interactive && "hover:shadow-sm",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-base font-bold leading-snug tracking-tight text-foreground/90", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-xs leading-relaxed text-muted-foreground/80 font-medium", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center gap-2 border-t border-border/50 bg-muted/10 p-6 rounded-b-xl",
      className,
    )}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

const CardSection = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("border-t p-6", className)}
    {...props}
  />
));
CardSection.displayName = "CardSection";

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  CardSection,
};
