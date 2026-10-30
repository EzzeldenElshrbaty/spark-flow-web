import { IconAlarmSnooze, IconCheck } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useSaved, useUpdateSaved } from '@/api/saved'
import type { FlowbotNote } from '@/api/types'
import { Button } from '@/components/sf/Button'
import { Menu } from '@/components/sf/Menu'
import { formatWhen } from '@/lib/format'
import { paths } from '@/lib/paths'
import { CustomReminder, RemindItems } from '@/pages/chat/saved/RemindMenu'

type Reminder = Extract<FlowbotNote, { kind: 'reminder' }>

/** Where a reminder's View message goes: the message in its channel, or a reply's thread. */
export function reminderLink(note: Reminder, ws: string): string {
  if (note.target.kind === 'note') return paths.channel(ws, note.target.channelId)
  if (note.rootId) return `${paths.channel(ws, note.channelId)}?thread=${encodeURIComponent(note.rootId)}`
  return paths.message(ws, note.channelId, note.target.id)
}

/**
 * The buttons under a Flowbot reminder (spec 6.5): View message, and while its saved item is still there, Mark
 * complete and Snooze (the Remind me choices), or "Completed" once it's done. `say` reports how it went.
 */
export function FlowbotReminder({ note, ws, workspaceId, say }: { note: Reminder; ws: string; workspaceId: string | undefined; say: (text: string, error?: boolean) => void }) {
  const saved = useSaved(workspaceId)
  const update = useUpdateSaved()
  const [custom, setCustom] = useState(false)
  const item = saved.data?.find((s) => s.id === note.savedId)
  const failed = (e: unknown) => say((e as Error).message || 'Couldn’t change it. Try again.', true)
  const snooze = (at: Date) =>
    update.mutate({ id: note.savedId, remindAt: at.toISOString() }, { onSuccess: () => say(`Snoozed until ${formatWhen(at.toISOString())}`), onError: failed })

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {note.channelId && (
        <Link to={reminderLink(note, ws)} className="sf-focus sf-small inline-flex h-7 items-center rounded-sf-md border border-sf-line px-3 font-medium text-sf-text hover:bg-sf-surface-hover">
          View message
        </Link>
      )}
      {item?.status === 'completed' ? (
        <span className="sf-small inline-flex items-center gap-1 text-sf-text-muted">Completed</span>
      ) : (
        item && (
          <>
            <Button size="sm" icon={IconCheck} disabled={update.isPending} onClick={() => update.mutate({ id: note.savedId, status: 'completed' }, { onSuccess: () => say('Marked complete'), onError: failed })}>
              Mark complete
            </Button>
            <Menu
              label="Snooze"
              trigger={(props) => (
                <Button size="sm" icon={IconAlarmSnooze} {...props}>
                  Snooze
                </Button>
              )}
            >
              <RemindItems onPick={snooze} onCustom={() => setCustom(true)} />
            </Menu>
            <CustomReminder open={custom} onClose={() => setCustom(false)} onPick={snooze} />
          </>
        )
      )}
    </div>
  )
}
