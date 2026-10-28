import type { User } from '@/api/types'
import { activeTypers, useUiStore } from '@/lib/uiStore'
import { useNow } from '@/lib/useNow'
import { typingLine } from '@/pages/chat/typingLine'

/**
 * Who else is typing in a channel (spec 6.8): a 20px line under the composer, names in 600; "Several people are
 * typing…" from three. The store forgets them 3 s after their last keystroke.
 */
export function TypingLine({ channelId, people, meId }: { channelId: string; people: User[]; meId: string }) {
  const typing = useUiStore((s) => s.typing)
  // The clock ticks only while someone is still typing here.
  const now = useNow(activeTypers(typing, channelId).length ? 1000 : 0)
  const names = activeTypers(typing, channelId, now.getTime())
    .filter((id) => id !== meId)
    .map((id) => people.find((u) => u.id === id)?.name ?? 'Someone')
  const line = typingLine(names)
  return (
    <p className="sf sf-meta h-5 truncate pt-1 text-sf-text-muted" aria-live="polite">
      {line && names.length <= 2
        ? line.split(new RegExp(`(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`)).map((part, i) =>
            names.includes(part) ? (
              <b key={i} className="font-semibold">
                {part}
              </b>
            ) : (
              part
            ),
          )
        : (line ?? '')}
    </p>
  )
}
