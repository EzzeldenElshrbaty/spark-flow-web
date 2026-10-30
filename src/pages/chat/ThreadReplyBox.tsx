import { useReply } from '@/api/chat'
import { useProjectSummaries } from '@/api/projects'
import type { Channel } from '@/api/types'
import { cantWriteLine, mustJoin } from '@/lib/channels'
import { bodyText } from '@/lib/messageBody'
import { useRole } from '@/lib/useRole'
import { JoinChannelLine } from '@/pages/chat/ChannelActions'
import { CanPostError } from '@/pages/chat/CanPostError'
import { ThreadComposer } from '@/pages/chat/ThreadComposer'
import { useCanPost, useCanWrite, useReadOnlyLine } from '@/pages/chat/useCanPost'

/**
 * A thread's reply box (spec 6.7), wherever the thread shows (the panel, a Threads card): the composer with Also send
 * to `where` when I may write; otherwise why not, as the channel says it (join first, read-only, admins only).
 */
export function ThreadReplyBox({ channel, rootId, where, autoFocus = false }: { channel: Channel; rootId: string; where: string; autoFocus?: boolean }) {
  const { persona } = useRole()
  const canPost = useCanPost(channel)
  const canWrite = useCanWrite(channel)
  const readOnly = useReadOnlyLine(channel)
  const projects = useProjectSummaries(channel.workspaceId)
  const reply = useReply()
  // As in the channel: a public channel I'm not in asks me to join before I write.
  if (mustJoin(channel, persona.id, projects.data)) return <JoinChannelLine channel={channel} />
  if (canPost === false) return <p className="text-sm text-fg-muted">{readOnly}</p>
  if (canPost && !canWrite) return <p className="text-sm text-fg-muted">{cantWriteLine(channel)}</p>
  if (!canPost) return <CanPostError channel={channel} />
  return (
    <ThreadComposer
      channel={channel}
      rootId={rootId}
      sendTo={where}
      autoFocus={autoFocus}
      error={reply.error as Error | null}
      onSend={(body, alsoInChannel, fileIds) => reply.mutateAsync({ messageId: rootId, content: bodyText(body), body, alsoInChannel, fileIds, clientId: crypto.randomUUID() })}
    />
  )
}
