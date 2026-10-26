import clsx from 'clsx'
import type { ReactNode } from 'react'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('rounded-xl border border-line bg-surface shadow-sm', className)}>{children}</div>
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line-subtle px-5 py-3.5">
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      {action}
    </div>
  )
}
