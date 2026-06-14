import { Skeleton } from "@/components/ui/skeleton";

export default function SearchLoading() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="mt-2 h-4 w-80" />
        <Skeleton className="mt-4 h-11 w-full rounded-xl" />
      </div>

      <div className="space-y-6">
        {[3, 4, 2].map((count, gi) => (
          <div key={gi}>
            <div className="mb-2 flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded-md" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-6 rounded-full" />
            </div>
            <div className="rounded-xl border bg-card shadow-sm">
              {Array.from({ length: count }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b px-4 py-3 last:border-0"
                >
                  <div>
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="mt-1 h-3 w-32" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
