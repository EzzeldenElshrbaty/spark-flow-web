import clsx from 'clsx'
import { ArrowLeft, ChevronRight, Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { Sheet } from '../../components/ui/Sheet'
import { useRole } from '../../lib/useRole'
import { canSee, settingsItem } from '../../navigation'
import { settingsMenu } from './settingsMenu'

/** Only Management opens Settings. */
function NoAccess() {
  return (
    <Card className="mx-auto mt-10 max-w-md p-8 text-center">
      <Lock className="mx-auto size-8 text-fg-subtle" />
      <h1 className="mt-3 text-lg font-semibold">No access</h1>
      <p className="mt-1 text-sm text-fg-muted">Only Management can change settings.</p>
    </Card>
  )
}

/** The Settings menu down the left of every Settings page on wide screens. */
function SettingsNav() {
  return (
    <nav aria-label="Settings" className="sticky top-24 hidden self-start lg:block">
      <p className="mb-3 px-3 text-lg font-semibold text-fg">Settings</p>
      {settingsMenu.map((group) => (
        <div key={group.label} className="mb-4">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{group.label}</p>
          {group.links.map((link) => (
            <NavLink
              key={link.path}
              to={`/settings/${link.path}`}
              className={({ isActive }) =>
                clsx('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors', isActive ? 'bg-surface font-medium text-fg shadow-sm ring-1 ring-line' : 'text-fg-secondary hover:bg-surface-muted hover:text-fg')
              }
            >
              <link.icon className="size-4 shrink-0 text-fg-muted" />
              <span className="truncate">{link.label}</span>
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}

/**
 * A Settings page: Management only. Wide screens show the Settings menu on the left and the page in one column
 * beside it; phones show the way back to the Settings list above the title.
 */
export function SettingsPage({ title, subtitle, actions, wide, children }: { title: string; subtitle?: string; actions?: ReactNode; /** Tables need the full width. */ wide?: boolean; children: ReactNode }) {
  const { role } = useRole()
  if (!canSee(settingsItem, role)) return <NoAccess />
  return (
    <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10">
      <SettingsNav />
      <div className={clsx('min-w-0', !wide && 'max-w-3xl')}>
        <Link to="/settings" className="mb-4 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg lg:hidden">
          <ArrowLeft className="size-4" /> Settings
        </Link>
        <PageHeader title={title} subtitle={subtitle} actions={actions} />
        <div className="space-y-8">{children}</div>
      </div>
    </div>
  )
}

/** Settings home: every setting in one list, grouped, with a line on what it holds. */
export function SettingsHome() {
  const { role } = useRole()
  if (!canSee(settingsItem, role)) return <NoAccess />
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" subtitle="How Spark CRM works for your company." />
      <div className="space-y-6">
        {settingsMenu.map((group) => (
          <section key={group.label}>
            <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{group.label}</h2>
            <ul className="divide-y divide-line-subtle overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
              {group.links.map((link) => (
                <li key={link.path}>
                  <Link to={`/settings/${link.path}`} className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface-sunken active:bg-surface-muted">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                      <link.icon className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-fg">{link.label}</span>
                      <span className="block truncate text-xs text-fg-muted">{link.description}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-fg-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

/**
 * One block of settings: a title (and optional line and action) above a rounded panel. Pages stack these in a
 * single column.
 */
export function Section({ title, description, action, children, className }: { title: string; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-2.5 flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-fg">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">{children}</div>
    </section>
  )
}

export const ErrorText = ({ children }: { children?: string }) => (children ? <p className="text-sm text-red-600 dark:text-red-400">{children}</p> : null)

/** Asked when closing a form with unsaved changes. */
export function DiscardSheet({ what, onKeep, onDiscard }: { what: string; onKeep: () => void; onDiscard: () => void }) {
  return (
    <Sheet
      open
      onClose={onKeep}
      title="Discard your changes?"
      description={`The ${what} hasn't been saved.`}
      footer={
        <>
          <Button variant="secondary" onClick={onKeep}>
            Keep editing
          </Button>
          <Button onClick={onDiscard}>Discard</Button>
        </>
      }
    >
      <p className="text-sm text-fg-muted">What you typed will be lost.</p>
    </Sheet>
  )
}

