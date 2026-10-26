import clsx from 'clsx'
import type { ButtonHTMLAttributes } from 'react'

const variants = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 focus-visible:outline-brand-500 dark:focus-visible:outline-brand-400',
  secondary: 'bg-surface text-fg ring-1 ring-line hover:bg-surface-sunken focus-visible:outline-fg-muted',
  ghost: 'text-fg-tertiary hover:bg-surface-muted hover:text-fg focus-visible:outline-fg-muted',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600 dark:focus-visible:outline-red-400',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
