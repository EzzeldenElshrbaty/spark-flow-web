import { House } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'

export function HomePage() {
  return (
    <>
      <PageHeader title="Home" subtitle="Today's work at a glance." />
      <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-14 text-center motion-safe:animate-fade-in">
        <span className="rounded-full bg-accent-soft p-3 text-accent">
          <House className="size-6" />
        </span>
        <p className="mt-3 text-sm font-medium text-fg">Welcome to Spark Flow.</p>
        <p className="mt-1 text-sm text-fg-muted">Your work will show here as each part of the app is built.</p>
      </div>
    </>
  )
}
