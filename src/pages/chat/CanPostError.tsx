import { useProjectSummaries } from '@/api/projects'
import type { Channel } from '@/api/types'

/** In place of the composer when who may post can't be worked out (the projects didn't load), with the way to retry. */
export function CanPostError({ channel }: { channel: Channel | undefined }) {
  const projects = useProjectSummaries(channel?.workspaceId)
  if (!projects.isError) return null
  return (
    <p className="text-sm text-fg-muted">
      Couldn’t check who can post here.{' '}
      <button type="button" onClick={() => void projects.refetch()} className="font-medium text-accent hover:text-accent-strong">
        Try again
      </button>
    </p>
  )
}
