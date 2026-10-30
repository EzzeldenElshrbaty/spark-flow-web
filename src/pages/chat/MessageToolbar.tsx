import { IconBookmark, IconBookmarkFilled, IconDotsVertical, IconMessageReply, IconMoodPlus } from '@tabler/icons-react'
import clsx from 'clsx'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useReact } from '@/api/chat'
import type { ChatTarget, Reaction } from '@/api/types'
import { IconButton } from '@/components/sf/Button'
import { isRtl } from '@/components/sf/layers'
import { MenuItem, useCloseMenu } from '@/components/sf/Menu'
import type { RemindChoices } from '@/pages/chat/MessageActions'
import { Popover, type PopoverTriggerProps } from '@/components/sf/Popover'
import { Tooltip } from '@/components/sf/Tooltip'
import { useNoHover, usePhone } from '@/components/sf/usePhone'
import { emojiInfo } from '@/lib/emoji'
import { roomAround } from '@/lib/roomAround'
import { EmojiPicker } from '@/pages/chat/EmojiPicker'
import { MessageMenu, ROW_FOCUS, type Follow } from '@/pages/chat/MessageActions'

/** The toolbar's quick reactions (spec 6.4; later, the viewer's three most recent). */
export const QUICK_REACTIONS = ['✅', '👀', '🙌'] as const
/** How far the toolbar rises above its row (spec 6.4), and the gap it keeps from the row's edge or name line. */
const RISE = 16
const GAP = 4

/** Marks a row's name line (author and time): the toolbar never covers it (spec 6.4 AC). */
export const ROW_HEADER = 'data-row-header'
/** Marks a bar laid over the list (the unread bar, the day pill): the toolbar keeps below it. */
export const LIST_OVERLAY = 'data-list-overlay'

/**
 * Where the toolbar goes, as its top within the row: 16px above the row's top (spec 6.4) when there's room and that
 * hides neither the name nor the time; else fully above the row; else inside it, below a bar laid over the list and
 * under the name line if it must. "Room" ends at whatever clips the row, or at the bottom of such a bar.
 */
function placeToolbar(row: HTMLElement, bar: HTMLElement): number {
  const box = row.getBoundingClientRect()
  const { left, right } = bar.getBoundingClientRect()
  const height = bar.offsetHeight
  let ceiling = box.top - roomAround(row).above
  for (const overlay of document.querySelectorAll(`[${LIST_OVERLAY}]`)) {
    const r = overlay.getBoundingClientRect()
    if (r.left < right && left < r.right && r.top <= box.top + height) ceiling = Math.max(ceiling, r.bottom + GAP)
  }
  const header = row.querySelector(`[${ROW_HEADER}]`)
  const words = header ? [...header.children].map((child) => child.getBoundingClientRect()) : []
  const hides = (top: number) => words.some((r) => r.left < right && left < r.right && r.top < box.top + top + height && box.top + top < r.bottom)
  const underCeiling = ceiling - box.top
  const underHeader = words.length > 0 ? Math.max(...words.map((r) => r.bottom)) - box.top + GAP : GAP
  return [-RISE, -(height + GAP), GAP, underCeiling, underHeader].find((top) => box.top + top >= ceiling && !hides(top)) ?? Math.max(underCeiling, underHeader)
}

type Stop = 'more' | 'reply' | 'save' | 'add' | (typeof QUICK_REACTIONS)[number]

/** Save for later (S, spec 6.4): whether it's in my Saved (In progress), and the toggle. */
export type SaveToggle = { saved: boolean; onToggle: () => void }

/**
 * The toolbar of a message or reply (spec 6.4): ✅ 👀 🙌, Add reaction, Reply in thread (T), Save for later (S) and
 * More (the ⋯ menu).
 * Shown while its row is hovered or has keyboard focus, and while its menu or picker is open. One Tab stop per row
 * (More, then wherever I left it); ←/→, Home and End move along it. It rises 16px above the row's top end, and moves
 * where it hides neither the author's name nor the time and isn't cut off (the top row of a list, the narrow panel). Phones and tablets have no hover: the ⋯ alone,
 * its menu (a sheet on phones) starting with what the toolbar carries.
 */
export function MessageToolbar({
  target,
  reactions,
  meId,
  can,
  confirmDelete,
  onEdit,
  onReply,
  onMarkUnread,
  onCopyLink,
  onCopyText,
  follow,
  save,
  remind,
  extra,
  className,
}: {
  target: ChatTarget
  reactions: Reaction[]
  meId?: string
  can: { react: boolean; edit: boolean; remove: boolean }
  confirmDelete?: boolean
  onEdit: () => void
  /** Reply in thread (T): a top-level message, outside its own thread. */
  onReply?: () => void
  onMarkUnread?: () => void
  onCopyLink?: () => void
  onCopyText?: () => void
  /** Following its thread: a top-level message's. */
  follow?: Follow
  /** Save for later (S). */
  save?: SaveToggle
  /** Remind me about this ▸, in the ⋯ menu. */
  remind?: RemindChoices
  /** More menu items from the page (Create task). */
  extra?: ReactNode
  /** Where it sits on the row's end side. */
  className?: string
}) {
  // Phones, and touch screens with no hover (tablets): nothing shows on hover there, so the ⋯ stands in for it.
  const phone = usePhone()
  const noHover = useNoHover()
  const touch = phone || noHover
  const react = useReact(meId)
  const bar = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<Stop | null>(null)
  const [top, setTop] = useState<number | null>(null)

  // Placed when the row is about to show it: hovered, or focus coming in.
  useEffect(() => {
    const row = bar.current?.closest('article')
    if (!row || touch) return
    const place = () => {
      if (bar.current) setTop(placeToolbar(row, bar.current))
    }
    row.addEventListener('pointerenter', place)
    row.addEventListener('focusin', place)
    return () => {
      row.removeEventListener('pointerenter', place)
      row.removeEventListener('focusin', place)
    }
  }, [touch])

  const mine = (emoji: string) => meId != null && reactions.some((r) => r.emoji === emoji && r.userIds.includes(meId))
  // One reaction at a time from here: a fast second press while one is in flight could land first and undo it.
  const toggle = (emoji: string) => !react.isPending && react.mutate({ target, emoji, on: !mine(emoji) })
  // The picker only adds: picking one I gave already isn't a toggle off.
  const add = (emoji: string) => {
    if (!react.isPending && !mine(emoji)) react.mutate({ target, emoji, on: true })
  }
  // A refused delete says why, here, outside the toolbar: shown while it hides.
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const menu = { target, can, confirmDelete, onEdit, onMarkUnread, onCopyLink, onCopyText, follow, remind, extra, onDeleteError: setDeleteError }
  const message = react.error?.message ?? deleteError
  const error = message && (
    <p role="alert" className={clsx('sf-meta absolute top-9 z-10 w-56 rounded-sf-md bg-sf-surface-raised p-2 text-sf-error shadow-sf-menu', className)}>
      {message}
    </p>
  )

  if (touch) {
    const lead = (can.react || onReply || save) && (
      <>
        {can.react && <SheetReactions mine={mine} onToggle={toggle} onAdd={() => bar.current?.querySelector<HTMLElement>('[data-add-reaction]')?.click()} />}
        {onReply && (
          <MenuItem icon={IconMessageReply} onSelect={onReply}>
            Reply in thread
          </MenuItem>
        )}
        {save && (
          <MenuItem icon={save.saved ? IconBookmarkFilled : IconBookmark} onSelect={save.onToggle}>
            {save.saved ? 'Remove from Saved' : 'Save for later'}
          </MenuItem>
        )}
      </>
    )
    return (
      <>
        <div ref={bar} className={clsx('absolute top-1', className)}>
          {can.react && (
            // The sheet's Add reaction opens this picker. Its own trigger is out of sight and out of the screen
            // reader's way; when the picker closes, focus lands on it and goes straight on to the ⋯.
            <AddReaction
              onPick={add}
              trigger={(props) => (
                <button
                  type="button"
                  {...props}
                  data-add-reaction=""
                  tabIndex={-1}
                  aria-hidden
                  onFocus={() => bar.current?.querySelector<HTMLElement>(`[${ROW_FOCUS}]`)?.focus()}
                  className="sr-only"
                />
              )}
            />
          )}
          {/* A 44px touch target (spec 6.16) around the 32px button. */}
          <MessageMenu
            {...menu}
            lead={lead || undefined}
            trigger={(props) => (
              <IconButton label="More actions" icon={IconDotsVertical} {...props} {...{ [ROW_FOCUS]: '' }} className="relative after:absolute after:-inset-1.5" />
            )}
          />
        </div>
        {error}
      </>
    )
  }

  const offersMenu = Boolean(follow || onMarkUnread || remind || onCopyLink || onCopyText || can.edit || can.remove || extra)
  const stops: Stop[] = [
    ...(can.react ? [...QUICK_REACTIONS, 'add' as const] : []),
    ...(onReply ? ['reply' as const] : []),
    ...(save ? ['save' as const] : []),
    ...(offersMenu ? ['more' as const] : []),
  ]
  if (stops.length === 0) return null
  const current = active && stops.includes(active) ? active : stops[stops.length - 1]
  const stop = (key: Stop) => ({ tabIndex: key === current ? 0 : -1, onFocus: () => setActive(key), 'data-toolbar-stop': key, [ROW_FOCUS]: key === current ? '' : undefined })

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-toolbar-stop]')]
    const index = items.indexOf(document.activeElement as HTMLElement)
    // Keys from its menu or picker (portals) come here too: only the toolbar's own buttons move along it.
    if (index < 0) return
    const [back, forward] = isRtl(event.currentTarget) ? ['ArrowRight', 'ArrowLeft'] : ['ArrowLeft', 'ArrowRight']
    const to = event.key === forward ? index + 1 : event.key === back ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null
    if (to === null) return
    event.preventDefault()
    items[(to + items.length) % items.length].focus()
  }

  return (
    <>
      <div
        ref={bar}
        role="toolbar"
        aria-label="Message actions"
        onKeyDown={onKeyDown}
        style={top === null ? undefined : { top }}
        className={clsx(
          'absolute z-[var(--z-toolbar)] flex items-center gap-0.5 rounded-sf-lg bg-sf-surface-raised p-0.5 shadow-sf-toolbar',
          top === null && '-top-4',
          // Hidden, it takes no pointer: it reaches over the row above, whose own toolbar that spot belongs to. Keyboard
          // focus shows it (focus-visible), not a mouse click, which would leave it showing as the pointer moves on.
          'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-has-[:focus-visible]:pointer-events-auto group-has-[:focus-visible]:opacity-100 has-[[aria-expanded=true]]:pointer-events-auto has-[[aria-expanded=true]]:opacity-100',
          className,
        )}
      >
        {can.react &&
          QUICK_REACTIONS.map((emoji) => (
            <Tooltip key={emoji} label={`:${emojiInfo(emoji)?.aliases[0] ?? emoji}:`}>
              <button
                type="button"
                {...stop(emoji)}
                aria-label={`React with ${emoji}`}
                aria-pressed={mine(emoji)}
                onClick={() => toggle(emoji)}
                className={clsx('sf-focus inline-grid size-sf-control place-items-center rounded-sf-md hover:bg-sf-surface-hover', mine(emoji) && 'bg-sf-surface-mention')}
              >
                <span className="sf-emoji text-[16px]/none">{emoji}</span>
              </button>
            </Tooltip>
          ))}
        {can.react && <AddReaction onPick={add} trigger={(props) => <IconButton label="Add reaction" icon={IconMoodPlus} {...props} {...stop('add')} />} />}
        {can.react && (onReply || save || offersMenu) && <span aria-hidden className="mx-0.5 h-5 w-px bg-sf-line" />}
        {onReply && <IconButton label="Reply in thread" icon={IconMessageReply} shortcut={['T']} onClick={onReply} {...stop('reply')} />}
        {save && (
          <IconButton
            label={save.saved ? 'Remove from Saved' : 'Save for later'}
            icon={save.saved ? IconBookmarkFilled : IconBookmark}
            pressed={save.saved}
            shortcut={['S']}
            onClick={save.onToggle}
            {...stop('save')}
          />
        )}
        {offersMenu && <MessageMenu {...menu} trigger={(props) => <IconButton label="More actions" icon={IconDotsVertical} {...props} {...stop('more')} />} />}
      </div>
      {error}
    </>
  )
}

function AddReaction({ onPick, trigger }: { onPick: (emoji: string) => void; trigger: (props: PopoverTriggerProps) => ReactNode }) {
  return (
    <Popover label="Add reaction" className="w-[352px] max-w-[calc(100vw-16px)] overflow-hidden" trigger={trigger}>
      {(close) => (
        <EmojiPicker
          onPick={(emoji) => {
            close()
            onPick(emoji)
          }}
        />
      )}
    </Popover>
  )
}

/** The sheet's quick reactions on a phone, then Add reaction (the picker). */
function SheetReactions({ mine, onToggle, onAdd }: { mine: (emoji: string) => boolean; onToggle: (emoji: string) => void; onAdd: () => void }) {
  const close = useCloseMenu()
  return (
    <>
      <div role="group" aria-label="Quick reactions" className="mx-2 flex flex-none items-center gap-1 pb-1">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            role="menuitemcheckbox"
            aria-checked={mine(emoji)}
            aria-label={`React with ${emoji}`}
            tabIndex={-1}
            onClick={() => {
              close()
              onToggle(emoji)
            }}
            className={clsx('sf-focus inline-grid size-11 place-items-center rounded-sf-md outline-none hover:bg-sf-surface-hover focus:bg-sf-surface-hover', mine(emoji) && 'bg-sf-surface-mention')}
          >
            <span className="sf-emoji text-[20px]/none">{emoji}</span>
          </button>
        ))}
      </div>
      <MenuItem icon={IconMoodPlus} onSelect={onAdd}>
        Add reaction
      </MenuItem>
    </>
  )
}
