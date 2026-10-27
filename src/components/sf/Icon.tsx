import type { TablerIcon } from '@tabler/icons-react'
import clsx from 'clsx'

/** 20 by default, 18 in dense rows (sidebar, menus, tabs), 16 in chips, 14 inside chip and tray buttons. */
export type IconSize = 14 | 16 | 18 | 20

/** A Tabler icon at the redesign's fixed 1.5 stroke. Decorative: the control around it carries the name. */
export function Icon({
  icon: Glyph,
  size = 20,
  flip = false,
  className,
}: {
  icon: TablerIcon
  size?: IconSize
  /** Directional icons (arrows, chevrons pointing along the line) mirror in RTL. */
  flip?: boolean
  className?: string
}) {
  return (
    <Glyph
      size={size}
      stroke={1.5}
      aria-hidden="true"
      focusable="false"
      className={clsx('flex-none', flip && 'rtl:-scale-x-100', className)}
    />
  )
}
