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
 * files) in a box on the project page. The page fills the card on this tab (UX Phase 1, 1.3), so the box takes the
 * height left under the header and the tabs; "Open in Chat" sits at the end of the tab row.
 */
export function ChatTab({ project }: { project: ProjectSummary }) {
  return (
    // A floor, so on a short screen (a phone on its side) the page scrolls to the box instead of squeezing it away.
    <div className="sf flex min-h-[18rem] flex-1 flex-col overflow-hidden rounded-xl border border-sf-line bg-sf-surface">
      <Suspense fallback={<MessageSkeleton />}>
        {/* One Files list per project (UX Phase 2, 2.5): the project's own Files tab has the chat's files; its Tasks
            tab is the project's task list, so the chat's Task list stays on the Chat side (task list R3). */}
        <ChannelView key={project.channelId} channelId={project.channelId} hideTabs={['files', 'tasks']} />
      </Suspense>
    </div>
  )
}

/** "Open in Chat", at the end of the project's tab row on the Chat tab: the full channel. */
export function OpenInChatLink({ ws, channelId }: { ws: string; channelId: string }) {
  return (
    // On a phone the icon alone, so the tabs keep the room.
    <Link
      to={paths.channel(ws, channelId)}
      title="Open in Chat"
      className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap text-sm font-medium text-accent hover:text-accent-strong max-sm:min-w-11 max-sm:justify-center"
    >
      <MessageSquare className="size-4" aria-hidden /> <span className="max-sm:sr-only">Open in Chat</span>
    </Link>
  )
}
