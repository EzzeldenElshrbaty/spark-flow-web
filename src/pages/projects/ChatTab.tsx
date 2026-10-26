import { MessageSquare } from 'lucide-react'
import { Link } from 'react-router'
import type { ProjectSummary, User } from '@/api/types'
import { paths } from '@/lib/paths'
import { ChannelFeed } from '@/pages/chat/ChannelFeed'

/** The project's channel, read here until M3 adds posting; "Open in Chat" goes to the full channel. */
export function ChatTab({ ws, project, people, usersLoading }: { ws: string; project: ProjectSummary; people: User[]; usersLoading: boolean }) {
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Link to={paths.channel(ws, project.channelId)} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-strong">
          <MessageSquare className="size-4" /> Open in Chat
        </Link>
      </div>
      <ChannelFeed key={project.channelId} channelId={project.channelId} title={project.name} users={people} usersLoading={usersLoading} />
    </>
  )
}
