import clsx from 'clsx'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, ChevronDown, KeyRound, LifeBuoy, LogOut, Moon, Search, Sun } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { MenuPanel } from '../components/ui/Menu'
import { roundButtonClass } from '../components/ui/styles'
import { api, backendOn } from '../lib/api'
import { roles, personas } from '../lib/roles'
import { useAuth } from '../lib/useAuth'
import { useMarket } from '../lib/useMarket'
import { useRole } from '../lib/useRole'
import { useTheme, type Theme } from '../lib/useTheme'
import { stopViewingAs, viewAs, viewAsPeople } from '../lib/viewAs'
import { ChangePasswordSheet } from './ChangePasswordSheet'

/**
 * The account menu behind the avatar: who you are, Preview as (prototype) or View as (Management, signed in),
 * Preferences, Help (the guide for their role), Change password and Log out (signed in). A dropdown on desktop, a bottom sheet on phones.
 */
export function UserMenu() {
  const { persona, setPersona } = useRole()
  const { markets } = useMarket()
  const { theme, setTheme } = useTheme()
  const { me, signOut } = useAuth()
  const people = personas()
  const [open, setOpen] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  // Signed in, the theme is saved on the account so it follows the user to every device.
  const chooseTheme = (value: Theme) => {
    setTheme(value)
    if (me) api('/api/auth/me/theme', { method: 'PUT', body: { theme: value } }).catch(() => undefined)
  }
  const triggerRef = useRef<HTMLButtonElement>(null)

  const initials = persona.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
  const marketNames = persona.markets.map((id) => markets.find((market) => market.id === id)?.name).join(' · ')

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

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
        {/* Same circle as the notifications and market buttons, filled with the initials. */}
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
                <p className="truncate text-xs text-fg-muted">{marketNames}</p>
              </div>
            </div>

            {!backendOn && (
            <div className="p-1.5">
              <p className={clsx(sectionLabel, 'flex items-center justify-between')}>
                Preview as
                <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-fg-tertiary">Prototype only</span>
              </p>
              {roles.filter((role) => people.some((option) => option.role === role)).map((role) => (
                <div key={role} role="group" aria-label={role}>
                  {people
                    .filter((option) => option.role === role)
                    .map((option) => {
                      const current = option.id === persona.id
                      return (
                        <button
                          key={option.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={current}
                          onClick={() => {
                            setPersona(option.id)
                            close()
                          }}
                          className={clsx('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-muted', current ? 'font-medium text-fg' : 'text-fg-secondary')}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{option.name}</span>
                            <span className="block truncate text-xs font-normal text-fg-muted">{option.role === 'Management' ? 'Management · all markets' : option.title}</span>
                          </span>
                          {current && <Check className="size-4 shrink-0 text-accent" />}
                        </button>
                      )
                    })}
                </div>
              ))}
            </div>
            )}

            {me && (me.role === 'Management' || me.viewedBy) && <ViewAsSection open={open} labelClass={sectionLabel} />}

            <div className={clsx('p-1.5', (!backendOn || me?.role === 'Management' || me?.viewedBy) && 'border-t border-line-subtle')}>
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
                      onClick={() => chooseTheme(value)}
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
              <Link to="/help" role="menuitem" onClick={() => setOpen(false)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-fg-secondary hover:bg-surface-muted hover:text-fg">
                <LifeBuoy className="size-4" /> Help
              </Link>
            </div>

            <div className="border-t border-line-subtle p-1.5">
              {me ? (
                <>
                  {!me.viewedBy && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close()
                      setChangingPassword(true)
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-fg-secondary hover:bg-surface-muted hover:text-fg"
                  >
                    <KeyRound className="size-4" /> Change password
                  </button>
                  )}
                  <button type="button" role="menuitem" onClick={() => signOut()} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-fg-secondary hover:bg-surface-muted hover:text-fg">
                    <LogOut className="size-4" /> Log out
                  </button>
                </>
              ) : (
                (
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
                ))
              )}
            </div>
      </MenuPanel>
      {changingPassword && <ChangePasswordSheet onClose={() => setChangingPassword(false)} />}
    </div>
  )
}

const itemClass = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-muted disabled:opacity-60'

/** Management picks anyone active who isn't Management and sees the app exactly as them. */
function ViewAsSection({ open, labelClass }: { open: boolean; labelClass: string }) {
  const { me } = useAuth()
  const { markets } = useMarket()
  const [term, setTerm] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const { data: people, isPending } = useQuery({ queryKey: ['view-as-people'], queryFn: viewAsPeople, enabled: open })

  const go = (id: string, action: () => Promise<void>) => {
    setBusy(id)
    setError('')
    action().catch((reason: Error) => {
      setBusy(null)
      setError(reason.message)
    })
  }

  const needle = term.trim().toLowerCase()
  const shown = (people ?? [])
    .filter((person) => !needle || person.name.toLowerCase().includes(needle) || person.role.toLowerCase().includes(needle))
    .sort((a, b) => roles.indexOf(a.role) - roles.indexOf(b.role) || a.name.localeCompare(b.name))
  const marketNames = (ids: string[]) => ids.map((id) => markets.find((market) => market.id === id)?.name ?? id).join(' · ')

  return (
    <div className="border-t border-line-subtle p-1.5">
      <p className={labelClass}>View as</p>
      {me?.viewedBy && (
        <button type="button" role="menuitem" disabled={busy !== null} onClick={() => go('back', stopViewingAs)} className={clsx(itemClass, 'font-medium text-accent')}>
          <ArrowLeft className="size-4 shrink-0" /> Back to {me.viewedBy.name}
        </button>
      )}
      {(people?.length ?? 0) > 8 && (
        <label className="mx-3 my-1 flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5">
          <Search className="size-3.5 shrink-0 text-fg-muted" />
          <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Find someone" aria-label="Find someone to view as" className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted" />
        </label>
      )}
      <div className="max-h-64 overflow-y-auto">
        {isPending && <p className="px-3 py-2 text-sm text-fg-muted">Loading…</p>}
        {people && shown.length === 0 && <p className="px-3 py-2 text-sm text-fg-muted">{people.length ? 'Nobody matches.' : 'No other users yet.'}</p>}
        {shown.map((person) => {
          const current = person.id === me?.id
          return (
            <button
              key={person.id}
              type="button"
              role="menuitemradio"
              aria-checked={current}
              disabled={busy !== null}
              onClick={() => !current && go(person.id, () => viewAs(person.id))}
              className={clsx(itemClass, current ? 'font-medium text-fg' : 'text-fg-secondary')}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{busy === person.id ? `Opening as ${person.name}…` : person.name}</span>
                <span className="block truncate text-xs font-normal text-fg-muted">
                  {person.role}
                  {person.markets.length > 0 && ` · ${marketNames(person.markets)}`}
                </span>
              </span>
              {current && <Check className="size-4 shrink-0 text-accent" />}
            </button>
          )
        })}
      </div>
      {error && <p className="px-3 py-1 text-xs text-accent">{error}</p>}
    </div>
  )
}
