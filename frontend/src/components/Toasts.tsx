import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  message: string
}

interface ToastsProps {
  toasts: Toast[]
  onDismiss: (id: number) => void
}

const STYLES = {
  success: { icon: CheckCircle2, colour: 'text-emerald-500' },
  error: { icon: AlertCircle, colour: 'text-rose-500' },
  info: { icon: Info, colour: 'text-indigo-500' },
} as const

/** Stack of notifications in the bottom-right corner. */
export function Toasts({ toasts, onDismiss }: ToastsProps) {
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
      {toasts.map((toast) => {
        const { icon: Icon, colour } = STYLES[toast.kind]
        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex animate-toast-in items-start gap-3 rounded-xl border border-slate-200/80 bg-white/95 px-4 py-3 text-sm shadow-xl shadow-slate-900/10 backdrop-blur dark:border-white/10 dark:bg-[#171b24]/95 dark:shadow-black/40"
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${colour}`} />
            <p className="flex-1 text-slate-700 dark:text-slate-200">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
