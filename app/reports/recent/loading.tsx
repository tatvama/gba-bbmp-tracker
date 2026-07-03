import { Skeleton } from "@/components/ui/skeleton";

export default function RecentReportLoading() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-56 rounded-lg" />
        <Skeleton className="h-4 w-16" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-9 w-16 rounded-lg" />
          <Skeleton className="h-9 w-16 rounded-lg" />
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex gap-6 border-b px-4 py-3">
          {[120, 140, 100, 120].map((w, i) => (
            <Skeleton key={i} className="h-4" style={{ width: w }} />
          ))}
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex gap-6 border-b px-4 py-3 last:border-0 odd:bg-muted/10">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
