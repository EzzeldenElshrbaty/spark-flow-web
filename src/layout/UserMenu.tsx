import clsx from 'clsx'
import { ChevronDown, KeyRound, LogOut, Moon, Sun } from 'lucide-react'
import { useRef, useState } from 'react'
import { MenuPanel } from '../components/ui/Menu'
import { roundButtonClass } from '../components/ui/styles'
import { useRole } from '../lib/useRole'
import { useTheme } from '../lib/useTheme'

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
        aria-label={`Account menu for ${persona.name}`}
        className="group flex items-center gap-2.5 rounded-full focus-visible:outline-none"
      >
        {/* Same circle as the notifications button, filled with the initials. */}
        <span className={clsx(roundButtonClass, 'bg-ink-800 text-xs font-semibold text-white hover:bg-ink-700 group-focus-visible:ring-2 group-focus-visible:ring-brand-500 dark:bg-surface-strong')}>
          {initials}
        </span>
        <span className="hidden text-left leading-tight xl:block">
          <span className="block text-sm font-medium text-fg">{persona.name}</span>
          <span className="block text-xs text-fg-muted">{persona.title}</span>
        </span>
        <ChevronDown className={clsx('hidden size-4 text-fg-muted transition-transform sm:block', open && 'rotate-180')} />
      </button>

      <MenuPanel open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} label="Account" className="sm:w-80">
            <div className="flex items-center gap-3 border-b border-line-subtle px-4 py-4">
              <span className="flex size-10 items-center justify-center rounded-full bg-ink-800 text-sm font-semibold text-white dark:bg-surface-strong">{initials}</span>
              <div className="min-w-0">
                <p className="truncate font-medium text-fg">{persona.name}</p>
                <p className="truncate text-xs text-fg-muted">{persona.role}</p>
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

            <div className="border-t border-line-subtle p-1.5">
              {(
                [
                  ['Change password', KeyRound],
                  ['Log out', LogOut],
                ] as const
              ).map(([label, Icon]) => (
                <button key={label} type="button" role="menuitem" disabled className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-fg-muted">
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
