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
        // From lg the button names the workspace (UX Phase 2, 2.6); below it, the round initials keep the bar's room.
        <button
          type="button"
          {...props}
          title={`Workspace: ${workspace.name}`}
          aria-label={`Workspace: ${workspace.name}`}
          className={clsx(round, 'cursor-pointer text-sf-text-secondary hover:bg-sf-surface-hover hover:text-sf-text lg:w-auto lg:max-w-48 lg:gap-1 lg:px-3')}
        >
          <span aria-hidden className="font-sf text-[11px]/none font-semibold tracking-tight lg:hidden">
            {initialsOf(workspace.name)}
          </span>
          <span className="sf-small truncate max-lg:sr-only">{workspace.name}</span>
          <Icon icon={IconChevronDown} size={16} className="max-lg:hidden" aria-hidden />
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
