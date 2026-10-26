import { Construction } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import type { NavItem } from '../navigation'

/** A menu section that isn't built yet: its title and what it will hold. */
export function PlaceholderPage({ item }: { item: NavItem }) {
  const Icon = item.icon ?? Construction
  return (
    <>
      <PageHeader title={item.label} subtitle={item.description} />
      <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-14 text-center motion-safe:animate-fade-in">
        <span className="rounded-full bg-accent-soft p-3 text-accent">
          <Icon className="size-6" />
        </span>
        <p className="mt-3 text-sm text-fg-muted">Coming soon. This page is next in line.</p>
      </div>
    </>
  )
}
