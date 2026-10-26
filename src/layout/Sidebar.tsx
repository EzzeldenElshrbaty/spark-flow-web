import clsx from 'clsx'
import { Link, NavLink } from 'react-router'
import { canSee, navGroups, settingsItem, type NavItem } from '@/navigation'
import { useRole } from '@/lib/useRole'

/** Counts beside menu items, by path (e.g. items waiting for the viewer). None yet. */
function useBadges(): Record<string, number> {
  return {}
}

function SidebarLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon
  const badge = useBadges()[item.path]
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        clsx(
          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive ? 'bg-white/10 text-white' : 'text-neutral-400 hover:bg-white/5 hover:text-white',
          collapsed && 'justify-center px-2',
        )
      }
    >
      {({ isActive }) => (
        <>
          {Icon && <Icon className={clsx('size-[18px] shrink-0', isActive && 'text-brand-400')} />}
          {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
          {!collapsed && badge ? (
            <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">{badge}</span>
          ) : null}
        </>
      )}
    </NavLink>
  )
}

export function SidebarContent({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { role } = useRole()
  return (
    <div className="flex h-full flex-col">
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => {
          const items = group.items.filter((item) => canSee(item, role))
          if (items.length === 0) return null
          return (
            <div key={group.label}>
              {!collapsed && (
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{group.label}</p>
              )}
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.path}>
                    <SidebarLink item={item} collapsed={collapsed} onNavigate={onNavigate} />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </nav>
      {canSee(settingsItem, role) && (
        <div className="border-t border-white/10 px-3 py-3">
          <SidebarLink item={settingsItem} collapsed={collapsed} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  )
}

/** The logo goes to Home. */
export function Logo({ collapsed = false, onClick }: { collapsed?: boolean; onClick?: () => void }) {
  return (
    <Link to="/" onClick={onClick} className="flex items-center gap-3" aria-label="Home">
      {collapsed ? (
        <img src="/spark-mark-white.png" alt="Spark Flow" className="h-4 w-auto" />
      ) : (
        <>
          <img src="/spark-logo-white.png" alt="Spark Systems" className="h-7 w-auto" />
          <span className="border-s border-white/15 ps-3 text-[13px] font-semibold tracking-[0.2em] text-neutral-400">FLOW</span>
        </>
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
