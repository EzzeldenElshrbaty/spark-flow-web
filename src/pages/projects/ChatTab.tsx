import { useEffect } from 'react'
import { MessageSquare } from 'lucide-react'
import { Link } from 'react-router'
import { useChannel, useSendMessage } from '@/api/chat'
import type { ProjectSummary, User } from '@/api/types'
import { useRole } from '@/lib/useRole'
import { paths } from '@/lib/paths'
import { ChannelFeed } from '@/pages/chat/ChannelFeed'
import { Composer } from '@/pages/chat/Composer'
import { useCanPost, useReadOnlyLine } from '@/pages/chat/useCanPost'
import { CanPostError } from '@/pages/chat/CanPostError'
import { TypingLine } from '@/pages/chat/ChannelTyping'
import { useRealtime } from '@/lib/realtime'
import { useTaskFromMessage } from '@/pages/chat/useTaskFromMessage'

/** The project's channel, to read and write in; "Open in Chat" goes to the full channel. */
export function ChatTab({ ws, project, people, usersLoading }: { ws: string; project: ProjectSummary; people: User[]; usersLoading: boolean }) {
  const channel = useChannel(project.channelId)
  const canPost = useCanPost(channel.data)
  const realtime = useRealtime()
  const readOnly = useReadOnlyLine(channel.data)
  const fromMessage = useTaskFromMessage(project.channelId, project.workspaceId)
  const send = useSendMessage()
  const { reset } = send
  useEffect(() => reset(), [project.channelId, reset])
  const { persona } = useRole()
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Link to={paths.channel(ws, project.channelId)} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-strong">
          <MessageSquare className="size-4" /> Open in Chat
        </Link>
      </div>
      <ChannelFeed
        key={project.channelId}
        channelId={project.channelId}
        title={project.name}
        users={people}
        usersLoading={usersLoading}
        meId={persona.id}
        canPost={canPost === true}
        messageActions={fromMessage.messageActions}
        composer={
          canPost === false ? (
            <p className="text-sm text-fg-muted">{readOnly}</p>
          ) : canPost ? (
            <>
            <TypingLine channelId={project.channelId} people={people} meId={persona.id} />
            <Composer
              quiet
              placeholder={`Message ${project.name}`}
              onTyping={() => realtime.sendTyping(project.channelId, persona.id)}
              submitLabel="Send"
              pendingLabel="Sending…"
              error={send.error as Error | null}
              onSubmit={(content) => send.mutateAsync({ channelId: project.channelId, content })}
            />
            </>
          ) : (
            <CanPostError channel={channel.data} />
          )
        }
      />
      {fromMessage.sheet}
    </>
  )
}
