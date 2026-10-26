import { Eye } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../lib/useAuth'
import { stopViewingAs } from '../lib/viewAs'

/** Shown on every page while Management is viewing the app as someone else, with the way back. */
export function ViewingAsBanner() {
  const { me } = useAuth()
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState('')
  if (!me?.viewedBy) return null

  const back = () => {
    setLeaving(true)
    setError('')
    stopViewingAs().catch((reason: Error) => {
      setLeaving(false)
      setError(reason.message)
    })
  }

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-accent-line bg-accent-soft px-4 py-2 text-sm md:px-6 xl:px-8">
      <Eye className="size-4 shrink-0 text-accent" aria-hidden />
      <p className="min-w-0 flex-1 text-fg-secondary">
        Viewing as <span className="font-medium text-fg">{me.name}</span> · {me.role}<span className="hidden sm:inline">. What you change is saved as {me.viewedBy.name} for {me.name.split(' ')[0]}.</span>
        {error && <span className="ml-2 text-accent">{error}</span>}
      </p>
      <button type="button" onClick={back} disabled={leaving} className="shrink-0 font-medium text-accent hover:underline disabled:opacity-60">
        {leaving ? 'Going back…' : `Back to ${me.viewedBy.name}`}
      </button>
    </div>
  )
}
