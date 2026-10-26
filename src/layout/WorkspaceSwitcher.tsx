import clsx from 'clsx'
import { Check } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import type { Workspace } from '@/api/types'
import { MenuPanel } from '@/components/ui/Menu'
import { roundButtonClass, roundButtonFill } from '@/components/ui/styles'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { paths, savedPlace } from '@/lib/paths'
import { useUiStore } from '@/lib/uiStore'

/** "Spark Engineering" → "SE". */
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

function Initials({ workspace, className }: { workspace: Workspace; className: string }) {
  return (
    <span className={clsx('inline-flex items-center justify-center rounded-full bg-surface-muted font-semibold tracking-tight text-fg-secondary', className)} aria-hidden>
      {initialsOf(workspace.name)}
    </span>
  )
}

/** Round workspace button in the top bar; its menu lists the workspaces, with a check on the open one. */
export function WorkspaceSwitcher() {
  const { workspace, workspaces } = useCurrentWorkspace()
  const lastVisited = useUiStore((state) => state.lastVisited)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Until the list arrives, a pulse circle holds the button's place.
  if (!workspace) return <span className={clsx(roundButtonClass, 'animate-pulse bg-surface-strong')} aria-hidden />

  const pick = (target: Workspace) => {
    setOpen(false)
    triggerRef.current?.focus()
    if (target.slug === workspace.slug) return
    // Back to where you left off there; a workspace not opened yet decides for itself (#general, else its first channel).
    navigate(savedPlace(target.slug, lastVisited) ?? paths.workspace(target.slug))
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Workspace: ${workspace.name}`}
        title={`Workspace: ${workspace.name}`}
        className={clsx(roundButtonClass, roundButtonFill)}
      >
        <Initials workspace={workspace} className="size-6 text-[10px]" />
      </button>
      <MenuPanel open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} label="Workspace" className="p-1.5 sm:w-64">
        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Workspace</p>
        {workspaces.map((item) => {
          const current = item.slug === workspace.slug
          return (
            <button
              key={item.id}
              type="button"
              role="menuitemradio"
              aria-checked={current}
              onClick={() => pick(item)}
              className={clsx('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm hover:bg-surface-muted', current ? 'font-medium text-fg' : 'text-fg-secondary')}
            >
              <Initials workspace={item} className="size-5 shrink-0 text-[9px]" />
              <span className="flex-1 truncate">{item.name}</span>
              {current && <Check className="size-4 text-accent" />}
            </button>
          )
        })}
      </MenuPanel>
    </div>
  )
}
