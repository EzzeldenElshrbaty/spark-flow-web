import { useId, useState } from 'react'
import type { Bookmark } from '@/api/types'
import { Button } from '@/components/sf/Button'

/**
 * Channel details › Tabs (spec 6.10): the channel's bookmarks, each with Rename and Remove for whoever may post (the
 * handlers are there); read-only otherwise. A refusal is said under the list.
 */
export function BookmarksPanel({
  bookmarks,
  onUpdate,
  onRemove,
}: {
  bookmarks: Bookmark[]
  onUpdate?: (id: string, patch: { title: string }) => Promise<unknown>
  onRemove?: (id: string) => Promise<unknown>
}) {
  const ids = useId()
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const failed = (e: unknown) => setError(e instanceof Error ? e.message : 'That didn’t work. Try again.')
  if (bookmarks.length === 0) return <p className="sf-small m-0 text-sf-text-muted">No bookmarks yet. Add one with + after the channel’s tabs.</p>
  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {bookmarks.map((b) => (
          <li key={b.id} className="flex min-h-11 items-center gap-2 rounded-sf-md px-2 hover:bg-sf-surface-hover">
            {renaming?.id === b.id ? (
              <>
                <label htmlFor={`${ids}-${b.id}`} className="sr-only">
                  Name
                </label>
                <input
                  id={`${ids}-${b.id}`}
                  value={renaming.title}
                  maxLength={60}
                  onChange={(e) => setRenaming({ id: b.id, title: e.target.value })}
                  className="sf-ui h-8 min-w-0 flex-1 rounded-sf-md border border-sf-line-strong bg-sf-surface px-2 text-sf-text outline-none focus:border-sf-focus"
                />
                <Button size="sm" onClick={() => setRenaming(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => onUpdate?.(b.id, { title: renaming.title.trim() }).then(() => (setRenaming(null), setError(null)), failed)}
                >
                  Save
                </Button>
              </>
            ) : (
              <>
                <a href={b.url} target="_blank" rel="noopener noreferrer" className="sf-focus sf-ui min-w-0 flex-1 truncate rounded-sf-sm text-sf-accent underline">
                  {b.title}
                </a>
                <span className="sf-meta hidden min-w-0 max-w-48 truncate text-sf-text-muted sm:inline">{new URL(b.url).hostname}</span>
                {onUpdate && (
                  <Button size="sm" aria-label={`Rename ${b.title}`} onClick={() => setRenaming({ id: b.id, title: b.title })}>
                    Rename
                  </Button>
                )}
                {onRemove && (
                  <Button size="sm" aria-label={`Remove ${b.title}`} onClick={() => onRemove(b.id).then(() => setError(null), failed)}>
                    Remove
                  </Button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="sf-small mt-2 text-sf-error">
          {error}
        </p>
      )}
    </>
  )
}
