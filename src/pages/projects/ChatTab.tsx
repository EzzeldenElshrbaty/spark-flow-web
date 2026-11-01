import { MessageSquare } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Link } from 'react-router'
import type { ProjectSummary } from '@/api/types'
import { paths } from '@/lib/paths'
import { MessageSkeleton } from '@/pages/chat/MessageSkeleton'

// The channel's code loads with the tab, as it does with the channel page.
const ChannelView = lazy(() => import('@/pages/chat/ChannelPage').then((m) => ({ default: m.ChannelView })))

/**
 * The project's channel (slice AA): the same view as in Chat (header, tabs, messages, the rich composer, threads and
 * files) in a box on the project page; "Open in Chat" goes to the full channel.
 */
export function ChatTab({ ws, project }: { ws: string; project: ProjectSummary }) {
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Link to={paths.channel(ws, project.channelId)} className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-strong">
          <MessageSquare className="size-4" /> Open in Chat
        </Link>
      </div>
      {/* A pane of its own: the messages scroll inside it, the composer stays at its foot. */}
      <div className="sf flex h-[calc(100dvh-22rem)] min-h-[26rem] flex-col overflow-hidden rounded-xl border border-sf-line bg-sf-surface">
        <Suspense fallback={<MessageSkeleton />}>
          <ChannelView key={project.channelId} channelId={project.channelId} />
        </Suspense>
      </div>
    </>
  )
}
