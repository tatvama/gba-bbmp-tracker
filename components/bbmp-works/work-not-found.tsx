import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

const DEFAULT_SUGGESTIONS = [
  "Check whether the job number is correct",
  "Enter the ward number",
  "Add the work location or road name",
  "Add division or sub-division details",
  "Enter the work order number or tender number if available",
];

export function WorkNotFound({ suggestions }: { suggestions?: string[] }) {
  const list = suggestions && suggestions.length > 0 ? suggestions : DEFAULT_SUGGESTIONS;
  return (
    <EmptyState title="No official work records found" icon={SearchX}>
      <ul className="list-disc space-y-1 pl-5 text-left text-xs text-muted-foreground">
        {list.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <Link href="/search" className="mt-4 inline-block text-sm text-primary hover:underline">
        Try the general search instead →
      </Link>
    </EmptyState>
  );
}
