import { useEffect, useState } from 'react'

/** Returns `value`, but only after it stopped changing for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

export type Theme = 'light' | 'dark'

function readStoredTheme(): Theme | null {
  try {
    const saved = localStorage.getItem('theme')
    return saved === 'light' || saved === 'dark' ? saved : null
  } catch {
    return null
  }
}

/** Dark mode: follows the OS until you toggle it, then remembers your choice. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(
    () => readStoredTheme() ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const toggle = () => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem('theme', next)
      } catch {
        /* storage blocked: theme still switches for this session */
      }
      return next
    })
  }

  return [theme, toggle]
}

/** Load a value from localStorage (e.g. saved filters), falling back to `initial`. */
export function usePersistentState<T extends object>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? { ...initial, ...(JSON.parse(raw) as T) } : initial
    } catch {
      return initial
    }
  })

  const update = (next: T) => {
    setValue(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  return [value, update]
}
