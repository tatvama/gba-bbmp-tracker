import { Skeleton } from "@/components/ui/skeleton";

export default function BBMPWorkSearchLoading() {
  return (
    <div className="mx-auto max-w-4xl">
      {/* Header + form */}
      <div className="mb-8">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-2 h-4 w-[420px] max-w-full" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-1.5 h-9 w-full rounded-md" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-3 h-9 w-28 rounded-md" />
      </div>

      {/* Results */}
      <div className="rounded-xl border bg-card shadow-sm">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-0">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
