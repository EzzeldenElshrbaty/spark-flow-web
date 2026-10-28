import { lazy, Suspense, useState } from 'react'
import { useDraftSaver, useDrafts } from '@/api/chat'
import type { Channel } from '@/api/types'
import { Checkbox } from '@/components/sf/Toggle'
import type { Body } from '@/lib/messageBody'
import { useComposerDirectory } from '@/pages/chat/useComposerDirectory'

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
  onSend: (body: Body, alsoInChannel: boolean) => Promise<unknown>
}) {
  const drafts = useDrafts(channel.workspaceId)
  const saveDraft = useDraftSaver()
  const directory = useComposerDirectory(channel.workspaceId, channel.memberIds)
  const [also, setAlso] = useState(false)
  if (drafts.isPending) return skeleton
  const draft = drafts.data?.find((d) => d.channelId === channel.id && d.rootId === rootId)
  return (
    <div className="sf flex flex-col gap-2">
      <Suspense fallback={skeleton}>
        <RichComposer
          key={rootId}
          placeholder="Reply in the thread"
          initialBody={draft?.body}
          showFormatting={false}
          onSend={(body) => onSend(body, also).then(() => setAlso(false))}
          onDraft={(body) => saveDraft(channel.id, body, rootId)}
          error={error}
          directory={directory}
        />
      </Suspense>
      <Checkbox checked={also} onChange={setAlso}>
        Also send to {sendTo}
      </Checkbox>
    </div>
  )
}
