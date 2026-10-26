import clsx from 'clsx'
import { Ellipsis, X } from 'lucide-react'
import { NavLink } from 'react-router'
import { useRole } from '../lib/useRole'
import { allNavItems, canSee, mobilePrimaryPaths } from '../navigation'
import { Logo, SidebarContent } from './Sidebar'

export function MobileBottomBar({ onOpenMore }: { onOpenMore: () => void }) {
  const { role } = useRole()
  // The first four pinned items this role can open.
  const items = allNavItems.filter((item) => mobilePrimaryPaths.includes(item.path) && canSee(item, role)).slice(0, 4)

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="flex">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <li key={item.path} className="flex-1">
              <NavLink
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  clsx('flex flex-col items-center gap-1 py-2 text-[11px] font-medium', isActive ? 'text-accent' : 'text-fg-muted')
                }
              >
                {Icon && <Icon className="size-5" />}
                {item.label}
              </NavLink>
            </li>
          )
        })}
        <li className="flex-1">
          <button type="button" onClick={onOpenMore} className="flex w-full flex-col items-center gap-1 py-2 text-[11px] font-medium text-fg-muted">
            <Ellipsis className="size-5" />
            More
          </button>
        </li>
      </ul>
    </nav>
  )
}

export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="Close menu" />
      <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-ink-900 shadow-xl dark:bg-surface-sunken">
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <Logo onClick={onClose} />
          <button type="button" onClick={onClose} className="rounded-md p-1 text-neutral-400 hover:text-white" aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <SidebarContent onNavigate={onClose} />
        </div>
      </div>
    </div>
  )
}
