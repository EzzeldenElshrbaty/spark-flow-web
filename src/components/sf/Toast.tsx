import { IconX, type TablerIcon } from '@tabler/icons-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { IconButton } from './Button'
import { Icon } from './Icon'

/** How long a toast stays (spec 6.15); hover or focus pauses it. */
export const TOAST_MS = 5000

export type ToastInput = {
  message: string
  icon?: TablerIcon
  /**
   * At most one action. In this app a toast is only for Undo after a delete. A promise keeps the toast while it runs
   * ("Undoing…"); if it fails, the toast says why and stays until dismissed (UX Phase 6: the error near the Undo pressed).
   */
  action?: { label: string; pendingLabel?: string; onAction: () => void | Promise<unknown> }
}

type ToastState = (ToastInput & { id: number }) | null
const Ctx = createContext<{ toast: ToastState; show: (t: ToastInput) => void; dismiss: () => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null)
  const next = useRef(0)
  const show = useCallback((t: ToastInput) => setToast({ ...t, id: ++next.current }), [])
  const dismiss = useCallback(() => setToast(null), [])
  return <Ctx.Provider value={{ toast, show, dismiss }}>{children}</Ctx.Provider>
}

export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast needs a <ToastProvider>.')
  return ctx.show
}

/**
 * Where toasts appear: bottom-start of the main card (above the bottom bar on phones). Always mounted, so screen readers hear each new one
 * through the live region. A new toast replaces the current one.
 */
export function ToastRegion() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('ToastRegion needs a <ToastProvider>.')
  const { toast, dismiss } = ctx
  return (
    <div role="status" aria-live="polite" className="sf pointer-events-none fixed inset-x-4 bottom-24 z-[var(--z-toast)] lg:absolute lg:inset-x-auto lg:start-4 lg:bottom-4">
      {toast && <Toast key={toast.id} toast={toast} onDismiss={dismiss} />}
    </div>
  )
}

function Toast({ toast, onDismiss }: { toast: ToastInput; onDismiss: () => void }) {
  const [paused, setPaused] = useState(0) // counts hover + focus
  const [running, setRunning] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const act = (action: NonNullable<ToastInput['action']>) => {
    const result = action.onAction()
    if (!(result instanceof Promise)) return onDismiss()
    setRunning(true)
    result.then(onDismiss, (error: unknown) => {
      setRunning(false)
      setFailed(error instanceof Error ? error.message : String(error))
    })
  }
  const left = useRef(TOAST_MS)
  const startedAt = useRef(0)

  useEffect(() => {
    // Running or failed, it waits: the outcome must be seen.
    if (paused > 0 || running || failed) return
    startedAt.current = Date.now()
    const timer = window.setTimeout(onDismiss, left.current)
    return () => {
      window.clearTimeout(timer)
      left.current -= Date.now() - startedAt.current
    }
  }, [paused, running, failed, onDismiss])

  const pause = () => setPaused((p) => p + 1)
  const resume = () => setPaused((p) => Math.max(0, p - 1))

  return (
    <div
      onPointerEnter={pause}
      onPointerLeave={resume}
      onFocus={pause}
      onBlur={resume}
      className="sf-ui pointer-events-auto inline-flex min-h-11 items-center gap-3 rounded-sf-lg bg-sf-ink-950 py-2 ps-4 pe-2 text-sf-white shadow-sf-menu dark:shadow-[var(--shadow-menu),0_0_0_1px_var(--ink-700)]"
    >
      {toast.icon && !failed && <Icon icon={toast.icon} className="text-sf-white" />}
      <span>{failed ?? toast.message}</span>
      {toast.action && !failed && (
        <button
          type="button"
          disabled={running}
          onClick={() => toast.action && act(toast.action)}
          className="sf-focus cursor-pointer rounded-sf-md border-0 bg-transparent px-2 py-1 font-sf text-[14px]/[20px] font-medium text-sf-red-400 hover:bg-sf-ink-800"
        >
          {running ? (toast.action.pendingLabel ?? toast.action.label) : toast.action.label}
        </button>
      )}
      <IconButton label="Dismiss" icon={IconX} size="sm" tone="ink" onClick={onDismiss} />
    </div>
  )
}
