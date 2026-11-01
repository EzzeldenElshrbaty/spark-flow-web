import { useId, useState } from 'react'
import { Button } from '@/components/sf/Button'
import { Modal } from '@/components/sf/Modal'

/** New folder… (spec 6.9 Add to folder ▸): a name, then the file goes in it. A refusal is said here, the name kept. */
export function NewFolderDialog({ fileTitle, onCreate, onClose }: { fileTitle: string; onCreate: (name: string) => Promise<unknown>; onClose: () => void }) {
  const id = useId()
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const create = () => {
    if (!name.trim() || pending) return
    setPending(true)
    onCreate(name.trim()).then(onClose, (reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'The folder wasn’t made. Try again.')
      setPending(false)
    })
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="New folder"
      description={`${fileTitle} goes in it. Everyone in the workspace sees its folders.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim() || pending} onClick={create}>
            {pending ? 'Creating…' : 'Create and add'}
          </Button>
        </>
      }
    >
      <label htmlFor={id} className="sf-small mb-1 block font-medium text-sf-text">
        Name
      </label>
      <input
        id={id}
        value={name}
        maxLength={60}
        onChange={(e) => {
          setName(e.target.value)
          setError(null)
        }}
        onKeyDown={(e) => e.key === 'Enter' && create()}
        className="sf-ui h-sf-input w-full min-w-0 rounded-sf-md border border-sf-line-strong bg-sf-surface px-3 text-sf-text outline-none focus:border-sf-focus focus:shadow-[0_0_0_3px_var(--surface-mention)] max-md:h-11"
      />
      {error && (
        <p role="alert" className="sf-small mt-2 text-sf-error">
          {error}
        </p>
      )}
    </Modal>
  )
}
