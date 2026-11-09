import { IconLayoutKanban, IconMessages, type TablerIcon } from '@tabler/icons-react'
import clsx from 'clsx'
import { useRef, type KeyboardEvent } from 'react'
import { Count } from '@/components/sf/Badge'
import { Icon } from '@/components/sf/Icon'
import { Tooltip } from '@/components/sf/Tooltip'
import { useGoToMode } from '@/layout/useGoToMode'
import { useSidebarGroups } from '@/layout/useSidebarGroups'
import { useWorkspaceMode } from '@/layout/useWorkspaceMode'
import type { WorkspaceMode } from '@/lib/workspaceMode'

/** sidebar: 40px under the logo · rail: 48×88 upright, in the collapsed sidebar · phone: 48px, in the menu drawer. */
export type ModeSwitchSize = 'sidebar' | 'rail' | 'phone'

const SIDES: { mode: WorkspaceMode; label: string; icon: TablerIcon; key: string }[] = [
  { mode: 'projects', label: 'Projects', icon: IconLayoutKanban, key: 'P' },
  { mode: 'chat', label: 'Chat', icon: IconMessages, key: 'C' },
]

/**
 * The two sides of Flow under the logo (spec 5.5, design system ModeSwitch): a white thumb under the side on screen,
 * the other side's news on it (Chat its red count, Projects a dot), arrow keys between them, Enter or a click to go.
 */
export function ModeSwitch({
  mode,
  chatCount,
  projectNews,
  size = 'sidebar',
  onSelect,
}: {
  mode: WorkspaceMode
  /** The Chat side's red count: every chat row's count (useSidebarGroups). */
  chatCount: number
  /** I have unread mentions in task comments: the Projects side's dot. */
  projectNews: boolean
  size?: ModeSwitchSize
  onSelect: (mode: WorkspaceMode) => void
}) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const upright = size === 'rail'

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = SIDES.length - 1
    const next =
      event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key) ? (index === 0 ? 1 : 0)
      : null
    if (next === null) return
    event.preventDefault()
    tabs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Workspace"
      aria-orientation={upright ? 'vertical' : 'horizontal'}
      className={clsx(
        'relative grid flex-none rounded-sf-lg bg-sf-sidebar-hover p-1 shadow-[inset_0_0_0_1px_var(--ink-700)]',
        upright ? 'h-[88px] w-12 grid-rows-2' : clsx('w-full grid-cols-2', size === 'phone' ? 'h-12' : 'h-10'),
      )}
    >
      <span
        aria-hidden
        data-thumb
        className={clsx(
          'absolute rounded-sf-md bg-sf-white shadow-[0_1px_2px_rgba(0,0,0,0.5)] dark:bg-sf-ink-700 transition-transform duration-300 ease-sf motion-reduce:transition-none',
          upright
            ? clsx('inset-x-1 top-1 h-[calc(50%-4px)]', mode === 'chat' && 'translate-y-full')
            : clsx('inset-y-1 start-1 w-[calc(50%-4px)]', mode === 'chat' && 'translate-x-full rtl:-translate-x-full'),
        )}
      />
      {SIDES.map((side, index) => {
        const selected = side.mode === mode
        const count = !selected && side.mode === 'chat' ? chatCount : 0
        const dot = !selected && side.mode === 'projects' && projectNews
        return (
          <Tooltip key={side.mode} label={selected ? side.label : `Switch to ${side.label}`} shortcut={['G', side.key]}>
            <button
              ref={(el) => {
                tabs.current[index] = el
              }}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                if (!selected) onSelect(side.mode)
              }}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={clsx(
                'sf-focus relative z-[1] flex min-w-0 cursor-pointer items-center justify-center gap-2 rounded-sf-md font-sf text-[14px]/[20px] font-medium transition-colors duration-150 ease-sf',
                upright ? 'px-0' : 'px-2',
                // On a dark screen the thumb is the raised ink, not white (UX Phase 3, 3.6).
                selected ? 'text-sf-ink-950 dark:text-sf-white' : 'text-sf-sidebar-text hover:bg-sf-sidebar-active hover:text-sf-sidebar-text-strong',
              )}
            >
              <Icon icon={side.icon} size={18} className={selected ? 'text-sf-red-600 dark:text-sf-red-400' : undefined} />
              <span className={upright ? 'sr-only' : 'truncate'}>{side.label}</span>
              {count > 0 && (
                <>
                  <span className="sr-only">, </span>
                  <Count value={count} label="unread" className={upright ? 'absolute -end-2 -top-1.5 shadow-[0_0_0_2px_var(--app-frame)]' : undefined} />
                </>
              )}
              {dot && (
                <>
                  <span aria-hidden className={clsx('size-2 flex-none rounded-sf-full bg-sf-accent-fill', upright && 'absolute end-0 top-0')} />
                  <span className="sr-only">, new mentions in tasks</span>
                </>
              )}
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}

/** The switch as the shell shows it: the side on screen, its badges, and going to the other side's last place. */
export function WorkspaceModeSwitch({ size = 'sidebar', onNavigate }: { size?: ModeSwitchSize; onNavigate?: () => void }) {
  const mode = useWorkspaceMode()
  const { workspace, chatCount, projectNews } = useSidebarGroups()
  const go = useGoToMode()
  if (!workspace) return null
  return (
    <ModeSwitch
      mode={mode}
      chatCount={chatCount}
      projectNews={projectNews > 0}
      size={size}
      onSelect={(next) => {
        if (go(next)) onNavigate?.()
      }}
    />
  )
}
