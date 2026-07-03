import { Skeleton } from "@/components/ui/skeleton";

export default function ComplaintDashboardLoading() {
  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Skeleton className="h-8 w-52" />
          <Skeleton className="mt-2 h-4 w-[440px] max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-36 rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[340px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
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

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card overflow-hidden shadow-sm lg:col-span-2">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-5 py-3.5">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="p-4">
            <Skeleton className="h-56 w-full rounded-lg" />
          </div>
        </div>
        <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
          <div className="flex items-center justify-between border-b bg-muted/40 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-3.5 w-10" />
          </div>
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="mt-1.5 h-3 w-2/3" />
                </div>
                <Skeleton className="h-5 w-12 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
