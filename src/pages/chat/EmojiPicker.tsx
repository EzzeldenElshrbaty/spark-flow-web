import {
  IconApple,
  IconBallFootball,
  IconBulb,
  IconClock,
  IconFlag,
  IconHeart,
  IconMoodSmile,
  IconPaw,
  IconPlane,
  IconSearch,
  type TablerIcon,
} from '@tabler/icons-react'
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { IconButton } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { EMOJI_CATEGORIES, emojiInfo, recentEmoji, rememberEmoji, searchEmoji, type EmojiInfo } from '@/lib/emoji'

const ICONS: Record<string, TablerIcon> = {
  recent: IconClock,
  people: IconMoodSmile,
  nature: IconPaw,
  food: IconApple,
  activities: IconBallFootball,
  travel: IconPlane,
  objects: IconBulb,
  symbols: IconHeart,
  flags: IconFlag,
}

const COLUMNS = 9

type Section = { id: string; label: string; emoji: EmojiInfo[] }

/**
 * The emoji picker (spec 6.6, 352×412): search, category tabs, a 9-column grid of 36px cells and a footer that names
 * the emoji in focus. One tab stop for the grid: arrow keys move through it, typing goes to search. Skin tones and
 * custom emoji come later.
 */
export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [preview, setPreview] = useState<EmojiInfo | null>(null)
  const [tab, setTab] = useState('recent')
  const searchRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const sections: Section[] = useMemo(() => {
    if (query.trim()) return [{ id: 'results', label: 'Search results', emoji: searchEmoji(query) }]
    const recent = recentEmoji().map((char) => emojiInfo(char) ?? { char, name: char, aliases: [] })
    return [{ id: 'recent', label: 'Frequently used', emoji: recent }, ...EMOJI_CATEGORIES]
  }, [query])
  const flat = sections.flatMap((s) => s.emoji)

  const pick = (char: string) => {
    rememberEmoji(char)
    onPick(char)
  }

  const cells = () => [...(bodyRef.current?.querySelectorAll<HTMLButtonElement>('[data-emoji]') ?? [])]
  const moveTo = (index: number) => {
    const list = cells()
    const next = Math.max(0, Math.min(index, list.length - 1))
    setActive(next)
    list[next]?.focus()
  }
  /** The cell in the row above or below with the nearest x; ±9 when there is no layout to measure. */
  const vertical = (from: number, down: boolean) => {
    const list = cells()
    const here = list[from]
    if (!here || here.offsetHeight === 0) return from + (down ? COLUMNS : -COLUMNS)
    const rows = list.map((c) => c.getBoundingClientRect())
    const at = rows[from]
    const candidates = list.map((_, i) => i).filter((i) => (down ? rows[i].top > at.top + 1 : rows[i].top < at.top - 1))
    if (candidates.length === 0) return from
    const rowTop = down ? Math.min(...candidates.map((i) => rows[i].top)) : Math.max(...candidates.map((i) => rows[i].top))
    const row = candidates.filter((i) => Math.abs(rows[i].top - rowTop) < 1)
    return row.reduce((best, i) => (Math.abs(rows[i].left - at.left) < Math.abs(rows[best].left - at.left) ? i : best), row[0])
  }

  const onGridKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
    const keys: Record<string, () => number> = {
      ArrowRight: () => index + (rtl ? -1 : 1),
      ArrowLeft: () => index + (rtl ? 1 : -1),
      ArrowDown: () => vertical(index, true),
      ArrowUp: () => vertical(index, false),
      Home: () => 0,
      End: () => flat.length - 1,
    }
    if (keys[event.key]) {
      event.preventDefault()
      moveTo(keys[event.key]())
    } else if (event.key.length === 1 && /\S/.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
      // Typing searches, so a letter is never lost.
      event.preventDefault()
      setQuery((q) => q + event.key)
      setActive(0)
      searchRef.current?.focus()
    }
  }

  const goTo = (id: string) => {
    setTab(id)
    bodyRef.current?.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ block: 'start' })
  }
  // The tab of the section at the top follows the scroll.
  const onScroll = () => {
    const body = bodyRef.current
    if (!body || query) return
    const top = body.getBoundingClientRect().top
    const current = [...body.querySelectorAll<HTMLElement>('[data-section]')].filter((s) => s.getBoundingClientRect().top - top <= 8).at(-1)
    if (current?.dataset.section) setTab(current.dataset.section)
  }

  let index = 0
  return (
    <div className="flex h-[412px] w-[352px] max-w-full flex-col">
      <label className="mx-3 mt-3 mb-2 flex h-9 flex-none items-center gap-2 rounded-sf-md border border-sf-line-strong bg-sf-surface px-3 text-sf-text-muted focus-within:shadow-[var(--focus-ring)]">
        <Icon icon={IconSearch} size={18} />
        <input
          ref={searchRef}
          type="search"
          aria-label="Search emoji"
          placeholder="Search emoji"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && flat[0]) {
              e.preventDefault()
              pick(flat[0].char)
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              moveTo(0)
            }
          }}
          className="sf-ui min-w-0 flex-1 bg-transparent text-sf-text outline-none placeholder:text-sf-text-muted"
        />
      </label>
      {!query.trim() && (
        <div role="group" aria-label="Emoji categories" className="flex flex-none gap-0.5 border-b border-sf-line px-2">
          {sections.map((s) => (
            <IconButton key={s.id} label={s.label} icon={ICONS[s.id]} size="sm" tone="muted" pressed={tab === s.id} onClick={() => goTo(s.id)} />
          ))}
        </div>
      )}
      <div ref={bodyRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto px-2 py-1">
        {flat.length === 0 && <p className="sf-small px-1 py-6 text-center text-sf-text-muted">No emoji match “{query.trim()}”.</p>}
        {sections.map((s) =>
          s.emoji.length === 0 ? null : (
            <section key={s.id} data-section={s.id}>
              <h2 className="px-1 pt-2 pb-1 font-sf text-[12px]/[16px] font-medium tracking-[0.12em] text-sf-text-muted uppercase">{s.label}</h2>
              <div role="group" aria-label={s.label} className="grid grid-cols-9">
                {s.emoji.map((e) => {
                  const i = index++
                  return (
                    <button
                      key={`${s.id}-${e.char}`}
                      type="button"
                      data-emoji
                      aria-label={e.name}
                      tabIndex={i === active ? 0 : -1}
                      onClick={() => pick(e.char)}
                      onKeyDown={(event) => onGridKey(event, i)}
                      onFocus={() => {
                        setActive(i)
                        setPreview(e)
                      }}
                      onPointerEnter={() => setPreview(e)}
                      className="sf-focus sf-emoji grid h-9 place-items-center rounded-sf-md text-[22px]/none hover:bg-sf-surface-hover focus:bg-sf-surface-hover"
                    >
                      {e.char}
                    </button>
                  )
                })}
              </div>
            </section>
          ),
        )}
      </div>
      <div data-testid="emoji-preview" aria-live="polite" className="flex h-[52px] flex-none items-center gap-2 border-t border-sf-line bg-sf-surface-sunken px-3">
        {preview ? (
          <>
            <span aria-hidden className="sf-emoji text-[28px]/none">
              {preview.char}
            </span>
            <span className="min-w-0">
              <b className="block truncate font-sf text-[13px]/[18px] font-medium text-sf-text">{preview.name}</b>
              {preview.aliases.length > 0 && <span className="sf-meta block truncate text-sf-text-muted">{preview.aliases.map((a) => `:${a}:`).join(' ')}</span>}
            </span>
          </>
        ) : (
          <span className="sf-small text-sf-text-muted">Pick an emoji</span>
        )}
      </div>
    </div>
  )
}
