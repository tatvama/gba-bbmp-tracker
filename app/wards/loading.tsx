import { Skeleton } from "@/components/ui/skeleton";

export default function WardsLoading() {
  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-2 h-4 w-[480px] max-w-full" />
      </div>

      {/* Filter bar */}
      <div className="mb-3 flex flex-wrap gap-2">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-9 w-36 rounded-lg" />
        <Skeleton className="h-9 w-44 rounded-lg" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-9 w-20 rounded-lg" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card shadow-sm">
        {/* Header row */}
        <div className="flex gap-4 border-b px-4 py-3">
          {[40, 160, 180, 120, 140, 100, 140, 120, 80, 80].map((w, i) => (
            <Skeleton key={i} className="h-4" style={{ width: w }} />
          ))}
        </div>
        {/* Data rows */}
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 border-b px-4 py-3 last:border-0 odd:bg-muted/10"
          >
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-44 rounded-full" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="mt-3 flex items-center justify-between">
        <Skeleton className="h-4 w-20" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </div>
    </div>
  );
}
