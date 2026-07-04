import { Skeleton } from "@/components/ui/skeleton";

export default function ComplaintDashboardLoading() {
  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8 bg-[#F8FAFC] min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="mt-2 h-4 w-[560px] max-w-full rounded" />
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-2xl border bg-card p-6 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-5 w-5 rounded-full" />
            </div>
            <Skeleton className="h-8 w-16 rounded" />
            <Skeleton className="h-3.5 w-28 rounded" />
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-32 rounded-xl" />
          <Skeleton className="h-9 w-44 rounded-xl" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-52 rounded-xl" />
          <Skeleton className="h-9 w-28 rounded-xl" />
        </div>
      </div>

      {/* Map canvas */}
      <Skeleton className="h-[520px] w-full rounded-2xl border bg-card shadow-sm" />

      {/* Bottom details and legend */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <Skeleton className="h-4 w-44 rounded" />
        <div className="flex items-center gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4.5 w-16 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
