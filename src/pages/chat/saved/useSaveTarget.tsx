import { useState, type ReactNode } from 'react'
import { useRemoveSaved, useSave, useSaved } from '@/api/saved'
import type { ChatTarget } from '@/api/types'
import { formatWhen } from '@/lib/format'
import type { RemindChoices } from '@/pages/chat/MessageActions'
import type { SaveToggle } from '@/pages/chat/MessageToolbar'
import { CustomReminder } from '@/pages/chat/saved/RemindMenu'

/**
 * Save for later (S) and Remind me (spec 6.4, 6.5) for one message or reply: whether it's in my Saved (In progress),
 * the toggle, the reminder choices, and the Custom… dialog to render. `say` reports how it went beside the row.
 * Undefined pieces when `enabled` is false (a pending or deleted message).
 */
export function useSaveTarget(
  target: ChatTarget,
  workspaceId: string | undefined,
  enabled: boolean,
  say: (text: string, error?: boolean) => void,
): { save?: SaveToggle; remind?: RemindChoices; toggle?: () => void; dialog: ReactNode } {
  const saved = useSaved(enabled ? workspaceId : undefined)
  const saveMutation = useSave()
  const removeMutation = useRemoveSaved()
  const [custom, setCustom] = useState(false)
  const item = saved.data?.find((s) => s.target.kind === target.kind && s.target.id === target.id)
  const isSaved = item?.status === 'inProgress'

  const failed = (e: unknown) => say((e as Error).message || 'Couldn’t save it. Try again.', true)
  const toggle = () => {
    if (isSaved && item) removeMutation.mutate(item.id, { onSuccess: () => say('Removed from Saved'), onError: failed })
    else saveMutation.mutate({ target }, { onSuccess: () => say('Saved for later'), onError: failed })
  }
  const remindAt = (at: Date) =>
    saveMutation.mutate({ target, remindAt: at.toISOString() }, { onSuccess: () => say(`Reminder set for ${formatWhen(at.toISOString())}`), onError: failed })

  const dialog = enabled && <CustomReminder open={custom} onClose={() => setCustom(false)} onPick={remindAt} />
  if (!enabled || !workspaceId) return { dialog: null }
  return {
    save: { saved: isSaved, onToggle: toggle },
    remind: { onPick: remindAt, onCustom: () => setCustom(true) },
    toggle,
    dialog,
  }
}
