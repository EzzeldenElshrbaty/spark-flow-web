import { IconChevronDown } from '@tabler/icons-react'
import clsx from 'clsx'
import { useNavigate } from 'react-router'
import type { Workspace } from '@/api/types'
import { Icon } from '@/components/sf/Icon'
import { Menu, MenuHeading, MenuItem } from '@/components/sf/Menu'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { paths } from '@/lib/paths'

/** "Spark Engineering" → "SE". */
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

/** The top bar's round buttons (spec 5.2): 36px, a hairline ring, the surface on hover. */
const round = 'sf-focus inline-grid size-sf-control flex-none place-items-center rounded-sf-full border border-sf-line'

/** Round workspace button in the top bar; its menu lists the workspaces, with a check on the open one. */
export function WorkspaceSwitcher() {
  const { workspace, workspaces } = useCurrentWorkspace()
  const navigate = useNavigate()

  // Until the list arrives, a pulse circle holds the button's place.
  if (!workspace) return <span className={clsx(round, 'animate-pulse bg-sf-surface-hover')} aria-hidden />

  // The workspace's own landing route checks the place last visited there (it may be gone) and falls back to #general.
  const pick = (target: Workspace) => target.slug !== workspace.slug && navigate(paths.workspace(target.slug))

  return (
    <Menu
      label="Workspace"
      trigger={(props) => (
        // From 1440px the button names the workspace (UX Phase 2, 2.6); below it, the round initials leave room for a running timer.
        <button
          type="button"
          {...props}
          title={`Workspace: ${workspace.name}`}
          className={clsx(round, 'cursor-pointer text-sf-text-secondary hover:bg-sf-surface-hover hover:text-sf-text min-[1440px]:inline-flex min-[1440px]:w-auto min-[1440px]:max-w-48 min-[1440px]:items-center min-[1440px]:gap-1 min-[1440px]:px-3')}
        >
          <span aria-hidden className="font-sf text-[11px]/none font-semibold tracking-tight min-[1440px]:hidden">
            {initialsOf(workspace.name)}
          </span>
          <span aria-hidden className="sf-small truncate whitespace-nowrap max-[1440px]:hidden">
            {workspace.name}
          </span>
          {/* Named by its text, not an aria-label, so what it shows (initials or name) never disagrees with its name. */}
          <span className="sr-only">Workspace: {workspace.name}</span>
          <Icon icon={IconChevronDown} size={16} className="flex-none max-[1440px]:hidden" aria-hidden />
        </button>
      )}
    >
      <MenuHeading>Workspace</MenuHeading>
      {workspaces.map((item) => (
        <MenuItem key={item.id} checked={item.slug === workspace.slug} onSelect={() => pick(item)}>
          {item.name}
        </MenuItem>
      ))}
    </Menu>
  )
}
