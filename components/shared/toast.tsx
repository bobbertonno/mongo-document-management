'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type ToastVariant = 'success' | 'warning' | 'important' | 'note'

interface ToastInput {
  variant?: ToastVariant
  title: string
  description?: string
}

interface ToastItem extends ToastInput {
  id: number
}

interface ToastContextValue {
  pushToast: (toast: ToastInput) => number
}

const ToastContext = createContext<ToastContextValue | null>(null)

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-l-[#00A35C]',
  warning: 'border-l-[#DB3030]',
  important: 'border-l-[#FFC010]',
  note: 'border-l-[#016BF8]',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const pushToast = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++
      setToasts((current) => [...current.slice(-3), { ...toast, id }])
      setTimeout(() => dismiss(id), 5000)
      return id
    },
    [dismiss],
  )

  const value = useMemo(() => ({ pushToast }), [pushToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 left-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.variant === 'warning' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-xl border border-l-4 border-[#E8EDEB] bg-white p-3 shadow-lg',
              VARIANT_STYLES[t.variant ?? 'note'],
            )}
          >
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#001E2B]">{t.title}</p>
              {t.description && <p className="mt-0.5 text-sm text-[#5C6C75]">{t.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="rounded px-1 text-sm text-[#5C6C75] hover:text-[#001E2B]"
              aria-label="Dismiss notification"
            >
              {'×'}
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
