import { IconArrowUpRight } from '@tabler/icons-react'
import { Link } from 'react-router'
import type { MessageHit } from '@/api/types'
import { Avatar } from '@/components/Avatar'
import { Icon } from '@/components/sf/Icon'
import { formatWhen } from '@/lib/format'
import { paths } from '@/lib/paths'
import { excerpt, matchRanges, type ParsedQuery, type Range } from '@/lib/searchQuery'

/** Text with its matches marked (`surface-selected`, 600 weight); plain text, never markup. */
export function Highlighted({ text, ranges }: { text: string; ranges: Range[] }) {
  const parts: React.ReactNode[] = []
  let at = 0
  for (const [s, e] of ranges) {
    if (s > at) parts.push(text.slice(at, s))
    parts.push(
      <mark key={s} className="rounded-sf-sm bg-sf-surface-selected font-semibold text-sf-text">
        {text.slice(s, e)}
      </mark>,
    )
    at = e
  }
  parts.push(text.slice(at))
  return <>{parts}</>
}

/** Where a message result opens: the message in its channel, or a reply in its thread. */
export const hitLink = (hit: MessageHit, ws: string) =>
  hit.rootId ? `${paths.channel(ws, hit.channelId)}?thread=${encodeURIComponent(hit.rootId)}` : paths.message(ws, hit.channelId, hit.target.id)

/**
 * A message that matched (spec 6.12): where and when, the author, then about 240 characters around the first match with
 * every match highlighted; View in channel shows on hover and focus, and always on phones.
 */
export function SearchResultCard({ hit, query, place, author, ws }: { hit: MessageHit; query: ParsedQuery; place: string; author: string; ws: string }) {
  const cut = excerpt(hit.text, matchRanges(hit.text, query))
  return (
    <article aria-label={`${author} in ${place}`} className="group/hit relative rounded-sf-lg border border-sf-line bg-sf-surface px-4 py-3 hover:bg-sf-surface-hover">
      <p className="sf-meta m-0 flex min-w-0 items-center gap-1 text-sf-text-secondary">
        <span className="truncate font-medium">{place}</span>
        <span aria-hidden>·</span>
        <time dateTime={hit.createdAt} className="whitespace-nowrap tabular-nums">
          {formatWhen(hit.createdAt)}
        </time>
        {hit.rootId && <span className="whitespace-nowrap"> · in a thread</span>}
      </p>
      <div className="mt-2 grid grid-cols-[var(--size-avatar)_minmax(0,1fr)] gap-x-3">
        <Avatar id={hit.senderId} name={author} decorative />
        <div className="min-w-0">
          <p className="sf-body-strong m-0 text-sf-text">{author}</p>
          <p className="sf-body m-0 break-words whitespace-pre-line text-sf-text">
            <Highlighted text={cut.text} ranges={cut.ranges} />
          </p>
        </div>
      </div>
      <Link
        to={hitLink(hit, ws)}
        className="sf-focus sf-small absolute end-3 top-2 inline-flex h-7 items-center gap-1 rounded-sf-md border border-sf-line bg-sf-surface px-2 font-medium text-sf-text opacity-0 group-hover/hit:opacity-100 focus-visible:opacity-100 max-md:static max-md:mt-2 max-md:h-11 max-md:opacity-100"
      >
        View in channel
        <Icon icon={IconArrowUpRight} size={16} className="rtl:-scale-x-100" />
      </Link>
    </article>
  )
}
