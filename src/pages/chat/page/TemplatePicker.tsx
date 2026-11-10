import clsx from 'clsx'
import { useId, useState } from 'react'
import { useLatestPage, useSavePage } from '@/api/pages'
import { announce } from '@/components/sf/Announcer'
import { Button } from '@/components/sf/Button'
import { Modal, ModalCancelButton } from '@/components/sf/Modal'
import { ApiError } from '@/lib/apiError'
import { PAGE_TEMPLATES, type PageTemplate } from '@/lib/pageTemplates'

/**
 * Pick a template (chat spec 6.14 §6): one of the ready pages becomes the channel's page. A page with text asks first
 * (the old one stays in History); a refusal stays here as its sentence, read out.
 */
export function TemplatePicker({ channelId, onClose, onAdded }: { channelId: string; onClose: () => void; onAdded: () => void }) {
  const name = useId()
  const latest = useLatestPage()
  const save = useSavePage()
  const [chosen, setChosen] = useState<PageTemplate['id']>(PAGE_TEMPLATES[0]!.id)
  /** The version of a page with text, while "Replace …?" waits for an answer. */
  const [asking, setAsking] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const template = PAGE_TEMPLATES.find((t) => t.id === chosen)!

  const refuse = (e: unknown) => {
    const sentence = e instanceof ApiError ? (e.detail ?? e.title) : 'Couldn’t add the template. Check your connection.'
    setError(sentence)
    announce(sentence)
  }
  const put = async (baseVersion: number) => {
    setAsking(null)
    setBusy(true)
    try {
      await save.mutateAsync({ channelId, body: template.body, baseVersion })
      onAdded()
      onClose()
      announce('Template added to the page.')
    } catch (e) {
      refuse(e)
    } finally {
      setBusy(false)
    }
  }
  const use = async () => {
    setError(null)
    setBusy(true)
    try {
      const page = await latest(channelId)
      if (page.body.length > 0) {
        setBusy(false)
        setAsking(page.version)
        return
      }
      await put(page.version)
    } catch (e) {
      setBusy(false)
      refuse(e)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Pick a template"
      description="It fills the channel’s page. You can change everything after."
      wide
      footer={
        asking !== null ? (
          <>
            <p className="sf-ui-medium me-auto mb-0 text-sf-text">Replace the channel’s page? The current one stays in History.</p>
            <Button touch autoFocus onClick={() => setAsking(null)}>
              Keep the page
            </Button>
            <Button touch variant="primary" onClick={() => void put(asking)}>
              Replace
            </Button>
          </>
        ) : (
          <>
            {error && <p className="sf-small me-auto mb-0 text-sf-error">{error}</p>}
            <ModalCancelButton touch />
            <Button touch variant="primary" disabled={busy} onClick={() => void use()}>
              {busy ? 'Adding…' : 'Use template'}
            </Button>
          </>
        )
      }
    >
      <div role="radiogroup" aria-label="Templates" className="grid gap-2 md:grid-cols-3">
        {PAGE_TEMPLATES.map((t) => (
          <label
            key={t.id}
            className={clsx(
              'flex min-h-11 cursor-pointer flex-col gap-1 rounded-sf-lg border p-3 has-[:focus-visible]:shadow-[var(--focus-ring)]',
              chosen === t.id ? 'border-sf-accent-fill bg-sf-surface-selected' : 'border-sf-line hover:bg-sf-surface-hover',
            )}
          >
            <input type="radio" name={name} value={t.id} checked={chosen === t.id} onChange={() => setChosen(t.id)} className="sr-only" />
            <span className="sf-ui-medium text-sf-text">{t.name}</span>
            <span className="sf-small text-sf-text-secondary">{t.summary}</span>
          </label>
        ))}
      </div>
    </Modal>
  )
}
