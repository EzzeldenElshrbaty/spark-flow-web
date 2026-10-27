import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useOpenDm } from '@/api/chat'
import { useMe, useUsers } from '@/api/users'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { inputClass } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { paths } from '@/lib/paths'

const MAX_OTHERS = 8

/** New message: pick one person or a few (up to 8), then open the conversation you have with exactly them. */
export function NewMessageSheet({ workspaceId, workspaceSlug, onClose }: { workspaceId: string; workspaceSlug: string; onClose: () => void }) {
  const navigate = useNavigate()
  const me = useMe().data
  const people = (useUsers(workspaceId).data ?? []).filter((u) => u.id !== me?.id)
  const open = useOpenDm()
  const [picked, setPicked] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const q = filter.trim().toLowerCase()
  const shown = q ? people.filter((u) => u.name.toLowerCase().includes(q) || u.title.toLowerCase().includes(q)) : people
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const go = () => {
    if (picked.length === 0) return setError('Pick at least one person.')
    if (picked.length > MAX_OTHERS) return setError(`A conversation can have up to ${MAX_OTHERS + 1} people.`)
    setError(null)
    open.mutate(
      { workspaceId, userIds: picked },
      {
        onSuccess: (dm) => {
          onClose()
          navigate(paths.channel(workspaceSlug, dm.id))
        },
      },
    )
  }

  return (
    <Sheet
      open
      onClose={onClose}
      variant="drawer"
      title="New message"
      description="Pick one person, or a few for a group conversation."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={open.isPending}>
            Cancel
          </Button>
          <Button onClick={go} disabled={open.isPending}>
            {open.isPending ? 'Opening…' : 'Open conversation'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <input className={inputClass} placeholder="Find people" aria-label="Find people" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <ul className="max-h-96 space-y-0.5 overflow-y-auto rounded-lg border border-line p-1">
          {shown.map((u) => (
            <li key={u.id}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-fg hover:bg-surface-muted">
                <input type="checkbox" className="size-4 accent-brand-500" checked={picked.includes(u.id)} onChange={() => toggle(u.id)} />
                <Avatar name={u.name} size="sm" />
                <span className="min-w-0 flex-1 truncate">
                  {u.name}
                  {u.title && <span className="text-fg-muted"> · {u.title}</span>}
                </span>
              </label>
            </li>
          ))}
          {shown.length === 0 && <li className="px-2 py-3 text-sm text-fg-muted">No one matches.</li>}
        </ul>
        {(error ?? open.error) && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error ?? (open.error as Error).message}
          </p>
        )}
      </div>
    </Sheet>
  )
}
