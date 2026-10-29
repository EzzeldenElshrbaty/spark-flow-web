import clsx from 'clsx'
import { useQueryClient } from '@tanstack/react-query'
import { IconChevronDown, IconKey, IconLogout, IconMoon, IconSun } from '@tabler/icons-react'
import { useNavigate } from 'react-router'
import type { User } from '@/api/types'
import { useUsers, useViewAs } from '@/api/users'
import { Avatar } from '@/components/sf/Avatar'
import { Icon } from '@/components/sf/Icon'
import { Menu, MenuHeading, MenuItem, MenuSeparator, useCloseMenu } from '@/components/sf/Menu'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { backendOn } from '@/lib/api'
import { roleLabels } from '@/lib/roles'
import { useRole } from '@/lib/useRole'
import { useTheme } from '@/lib/useTheme'

/**
 * The account menu behind the avatar: who you are, Preferences, and Change password / Log out (once sign-in exists).
 * The redesign's menu (spec 5.2): a dropdown on desktop, a bottom sheet on phones.
 */
export function UserMenu() {
  const { persona } = useRole()
  // TODO(auth): signed in, also save the theme on the account so it follows the user to every device (as Spark CRM does).
  const { theme, setTheme } = useTheme()
  const { workspace } = useCurrentWorkspace()
  const people = useUsers(backendOn ? undefined : workspace?.id)
  const viewAs = useViewAs()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // Demo only: become someone else, then start fresh on that workspace's home, since what they may see differs. The
  // menu stays open until the switch lands, so a failure shows its sentence there (viewAs.isError).
  const switchTo = (userId: string, close: () => void) => {
    viewAs.mutate(userId, {
      onSuccess: () => {
        close()
        queryClient.clear()
        navigate(workspace ? `/w/${workspace.slug}` : '/')
      },
    })
  }

  // The account loads after the shell: until the name is known, the avatar is a pulse placeholder.
  const loaded = Boolean(persona.name)
  return (
    <Menu
      label="Account"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className="sf-focus flex h-11 flex-none cursor-pointer items-center gap-2 rounded-sf-md ps-1 pe-2 hover:bg-sf-surface-hover"
        >
          {loaded ? (
            <Avatar id={persona.id} name={persona.name} presence={people.data?.find((u) => u.id === persona.id)?.presence} decorative />
          ) : (
            <span aria-hidden className="size-sf-avatar animate-pulse rounded-sf-md bg-sf-surface-hover" />
          )}
          {/* Named by the name and title it shows; on a phone they're there for screen readers only. */}
          {loaded ? (
            <span className="sr-only text-start md:not-sr-only md:block">
              <span className="sf-ui-medium block text-sf-text">{persona.name}</span>
              <span className="sf-meta block text-sf-text-muted">{persona.title}</span>
            </span>
          ) : (
            <>
              <span className="sr-only">Account menu</span>
              <span className="hidden h-8 w-28 animate-pulse rounded-sf-md bg-sf-surface-hover md:block" aria-hidden />
            </>
          )}
          <Icon
            icon={IconChevronDown}
            size={16}
            className={clsx('hidden text-sf-text-secondary transition-transform duration-150 ease-sf sm:block', props['aria-expanded'] && 'rotate-180')}
          />
        </button>
      )}
    >
      <div role="presentation" className="flex items-center gap-3 px-4 pt-1 pb-3">
        <Avatar id={persona.id} name={persona.name} decorative />
        <div className="min-w-0">
          <p className="sf-ui-medium m-0 truncate text-sf-text">{persona.name}</p>
          <p className="sf-meta m-0 truncate text-sf-text-muted">
            {roleLabels[persona.role]} · {persona.title}
          </p>
        </div>
      </div>
      <MenuSeparator />
      <MenuHeading>Theme</MenuHeading>
      <MenuItem icon={IconSun} checked={theme === 'light'} onSelect={() => setTheme('light')}>
        Light
      </MenuItem>
      <MenuItem icon={IconMoon} checked={theme === 'dark'} onSelect={() => setTheme('dark')}>
        Dark
      </MenuItem>
      {!backendOn && people.data && (
        <>
          <MenuSeparator />
          <MenuHeading>View as</MenuHeading>
          {viewAs.isError && (
            <p role="alert" className="sf-small m-0 px-4 pb-1 text-sf-error">
              Switching didn't work. Try again.
            </p>
          )}
          {people.data.map((person) => (
            <ViewAsItem key={person.id} person={person} current={person.id === persona.id} pending={viewAs.isPending} onPick={switchTo} />
          ))}
        </>
      )}
      <MenuSeparator />
      <MenuItem icon={IconKey} disabled hint="Soon">
        Change password
      </MenuItem>
      <MenuItem icon={IconLogout} disabled hint="Soon">
        Log out
      </MenuItem>
    </Menu>
  )
}

/** A View as row: picking someone else keeps the menu open until the switch lands; picking myself just closes it. */
function ViewAsItem({ person, current, pending, onPick }: { person: User; current: boolean; pending: boolean; onPick: (userId: string, close: () => void) => void }) {
  const close = useCloseMenu()
  return (
    <MenuItem checked={current} disabled={pending} keepOpen={!current} onSelect={() => !current && onPick(person.id, close)}>
      {person.name} <span className="text-sf-text-muted">· {roleLabels[person.role]}</span>
    </MenuItem>
  )
}
