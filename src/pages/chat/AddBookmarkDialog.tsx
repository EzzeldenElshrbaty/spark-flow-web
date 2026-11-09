import { useId, useState } from 'react'
import { Button } from '@/components/sf/Button'
import { fieldClass as field } from '@/components/sf/field'
import { Modal } from '@/components/sf/Modal'

/** Add a bookmark (spec 6.1 +): a web address and an optional name; a refusal is said here and what was typed stays. */
export function AddBookmarkDialog({ onAdd, onClose }: { onAdd: (bookmark: { title: string; url: string }) => Promise<unknown>; onClose: () => void }) {
  const ids = useId()
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const add = () => {
    if (!url.trim() || pending) return
    setPending(true)
    onAdd({ title: title.trim(), url: url.trim() }).then(onClose, (reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'The bookmark wasn’t added. Try again.')
      setPending(false)
    })
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Add a bookmark"
      description="A link everyone in the channel sees after its tabs."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!url.trim() || pending} onClick={add}>
            {pending ? 'Adding…' : 'Add'}
          </Button>
        </>
      }
    >
      <label htmlFor={`${ids}-url`} className="sf-small mb-1 block font-medium text-sf-text">
        Address
      </label>
      <input id={`${ids}-url`} className={field} inputMode="url" placeholder="https://…" value={url} onChange={(e) => (setUrl(e.target.value), setError(null))} />
      <label htmlFor={`${ids}-title`} className="sf-small mt-4 mb-1 block font-medium text-sf-text">
        Name <span className="font-normal text-sf-text-muted">(optional)</span>
      </label>
      <input id={`${ids}-title`} className={field} maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
      {error && (
        <p role="alert" className="sf-small mt-3 text-sf-error">
          {error}
        </p>
      )}
    </Modal>
  )
}
