import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { MenuPanel, menuItemClass } from '@/components/ui/Menu'
import { IconButton } from '@/components/ui/IconButton'

export type RowMenuItem = { label: string; icon: LucideIcon; danger?: boolean; onSelect: () => void }

/** A row's ⋯ button and its menu (a bottom sheet on phones), as on comments. */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <div className="relative shrink-0">
      <IconButton ref={triggerRef} label={label} icon={MoreHorizontal} size="sm" touch onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} />
      <MenuPanel open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} label={label} className="p-1.5 sm:w-52">
        {items.map(({ label: text, icon: Icon, danger, onSelect }) => (
          <button
            key={text}
            type="button"
            role="menuitem"
            className={danger ? `${menuItemClass} text-red-600 dark:text-red-400` : menuItemClass}
            onClick={() => {
              setOpen(false)
              onSelect()
            }}
          >
            <Icon className="size-4 shrink-0" /> {text}
          </button>
        ))}
      </MenuPanel>
    </div>
  )
}
