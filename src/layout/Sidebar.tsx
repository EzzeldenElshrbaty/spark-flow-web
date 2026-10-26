import clsx from 'clsx'
import { Folder, FolderKanban, Hash, House, ListChecks, Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import type { Presence } from '@/api/types'
import { useSidebarGroups } from '@/layout/useSidebarGroups'
import { paths } from '@/lib/paths'
import { useRole } from '@/lib/useRole'
import { canSee, settingsItem } from '@/navigation'

type SidebarLinkProps = {
  to: string
  label: string
  icon?: ReactNode
  /** An unread count; shown as the brand pill (a dot on the icon when the sidebar is collapsed). */
  badge?: number
  /** The row is active anywhere under this path (a project's link goes to one view but stays lit on the other). */
  within?: string
  /** Active only on this exact path (Home, whose path is the start of every other). */
  end?: boolean
  collapsed: boolean
  onNavigate?: () => void
}

/** One row of the sidebar. The icon is whatever marks the row: a lucide icon, a presence dot. */
function SidebarLink({ to, label, icon, badge, within, end, collapsed, onNavigate }: SidebarLinkProps) {
  const { pathname } = useLocation()
  const inside = within ? pathname === within || pathname.startsWith(`${within}/`) : undefined
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        clsx(
          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          (inside ?? isActive) ? 'bg-white/10 text-white' : 'text-neutral-400 hover:bg-white/5 hover:text-white',
          collapsed && 'justify-center px-2',
        )
      }
    >
      {({ isActive }) => (
        <>
          {icon && (
            <span className={clsx('relative flex size-[18px] shrink-0 items-center justify-center', (inside ?? isActive) && 'text-brand-400')}>
              {icon}
              {collapsed && badge ? <span className="absolute -end-1 -top-1 size-2 rounded-full bg-brand-500" aria-label={`${badge} unread`} /> : null}
            </span>
          )}
          {!collapsed && <span className="flex-1 truncate">{label}</span>}
          {!collapsed && badge ? (
            <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">{badge > 99 ? '99+' : badge}</span>
          ) : null}
        </>
      )}
    </NavLink>
  )
}

const presenceDot: Record<Presence, string> = {
  active: 'bg-emerald-400',
  away: 'bg-amber-400',
  offline: 'bg-neutral-500',
}

function PresenceDot({ presence }: { presence: Presence }) {
  return <span className={clsx('size-2.5 rounded-full', presenceDot[presence])} role="img" aria-label={presence === 'active' ? 'Online' : presence === 'away' ? 'Away' : 'Offline'} />
}

function GroupLabel({ children, collapsed }: { children: string; collapsed: boolean }) {
  if (collapsed) return null
  return <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{children}</p>
}

/** Three pulse rows while a group loads. */
function GroupSkeleton() {
  return (
    <div className="space-y-0.5" aria-hidden>
      {[0, 1, 2].map((row) => (
        <div key={row} className="h-9 animate-pulse rounded-lg bg-white/5" />
      ))}
    </div>
  )
}

export function SidebarContent({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { role } = useRole()
  const { workspace, channels, dms, projects, chatLoading, projectsLoading, failed } = useSidebarGroups()
  const slug = workspace?.slug

  return (
    <div className="flex h-full flex-col">
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Workspace">
        {slug && (
          <div>
            <GroupLabel collapsed={collapsed}>Work</GroupLabel>
            <ul className="space-y-0.5">
              <li>
                <SidebarLink to={paths.home(slug)} end label="Home" icon={<House className="size-[18px]" />} collapsed={collapsed} onNavigate={onNavigate} />
              </li>
              <li>
                <SidebarLink to={paths.projects(slug)} label="Projects" icon={<FolderKanban className="size-[18px]" />} collapsed={collapsed} onNavigate={onNavigate} />
              </li>
              <li>
                <SidebarLink to={paths.tasks(slug)} label="My tasks" icon={<ListChecks className="size-[18px]" />} collapsed={collapsed} onNavigate={onNavigate} />
              </li>
            </ul>
          </div>
        )}

        {slug && (chatLoading || channels.length > 0) && (
          <div>
            <GroupLabel collapsed={collapsed}>Channels</GroupLabel>
            {chatLoading ? (
              <GroupSkeleton />
            ) : (
              <ul className="space-y-0.5">
                {channels.map(({ channel, label }) => (
                  <li key={channel.id}>
                    <SidebarLink
                      to={paths.channel(slug, channel.id)}
                      label={label}
                      icon={channel.isPrivate ? <Lock className="size-[18px]" /> : <Hash className="size-[18px]" />}
                      badge={channel.unreadCount}
                      collapsed={collapsed}
                      onNavigate={onNavigate}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {slug && (chatLoading || dms.length > 0) && (
          <div>
            <GroupLabel collapsed={collapsed}>Direct messages</GroupLabel>
            {chatLoading ? (
              <GroupSkeleton />
            ) : (
              <ul className="space-y-0.5">
                {dms.map(({ channel, label, presence }) => (
                  <li key={channel.id}>
                    <SidebarLink
                      to={paths.channel(slug, channel.id)}
                      label={label}
                      icon={<PresenceDot presence={presence} />}
                      badge={channel.unreadCount}
                      collapsed={collapsed}
                      onNavigate={onNavigate}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {slug && (projectsLoading || projects.length > 0) && (
          <div>
            <GroupLabel collapsed={collapsed}>Projects</GroupLabel>
            {projectsLoading ? (
              <GroupSkeleton />
            ) : (
              <ul className="space-y-0.5">
                {projects.map((project) => (
                  <li key={project.id}>
                    <SidebarLink
                      to={paths.project(slug, project.key)}
                      label={project.name}
                      within={paths.project(slug, project.key).replace(/\/[^/]+$/, '')}
                      icon={<Folder className="size-[18px]" />}
                      collapsed={collapsed}
                      onNavigate={onNavigate}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {failed && !collapsed && <p className="px-3 text-xs text-neutral-500">Some of this list didn’t load. Refresh to try again.</p>}
      </nav>
      {slug && canSee(settingsItem, role) && settingsItem.icon && (
        <div className="border-t border-white/10 px-3 py-3">
          <SidebarLink to={paths.settings(slug)} label={settingsItem.label} icon={<settingsItem.icon className="size-[18px]" />} collapsed={collapsed} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  )
}

/** The logo goes to Home, which opens the last place visited. */
export function Logo({ collapsed = false, onClick }: { collapsed?: boolean; onClick?: () => void }) {
  return (
    <Link to="/" onClick={onClick} className="flex items-center gap-3" aria-label="Home">
      {collapsed ? (
        <img src="/spark-mark-white.png" alt="Spark Flow" className="h-4 w-auto" />
      ) : (
        <span dir="ltr" className="flex items-center gap-3">
          <img src="/spark-logo-white.png" alt="Spark Systems" className="h-7 w-auto" />
          <span className="border-s border-white/15 ps-3 text-[13px] font-semibold tracking-[0.2em] text-neutral-400">FLOW</span>
        </span>
      )}
    </Link>
  )
}

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      className={clsx(
        'sticky top-0 hidden h-screen shrink-0 flex-col bg-ink-900 dark:bg-surface-sunken transition-[width] duration-200 lg:flex',
        collapsed ? 'w-[72px]' : 'w-64',
      )}
    >
      <div className={clsx('flex h-20 items-center px-4', collapsed && 'justify-center')}>
        <Logo collapsed={collapsed} />
      </div>
      <div className="min-h-0 flex-1">
        <SidebarContent collapsed={collapsed} />
      </div>
    </aside>
  )
}
