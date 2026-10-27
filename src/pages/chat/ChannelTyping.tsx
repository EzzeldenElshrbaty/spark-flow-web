import type { User } from '@/api/types'
import { activeTypers, useUiStore } from '@/lib/uiStore'
import { useNow } from '@/lib/useNow'
import { typingLine } from '@/pages/chat/typingLine'

/** Who else is typing in a channel, above its composer; the store forgets them 3 s after their last keystroke. */
export function TypingLine({ channelId, people, meId }: { channelId: string; people: User[]; meId: string }) {
  const typing = useUiStore((s) => s.typing)
  // The clock ticks only while someone is still typing here.
  const now = useNow(activeTypers(typing, channelId).length ? 1000 : 0)
  const typers = activeTypers(typing, channelId, now.getTime()).filter((id) => id !== meId)
  return (
    <p className="h-4 text-xs text-fg-muted" aria-live="polite">
      {typingLine(typers.map((id) => people.find((u) => u.id === id)?.name ?? 'Someone')) ?? ''}
    </p>
  )
}
