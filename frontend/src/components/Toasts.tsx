export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  message: string
}

interface ToastsProps {
  toasts: Toast[]
  onDismiss: (id: number) => void
}

/** Small stack of notifications in the bottom-right corner. */
export function Toasts({ toasts, onDismiss }: ToastsProps) {
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2" aria-live="polite">
      {toasts.map((toast) => {
        const colour =
          toast.kind === 'error'
            ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-950 dark:text-rose-100'
            : toast.kind === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950 dark:text-emerald-100'
              : 'border-slate-300 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
        return (
          <div key={toast.id} className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${colour}`}>
            <p className="flex-1">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="opacity-60 hover:opacity-100"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
