import { IconChevronDown, type TablerIcon } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { Menu } from './Menu'

/** 28px two-part button (Call ▾): the main action plus a menu of related ones. */
export function SplitButton({
  icon,
  label,
  onClick,
  menuLabel,
  children,
}: {
  icon?: TablerIcon
  label: string
  onClick: () => void
  /** Accessible name of the chevron, e.g. "More call options". */
  menuLabel: string
  /** MenuItems. */
  children: ReactNode
}) {
  const part =
    'sf-focus inline-flex cursor-pointer items-center gap-1 bg-transparent font-sf text-[13px]/[18px] font-medium text-sf-text hover:bg-sf-surface-hover'
  return (
    <span className="inline-flex h-7 items-stretch overflow-hidden rounded-sf-md border border-sf-line-strong bg-sf-surface">
      <button type="button" onClick={onClick} className={`${part} px-2`}>
        {icon && <Icon icon={icon} size={18} />}
        {label}
      </button>
      <Menu
        label={menuLabel}
        trigger={(props) => (
          <button type="button" aria-label={menuLabel} {...props} className={`${part} border-s border-sf-line px-1`}>
            <Icon icon={IconChevronDown} size={16} />
          </button>
        )}
      >
        {children}
      </Menu>
    </span>
  )
}
