import { Skeleton } from "@/components/ui/skeleton";

export default function RtiDashboardLoading() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-[440px] max-w-full" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <Skeleton className="h-7 w-10" />
                <Skeleton className="mt-2 h-3.5 w-16" />
              </div>
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border bg-card overflow-hidden shadow-sm">
            <div className="flex items-center justify-between border-b bg-muted/40 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-40" />
              </div>
              <Skeleton className="h-3.5 w-16" />
            </div>
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between gap-4 rounded-lg border p-3.5">
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="mt-1.5 h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
