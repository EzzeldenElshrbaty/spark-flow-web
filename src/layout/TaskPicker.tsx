import clsx from 'clsx'
import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import type { TargetGroup, TimerTarget } from './timerTargets'

const field =
  'sf-ui h-sf-input w-full min-w-0 rounded-sf-md border border-sf-line-strong bg-sf-surface px-3 text-sf-text outline-none focus:border-sf-focus focus:shadow-[0_0_0_3px_var(--surface-mention)] max-md:h-11'

/**
 * Start timer's search list (UX Phase 4, 4.3): a box that filters the list under it, always open, in groups. ↑ and ↓
 * move through every option, Enter or a click picks one; the box keeps the focus (`aria-activedescendant`).
 */
export function TaskPicker({ groups, query, onQuery, onPick, chosen, busy = false }: { groups: TargetGroup[]; query: string; onQuery: (q: string) => void; onPick: (target: TimerTarget) => void; chosen?: TimerTarget | null; busy?: boolean }) {
  const ids = useId()
  const flat = groups.flatMap((g) => g.targets)
  const [active, setActive] = useState(0)
  // New words, a new list: the first one is the one Enter picks.
  useEffect(() => setActive(0), [query])
  const at = Math.min(active, flat.length - 1)
  const optionId = (i: number) => `${ids}-option-${i}`
  // The highlighted one is the one Enter starts: keep it in view as ↑ and ↓ move through the list (final review).
  useEffect(() => {
    if (at >= 0) document.getElementById(optionId(at))?.scrollIntoView?.({ block: 'nearest' })
  }, [at])
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || flat.length === 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((at + (event.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      onPick(flat[at]!)
    }
  }
  let index = -1
  return (
    <div>
      <label htmlFor={`${ids}-box`} className="sf-small mb-1 block font-medium text-sf-text">
        Find a task
      </label>
      <input
        id={`${ids}-box`}
        role="combobox"
        aria-expanded
        aria-controls={`${ids}-list`}
        aria-autocomplete="list"
        aria-activedescendant={flat.length ? optionId(at) : undefined}
        autoComplete="off"
        className={field}
        placeholder="Search keys, titles and projects…"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {/* A list box only while it holds tasks: an empty one with a sentence in it isn't a list (UX Phase 6, axe). */}
      <div id={`${ids}-list`} role={groups.length ? 'listbox' : undefined} aria-label={groups.length ? 'Tasks' : undefined} aria-busy={busy} className="mt-2 max-h-72 overflow-y-auto rounded-sf-md border border-sf-line p-1">
        {groups.length === 0 && (
          <p className="sf-ui m-0 px-2 py-3 text-sf-text-muted">{query.trim() ? `No open tasks match “${query.trim()}”.` : 'No open tasks of yours yet. Search for one, or log on the project only.'}</p>
        )}
        {groups.map((group) => (
          <div key={group.label} role="group" aria-label={group.label}>
            <p aria-hidden className="sf-meta m-0 px-2 pt-2 pb-1 text-sf-text-muted">
              {group.label}
            </p>
            {group.targets.map((target) => {
              index += 1
              const i = index
              const picked = chosen?.kind === target.kind && chosen.id === target.id
              return (
                <div
                  key={`${target.kind}:${target.id}`}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === at}
                  // The box keeps the focus while the pointer picks.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => onPick(target)}
                  className={clsx('cursor-pointer rounded-sf-sm px-2 py-1.5 max-md:py-2.5', i === at && 'bg-sf-surface-hover', picked && 'ring-1 ring-sf-focus')}
                >
                  <span className="sf-ui block truncate text-sf-text">{target.label}</span>
                  <span className="sf-meta block truncate text-sf-text-muted">{target.detail}</span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
