import type { TablerIcon } from '@tabler/icons-react'
import clsx from 'clsx'
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { Icon } from './Icon'
import { Tooltip } from './Tooltip'

// Colour sets never overlap with the base classes, so the order of the generated CSS can't decide a state.
const variants = {
  default: 'border-sf-line-strong bg-sf-surface text-sf-text enabled:hover:bg-sf-surface-hover',
  primary:
    'border-sf-accent-fill bg-sf-accent-fill text-sf-on-accent enabled:hover:border-sf-accent-fill-hover enabled:hover:bg-sf-accent-fill-hover',
  // The kit's danger button (UX Phase 3): every delete confirm, never the same as primary.
  danger:
    'border-sf-danger-fill bg-sf-danger-fill text-sf-on-accent enabled:hover:border-sf-danger-fill-hover enabled:hover:bg-sf-danger-fill-hover',
  ghost: 'border-transparent bg-transparent text-sf-text enabled:hover:bg-sf-surface-hover',
}

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  variant?: keyof typeof variants
  size?: 'md' | 'sm'
  icon?: TablerIcon
  /** A 44px touch target on phones (spec 6.16) around a smaller button. */
  touch?: boolean
  ref?: Ref<HTMLButtonElement>
  children: ReactNode
}

/** Labelled button. One primary (red) per view. */
export function Button({ variant = 'default', size = 'md', icon, touch = false, type = 'button', children, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        'sf-focus inline-flex flex-none cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-sf-md border transition-colors duration-150 ease-sf',
        'disabled:cursor-not-allowed disabled:border-sf-line disabled:bg-sf-surface-hover disabled:text-sf-text-muted',
        size === 'md' ? 'sf-ui-medium h-sf-input px-4' : 'h-7 px-3 font-sf text-[13px]/[18px] font-medium',
        variants[variant],
        // From the padding box, inside the 1px border: 26 + 2 × 10 = 46px.
        touch && 'relative max-md:after:absolute max-md:after:-inset-x-1 max-md:after:-inset-y-2.5',
      )}
      {...props}
    >
      {icon && <Icon icon={icon} size={size === 'md' ? 20 : 18} />}
      {children}
    </button>
  )
}

const tones = {
  default: 'text-sf-text-secondary enabled:hover:bg-sf-surface-hover enabled:hover:text-sf-text',
  muted: 'text-sf-text-muted enabled:hover:bg-sf-surface-hover enabled:hover:text-sf-text',
  accent: 'text-sf-accent enabled:hover:bg-sf-surface-hover',
  sidebar: 'text-sf-sidebar-text enabled:hover:bg-sf-sidebar-hover enabled:hover:text-sf-sidebar-text-strong',
  'sidebar-muted':
    'text-sf-sidebar-text-muted enabled:hover:bg-sf-sidebar-hover enabled:hover:text-sf-sidebar-text-strong',
  // White on the dark sidebar; the raised ink on a dark screen, so it isn't the brightest thing there (UX Phase 3, 3.6).
  compose: 'bg-sf-white text-sf-ink-950 enabled:hover:bg-sf-ink-100 dark:bg-sf-ink-700 dark:text-sf-white dark:enabled:hover:bg-sf-ink-600',
  /** On ink-950 (toasts). */
  ink: 'text-sf-ink-300 enabled:hover:bg-sf-ink-800 enabled:hover:text-sf-white',
}

const iconSizes = { md: 'size-sf-control', sm: 'size-7', xs: 'size-6' }

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children' | 'aria-label'> & {
  /** The accessible name; also the tooltip text. Required: an icon-only button must say what it does. */
  label: string
  icon: TablerIcon
  size?: keyof typeof iconSizes
  tone?: keyof typeof tones
  /** Toggle buttons (bold, star): shown pressed and announced with aria-pressed. */
  pressed?: boolean
  /** Shown in the tooltip, e.g. ['⌘', 'K'], and announced via aria-keyshortcuts. */
  shortcut?: string[]
  /** Off when the label is already visible next to the button. */
  tooltip?: boolean
  flip?: boolean
  className?: string
  ref?: Ref<HTMLButtonElement>
}

/** 32px (28 / 24 in dense places) icon-only button with an accessible name and a tooltip. */
export function IconButton({
  label,
  icon,
  size = 'md',
  tone = 'default',
  pressed,
  shortcut,
  tooltip = true,
  flip,
  type = 'button',
  className,
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      aria-keyshortcuts={shortcut?.join('+').replace('⌘', 'Meta')}
      className={clsx(
        'sf-focus inline-grid flex-none cursor-pointer place-items-center rounded-sf-md border-0 p-0 transition-colors duration-150 ease-sf disabled:cursor-not-allowed disabled:text-sf-text-muted',
        iconSizes[size],
        tones[tone],
        pressed && 'bg-sf-surface-hover text-sf-text',
        className,
      )}
      {...props}
    >
      <Icon icon={icon} size={size === 'md' ? 20 : size === 'sm' ? 18 : 16} flip={flip} />
    </button>
  )
  return tooltip ? (
    <Tooltip label={label} shortcut={shortcut}>
      {button}
    </Tooltip>
  ) : (
    button
  )
}
