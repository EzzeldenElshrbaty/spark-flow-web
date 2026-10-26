import clsx from 'clsx'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, KeyRound, LogOut, Moon, Sun } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useUsers, useViewAs } from '@/api/users'
import { MenuPanel } from '@/components/ui/Menu'
import { roundButtonClass } from '@/components/ui/styles'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { backendOn } from '@/lib/api'
import { roleLabels } from '@/lib/roles'
import { useRole } from '@/lib/useRole'
import { useTheme } from '@/lib/useTheme'

/**
 * The account menu behind the avatar: who you are, Preferences, and Change password / Log out (once sign-in exists).
 * A dropdown on desktop, a bottom sheet on phones.
 */
export function UserMenu() {
  const { persona } = useRole()
  // TODO(auth): signed in, also save the theme on the account so it follows the user to every device (as Spark CRM does).
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { workspace } = useCurrentWorkspace()
  const people = useUsers(backendOn ? undefined : workspace?.id)
  const viewAs = useViewAs()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // Demo only: become someone else, then start fresh on that workspace's home, since what they may see differs.
  const switchTo = async (userId: string) => {
    if (userId === persona.id) return
    await viewAs.mutateAsync(userId)
    setOpen(false)
    queryClient.clear()
    navigate(workspace ? `/w/${workspace.slug}` : '/')
  }

  // The account loads after the shell: until the name is known, the avatar is a pulse placeholder.
  const loaded = Boolean(persona.name)
  const initials = persona.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)

  const sectionLabel = 'px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-fg-muted'

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={loaded ? `Account menu for ${persona.name}` : 'Account menu'}
        className="group flex items-center gap-2.5 rounded-full focus-visible:outline-none"
      >
        {/* Same circle as the notifications button, filled with the initials. */}
        <span
          className={clsx(
            roundButtonClass,
            'text-xs font-semibold group-focus-visible:ring-2 group-focus-visible:ring-brand-500',
            loaded ? 'bg-ink-800 text-white hover:bg-ink-700 dark:bg-surface-strong' : 'animate-pulse bg-surface-strong',
          )}
        >
          {initials}
        </span>
        {loaded ? (
          <span className="hidden text-start leading-tight xl:block">
            <span className="block text-sm font-medium text-fg">{persona.name}</span>
            <span className="block text-xs text-fg-muted">{persona.title}</span>
          </span>
        ) : (
          <span className="hidden h-8 w-28 animate-pulse rounded-md bg-surface-strong xl:block" aria-hidden />
        )}
        <ChevronDown className={clsx('hidden size-4 text-fg-muted transition-transform sm:block', open && 'rotate-180')} />
      </button>

      <MenuPanel open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} label="Account" className="sm:w-80">
            <div className="flex items-center gap-3 border-b border-line-subtle px-4 py-4">
              <span className="flex size-10 items-center justify-center rounded-full bg-ink-800 text-sm font-semibold text-white dark:bg-surface-strong">{initials}</span>
              <div className="min-w-0">
                <p className="truncate font-medium text-fg">{persona.name}</p>
                <p className="truncate text-xs text-fg-muted">{roleLabels[persona.role]} · {persona.title}</p>
              </div>
            </div>

            <div className="p-1.5">
              <p className={sectionLabel}>Preferences</p>
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm text-fg-secondary">Theme</span>
                <div className="inline-flex rounded-lg border border-line p-0.5" role="group" aria-label="Theme">
                  {(
                    [
                      ['light', 'Light', Sun],
                      ['dark', 'Dark', Moon],
                    ] as const
                  ).map(([value, label, Icon]) => (
                    <button
                      key={value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={theme === value}
                      onClick={() => setTheme(value)}
                      className={clsx(
                        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors',
                        theme === value ? 'bg-surface-muted font-medium text-fg' : 'text-fg-muted hover:text-fg',
                      )}
                    >
                      <Icon className="size-3.5" /> {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {!backendOn && people.data && (
              <div className="border-t border-line-subtle p-1.5">
                <p className={sectionLabel}>View as</p>
                <div className="max-h-64 overflow-y-auto">
                  {people.data.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={person.id === persona.id}
                      disabled={viewAs.isPending}
                      onClick={() => void switchTo(person.id)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm text-fg-secondary hover:bg-surface-muted disabled:opacity-60"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {person.name} <span className="text-fg-muted">· {roleLabels[person.role]}</span>
                      </span>
                      {person.id === persona.id && <Check className="size-4 shrink-0 text-accent" />}
                    </button>
                  ))}
                </div>
                {viewAs.isError && <p className="px-3 py-1 text-xs text-red-600 dark:text-red-400">Switching didn't work. Try again.</p>}
              </div>
            )}

            <div className="border-t border-line-subtle p-1.5">
              {(
                [
                  ['Change password', KeyRound],
                  ['Log out', LogOut],
                ] as const
              ).map(([label, Icon]) => (
                <button key={label} type="button" role="menuitem" disabled className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm text-fg-muted">
                  <Icon className="size-4" />
                  <span className="flex-1">{label}</span>
                  <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium">Soon</span>
                </button>
              ))}
            </div>
      </MenuPanel>
    </div>
  )
}
