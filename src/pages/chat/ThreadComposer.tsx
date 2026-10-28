import { lazy, Suspense, useState } from 'react'
import { useDraftSaver, useDrafts } from '@/api/chat'
import type { Channel } from '@/api/types'
import { Checkbox } from '@/components/sf/Toggle'
import type { Body } from '@/lib/messageBody'
import { useComposerDirectory } from '@/pages/chat/useComposerDirectory'
import { UploadTray } from '@/pages/chat/uploads/UploadTray'
import { paneDrop, useUploads } from '@/pages/chat/uploads/useUploads'

const RichComposer = lazy(() => import('@/pages/chat/composer/RichComposer').then((m) => ({ default: m.RichComposer })))

const skeleton = <div aria-hidden className="h-[74px] animate-pulse rounded-lg bg-surface-muted" />

/**
 * A thread's reply box (spec 6.7): the rich composer with its formatting row hidden until Aa, a draft per thread, and
 * "Also send to #channel" under it, unchecked each time.
 */
export function ThreadComposer({
  channel,
  rootId,
  sendTo,
  error,
  onSend,
}: {
  channel: Channel
  rootId: string
  /** Where Also send goes: "#backend", or the people of a DM. */
  sendTo: string
  error?: Error | null
  onSend: (body: Body, alsoInChannel: boolean, fileIds: string[]) => Promise<unknown>
}) {
  const drafts = useDrafts(channel.workspaceId)
  const saveDraft = useDraftSaver()
  const directory = useComposerDirectory(channel.workspaceId, channel.memberIds)
  const [also, setAlso] = useState(false)
  // A thread's own tray (spec 6.9): its files go with the reply.
  const uploads = useUploads(channel.id)
  if (drafts.isPending) return skeleton
  const draft = drafts.data?.find((d) => d.channelId === channel.id && d.rootId === rootId)
  return (
    <div className="sf flex flex-col gap-2" {...paneDrop(true, uploads.add)}>
      <Suspense fallback={skeleton}>
        <RichComposer
          key={rootId}
          placeholder="Reply in the thread"
          initialBody={draft?.body}
          showFormatting={false}
          onSend={(body) =>
            onSend(body, also, uploads.ready.map((f) => f.id)).then(() => {
              setAlso(false)
              uploads.clear()
            })
          }
          onDraft={(body) => saveDraft(channel.id, body, rootId)}
          error={error}
          directory={directory}
          files={{
            tray: <UploadTray uploads={uploads.items} refused={uploads.refused} onRemove={uploads.remove} onRetry={uploads.retry} />,
            onAdd: uploads.add,
            ready: uploads.ready.length,
            waiting: uploads.waiting,
          }}
        />
      </Suspense>
      <Checkbox checked={also} onChange={setAlso}>
        Also send to {sendTo}
      </Checkbox>
    </div>
  )
}
