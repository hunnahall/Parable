'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// Bottom-right Level 2 toast (components.css .cw-toast): auto-dismiss
// after 5s, one action at most. Copy is past tense, two or three words,
// with Undo when the action can be reversed.
type ToastTone = 'default' | 'danger'
type ToastAction = { label: string; onClick: () => void }
type Toast = { id: number; message: string; tone: ToastTone; action?: ToastAction }

type PushToast = (message: string, tone?: ToastTone, action?: ToastAction) => void

const ToastContext = createContext<PushToast>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

const DISMISS_MS = 5000

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

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback<PushToast>(
    (message, tone = 'default', action) => {
      const id = nextId.current++
      setToasts((prev) => [...prev, { id, message, tone, action }])
      timers.current.push(setTimeout(() => dismiss(id), DISMISS_MS))
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-4 right-4 left-4 z-[80] flex flex-col items-end gap-2 pointer-events-none min-[640px]:left-auto"
      >
        {toasts.map((t) => (
          <div key={t.id} className="cw-toast animate-overlay-in pointer-events-auto">
            {t.tone === 'danger' && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-hidden="true" />
            )}
            <span className="cw-toast__text">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="cw-toast__action"
                onClick={() => {
                  t.action?.onClick()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
