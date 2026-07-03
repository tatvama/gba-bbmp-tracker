import { Skeleton } from "@/components/ui/skeleton";

export default function RtiDetailLoading() {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <Skeleton className="h-8 w-72 max-w-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      <div className="mb-4 flex gap-4 overflow-hidden border-b pb-px">
        {[70, 130, 110, 100, 90, 100, 80].map((w, i) => (
          <Skeleton key={i} className="h-6 shrink-0" style={{ width: w }} />
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-5 shadow-sm">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="flex items-center justify-between gap-4 border-b py-2.5 last:border-0">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3.5 w-36" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
