import { Skeleton } from "@/components/ui/skeleton";

export default function ExplorerLoading() {
  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="mt-2 h-4 w-[560px] max-w-full" />
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex items-center gap-2">
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 w-40 rounded-lg" />
        <Skeleton className="ml-auto h-8 w-36 rounded-lg" />
      </div>

      {/* Map canvas */}
      <Skeleton className="h-[clamp(380px,62vh,660px)] w-full rounded-xl" />

      {/* Detail bar + legend */}
      <Skeleton className="mt-3 h-9 w-full rounded-lg" />
      <div className="mt-3 flex flex-wrap gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-28" />
        ))}
      </div>
    </div>
  );
}
