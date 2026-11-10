import { IconArrowLeft } from '@tabler/icons-react'
import clsx from 'clsx'
import { useState } from 'react'
import { usePageHistory, usePageVersion, useRestorePage } from '@/api/pages'
import type { User } from '@/api/types'
import { announce } from '@/components/sf/Announcer'
import { Button } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Modal, ModalCancelButton } from '@/components/sf/Modal'
import { usePhone } from '@/components/sf/usePhone'
import { ApiError } from '@/lib/apiError'
import { formatWhen } from '@/lib/format'
import type { BodyContext } from '@/pages/chat/MessageBody'
import { PageReader } from './PageReader'

/**
 * A page's history (chat spec 6.14 §6.5): its versions, newest first, beside the one picked, read-only. Whoever may
 * edit restores an older one as a new version; a refusal stays here as its sentence. On phones the list comes first.
 */
export function PageHistory({ channelId, ctx, people, mayEdit, currentVersion, onClose }: {
  channelId: string
  ctx: BodyContext
  people: User[]
  mayEdit: boolean
  currentVersion: number
  onClose: () => void
}) {
  const phone = usePhone()
  const history = usePageHistory(channelId, true)
  const versions = history.data ?? []
  const [picked, setPicked] = useState<string | null>(null)
  const selected = picked ?? versions[0]?.id ?? null
  const version = usePageVersion(channelId, selected)
  const restore = useRestorePage()
  const [error, setError] = useState<string | null>(null)
  const nameOf = (id: string) => people.find((u) => u.id === id)?.name ?? 'Someone'
  const isCurrent = (v: { version: number }) => v.version === currentVersion
  const chosen = versions.find((v) => v.id === selected)

  const doRestore = async () => {
    if (!chosen) return
    setError(null)
    try {
      await restore.mutateAsync({ channelId, versionId: chosen.id, baseVersion: currentVersion })
      announce('Version restored.')
      onClose()
    } catch (e) {
      setError(e instanceof ApiError ? (e.detail ?? e.title) : 'Couldn’t restore this version. Check your connection.')
    }
  }

  const list = (
    <ul aria-label="Versions" className="space-y-0.5">
      {versions.map((v) => (
        <li key={v.id}>
          <button
            type="button"
            aria-current={v.id === selected}
            onClick={() => {
              setPicked(v.id)
              setError(null)
            }}
            className={clsx(
              'sf-focus sf-ui flex min-h-11 w-full items-center gap-2 rounded-sf-md px-2 py-1 text-start text-sf-text hover:bg-sf-surface-hover',
              v.id === selected && 'bg-sf-surface-selected',
            )}
          >
            <span className="min-w-0 flex-1 truncate">
              {formatWhen(v.savedAt)} · {nameOf(v.savedBy)}
            </span>
            {isCurrent(v) && <span className="sf-meta flex-none text-sf-text-secondary">Current</span>}
          </button>
        </li>
      ))}
    </ul>
  )
  const view = (
    <div className="min-h-40 rounded-sf-md border border-sf-line p-4">
      {version.data ? <PageReader body={version.data.body} ctx={ctx} /> : <div aria-busy="true" className="h-4 w-2/3 animate-pulse rounded-sf-sm bg-sf-surface-hover" />}
    </div>
  )

  return (
    <Modal
      open
      onClose={onClose}
      title="Page history"
      wide
      footer={
        <>
          {error && <p className="sf-small me-auto text-sf-error">{error}</p>}
          <ModalCancelButton>Close</ModalCancelButton>
          {mayEdit && chosen && !isCurrent(chosen) && (
            <Button variant="primary" onClick={() => void doRestore()} disabled={restore.isPending}>
              {restore.isPending ? 'Restoring…' : 'Restore this version'}
            </Button>
          )}
        </>
      }
    >
      {history.isPending ? (
        <div aria-busy="true" className="h-24 animate-pulse rounded-sf-md bg-sf-surface-hover" />
      ) : versions.length === 0 ? (
        <p className="sf-ui text-sf-text-secondary">No versions yet.</p>
      ) : phone ? (
        picked ? (
          <div className="space-y-3">
            <Button variant="ghost" size="sm" touch onClick={() => setPicked(null)}>
              <Icon icon={IconArrowLeft} size={18} flip />
              Back
            </Button>
            {view}
          </div>
        ) : (
          list
        )
      ) : (
        <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4">
          <div className="max-h-[60vh] overflow-y-auto">{list}</div>
          <div className="max-h-[60vh] overflow-y-auto">{view}</div>
        </div>
      )}
    </Modal>
  )
}
