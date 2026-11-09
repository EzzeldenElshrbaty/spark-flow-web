import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useOpenDm } from '@/api/chat'
import { useMe, useUsers } from '@/api/users'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/sf/Button'
import { fieldClass } from '@/components/sf/field'
import { Modal, ModalCancelButton } from '@/components/sf/Modal'
import { paths } from '@/lib/paths'
import { isActive } from '@/lib/people'

const MAX_OTHERS = 8

/**
 * New message, as a chat dialog (UX Phase 3, 3.1): pick one person or a few (up to 8), then open the conversation you
 * have with exactly them.
 */
export function NewMessageDialog({ workspaceId, workspaceSlug, onClose }: { workspaceId: string; workspaceSlug: string; onClose: () => void }) {
  const navigate = useNavigate()
  const me = useMe().data
  // Not me, and nobody deactivated (slice 3).
  const people = (useUsers(workspaceId).data ?? []).filter((u) => u.id !== me?.id && isActive(u))
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
    <Modal
      open
      onClose={onClose}
      // Closing with people picked asks first (UX Phase 1, 1.2).
      dirty={picked.length > 0}
      discardQuestion="Discard this new message?"
      title="New message"
      description="Pick one person, or a few for a group conversation."
      footer={
        <>
          <ModalCancelButton touch disabled={open.isPending} />
          <Button touch variant="primary" onClick={go} disabled={open.isPending}>
            {open.isPending ? 'Opening…' : 'Open conversation'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <input className={fieldClass} placeholder="Find people" aria-label="Find people" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <ul className="m-0 max-h-96 list-none space-y-0.5 overflow-y-auto rounded-sf-md border border-sf-line p-1">
          {shown.map((u) => (
            <li key={u.id}>
              <label className="sf-ui flex cursor-pointer items-center gap-2.5 rounded-sf-sm px-2 py-1.5 text-sf-text hover:bg-sf-surface-hover max-md:min-h-11">
                <input type="checkbox" className="size-4 accent-[var(--accent-fill)]" checked={picked.includes(u.id)} onChange={() => toggle(u.id)} />
                <Avatar name={u.name} size={24} decorative />
                <span className="min-w-0 flex-1 truncate">
                  {u.name}
                  {u.title && <span className="text-sf-text-muted"> · {u.title}</span>}
                </span>
              </label>
            </li>
          ))}
          {shown.length === 0 && <li className="sf-ui px-2 py-3 text-sf-text-muted">No one matches.</li>}
        </ul>
        {(error ?? open.error) && (
          <p role="alert" className="sf-small m-0 text-sf-error">
            {error ?? (open.error as Error).message}
          </p>
        )}
      </div>
    </Modal>
  )
}
