/** Shimmering placeholder columns shown while jobs load for the first time. */
export function BoardSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden" aria-label="Loading jobs" role="status">
      {Array.from({ length: 5 }, (_, column) => (
        <div
          key={column}
          className="w-80 shrink-0 space-y-2.5 rounded-2xl border border-slate-200/70 bg-slate-100/60 p-2.5 xl:w-auto xl:flex-1 dark:border-white/[0.06] dark:bg-white/[0.02]"
        >
          <div className="skeleton mx-1 my-1.5 h-4 w-24 rounded" />
          {Array.from({ length: column === 0 ? 4 : 2 }, (_, card) => (
            <div key={card} className="space-y-3 rounded-xl border border-slate-200/60 bg-white p-3.5 dark:border-white/[0.05] dark:bg-[#141821]">
              <div className="flex gap-3">
                <div className="skeleton h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3.5 w-4/5 rounded" />
                  <div className="skeleton h-3 w-1/2 rounded" />
                </div>
              </div>
              <div className="skeleton h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
