import clsx from 'clsx'
import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { MenuPanel } from '@/components/ui/Menu'

/** `disabledHint` disables the action and explains why (tooltip). */
export type RecordAction = { label: string; icon: LucideIcon; onSelect: () => void; danger?: boolean; disabledHint?: string }
export type RecordMeta = { icon: ReactNode; label: ReactNode; title?: string; onClick?: () => void }

/**
 * The top of a record page (lead, opportunity, client): avatar, name and status, a row of small facts,
 * and actions on one line — a primary button, optional secondary ones, and the rest under "⋯".
 * On phones the actions move to a bar pinned above the bottom navigation.
 */
export function RecordHeader({
  avatar,
  title,
  badges,
  meta,
  primary,
  secondary = [],
  more = [],
}: {
  avatar: ReactNode
  title: string
  badges?: ReactNode
  meta: RecordMeta[]
  primary?: RecordAction
  secondary?: RecordAction[]
  more?: RecordAction[]
}) {
  const hasActions = !!primary || secondary.length > 0 || more.length > 0
  return (
    <>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="shrink-0 [&>span]:size-10 [&>span]:text-sm">{avatar}</span>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="truncate text-xl font-semibold tracking-tight text-fg sm:text-2xl">{title}</h1>
              {badges}
            </div>
            <ul className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
              {meta.map((item, index) => {
                const content = (
                  <>
                    <span className="flex shrink-0 items-center [&>svg]:size-3.5">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </>
                )
                return (
                  <li key={index} className="flex min-w-0 max-w-full items-center gap-1.5" title={item.title}>
                    {item.onClick ? (
                      <button type="button" onClick={item.onClick} className="flex min-w-0 items-center gap-1.5 rounded hover:text-fg">
                        {content}
                      </button>
                    ) : (
                      content
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        {hasActions && (
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            {primary && (
              <Button onClick={primary.onSelect}>
                <primary.icon className="size-4" /> {primary.label}
              </Button>
            )}
            {secondary.map((action) => (
              // A wrapper keeps the tooltip working while the button is disabled.
              <span key={action.label} title={action.disabledHint}>
                <Button variant="secondary" onClick={action.onSelect} disabled={!!action.disabledHint}>
                  <action.icon className="size-4" /> {action.label}
                </Button>
              </span>
            ))}
            {more.length > 0 && <MoreMenu actions={more} />}
          </div>
        )}
      </div>

      {/* Phones: the main action and "⋯" pinned above the bottom navigation. */}
      {hasActions && (
        <>
          <div className="fixed inset-x-0 bottom-[calc(3.5rem+var(--timer-bar,0px)+env(safe-area-inset-bottom))] z-20 flex gap-2 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur sm:hidden">
            {primary && (
              <Button className="flex-1" onClick={primary.onSelect}>
                <primary.icon className="size-4" /> {primary.label}
              </Button>
            )}
            {(secondary.length > 0 || more.length > 0) && <MoreMenu actions={[...secondary, ...more]} />}
          </div>
        </>
      )}
    </>
  )
}

/** Put at the end of a record page that has a RecordHeader, so the phone action bar doesn't cover the last content. */
export function RecordActionBarSpacer() {
  return <div className="h-[calc(4rem+var(--timer-bar,0px))] sm:hidden" aria-hidden />
}

export function MoreMenu({ actions }: { actions: RecordAction[] }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        title="More actions"
        className="flex size-9 items-center justify-center rounded-lg text-fg-secondary ring-1 ring-line transition-colors hover:bg-surface-muted"
      >
        <MoreHorizontal className="size-4" />
      </button>
      <MenuPanel open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} label="More actions" className="p-1.5 sm:w-56">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            role="menuitem"
            disabled={!!action.disabledHint}
            title={action.disabledHint}
            onClick={() => {
              setOpen(false)
              action.onSelect()
            }}
            className={clsx(
              'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50',
              action.danger ? 'text-red-600 dark:text-red-400' : 'text-fg-secondary',
            )}
          >
            <action.icon className="size-4 shrink-0" />
            <span className="min-w-0">
              {action.label}
              {action.disabledHint && <span className="block text-xs text-fg-muted">{action.disabledHint}</span>}
            </span>
          </button>
        ))}
      </MenuPanel>
    </div>
  )
}
