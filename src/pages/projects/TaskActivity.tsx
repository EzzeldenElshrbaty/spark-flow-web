import clsx from 'clsx'
import { useState } from 'react'
import { useAddComment, useComments } from '@/api/comments'
import type { CommentKind, ProjectSummary, TaskView, User } from '@/api/types'
import { useMe } from '@/api/users'
import { FileDrop } from '@/components/ui/FileDrop'
import { QueryError } from '@/components/ui/QueryError'
import { usePermission } from '@/lib/usePermission'
import { Composer } from '@/pages/chat/Composer'
import { CommentRow } from '@/pages/projects/CommentRow'

const MAX_FILES = 5

/** A task's comments and bugs, oldest first, and the box to add one (with files) for people on the project. */
export function TaskActivity({ task, project, users }: { task: TaskView; project: ProjectSummary | undefined; users: User[] }) {
  const comments = useComments(task.key)
  const add = useAddComment()
  const me = useMe().data
  const check = usePermission()
  const [kind, setKind] = useState<CommentKind>('comment')
  const [files, setFiles] = useState<File[]>([])
  const canPost = project && me ? check('collab.post', { project, userTeamIds: me.teamIds }) : false
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? 'Unknown person'

  return (
    <div className="space-y-4">
      {comments.isError ? (
        <QueryError what="Activity" onRetry={() => void comments.refetch()} />
      ) : comments.isPending ? (
        <div className="h-24 animate-pulse rounded-lg bg-surface-muted" aria-hidden />
      ) : comments.data.length === 0 ? (
        <p className="text-sm text-fg-muted">No comments yet.</p>
      ) : (
        <ol className="space-y-4">
          {comments.data.map((c) => (
            <CommentRow key={c.id} comment={c} author={nameOf(c.authorId)} mine={canPost && !task.archivedAt && c.authorId === me?.id} />
          ))}
        </ol>
      )}

      {task.archivedAt ? (
        <p className="text-sm text-fg-muted">This task is archived. Restore it first.</p>
      ) : canPost ? (
        <Composer
          quiet
          allowEmpty={files.length > 0}
          placeholder={kind === 'bug' ? 'What goes wrong, and how to see it' : 'Write a comment'}
          // A comment reaches the project's people; @here (a channel's active members) reaches nobody here.
          here={false}
          submitLabel={kind === 'bug' ? 'Report bug' : 'Post comment'}
          pendingLabel="Posting…"
          error={add.error as Error | null}
          onSubmit={async (body) => {
            await add.mutateAsync({ taskKey: task.key, kind, body, files })
            setFiles([])
          }}
          extra={
            <div className="w-full space-y-2">
              <div className="inline-flex rounded-lg border border-line p-0.5" role="radiogroup" aria-label="Kind">
                {(
                  [
                    ['comment', 'Comment'],
                    ['bug', 'Bug'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={kind === value}
                    onClick={() => setKind(value)}
                    className={clsx('rounded-md px-3 py-1 text-sm', kind === value ? 'bg-surface-muted font-medium text-fg' : 'text-fg-muted hover:text-fg')}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <FileDrop files={files} onFiles={setFiles} max={MAX_FILES} label="Add images, video or files (up to 5)" />
            </div>
          }
        />
      ) : (
        <p className="text-sm text-fg-muted">Only the project's people can comment here.</p>
      )}
    </div>
  )
}
