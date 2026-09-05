'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

type ToastTone = 'default' | 'danger'
type Toast = { id: number; message: string; tone: ToastTone }

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

const DISMISS_MS = 3200

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)
  // Timers are tracked so unmounting mid-flight doesn't leave setState
  // callbacks pointed at a dead tree.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  const push = useCallback((message: string, tone: ToastTone = 'default') => {
    const id = nextId.current++
    setToasts((prev) => [...prev, { id, message, tone }])
    timers.current.push(
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), DISMISS_MS)
    )
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              'card-modal px-3 py-2 text-base animate-landing-reveal ' +
              (t.tone === 'danger' ? 'text-danger' : 'text-foreground')
            }
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
