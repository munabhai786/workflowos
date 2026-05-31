export const StatCardSkeleton = () => (
  <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="mb-3 h-10 w-10 rounded-xl bg-slate-200" />
    <div className="mb-2 h-8 w-16 rounded-lg bg-slate-200" />
    <div className="mb-1 h-3 w-24 rounded bg-slate-100" />
    <div className="h-3 w-20 rounded bg-slate-100" />
  </div>
);

export const ListItemSkeleton = ({ count = 3 }) => (
  <div className="space-y-3">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="flex animate-pulse items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-slate-200" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3 w-3/4 rounded bg-slate-200" />
          <div className="h-3 w-1/2 rounded bg-slate-100" />
        </div>
        <div className="h-6 w-14 rounded-full bg-slate-100" />
      </div>
    ))}
  </div>
);

export const SkeletonList = ListItemSkeleton;

export const ChartSkeleton = ({ height = 240 }) => (
  <div
    className="animate-pulse rounded-lg bg-slate-50"
    style={{ height }}
  />
);
