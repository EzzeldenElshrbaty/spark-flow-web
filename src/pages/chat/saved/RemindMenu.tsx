import { IconAlarm, IconAlarmOff, IconCalendarEvent } from '@tabler/icons-react'
import { useId, useState } from 'react'
import { Button } from '@/components/sf/Button'
import { MenuItem, MenuSeparator } from '@/components/sf/Menu'
import { Modal } from '@/components/sf/Modal'
import { toLocalInput } from '@/lib/format'
import { customRemindError, remindPresets } from '@/lib/remindTimes'

/**
 * The Remind me choices (spec 6.5), as menu items: In 20 minutes … Next week, — Custom…, and Remove reminder when
 * one is set. The message menu's submenu, the Saved row's Change reminder and Flowbot's Snooze all use them.
 */
export function RemindItems({ onPick, onCustom, onClear }: { onPick: (at: Date) => void; onCustom: () => void; onClear?: () => void }) {
  const presets = remindPresets(new Date())
  return (
    <>
      {presets.map((preset) => (
        <MenuItem key={preset.label} icon={IconAlarm} hint={preset.hint ?? undefined} onSelect={() => onPick(preset.at)}>
          {preset.label}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem icon={IconCalendarEvent} onSelect={onCustom}>
        Custom…
      </MenuItem>
      {onClear && (
        <MenuItem icon={IconAlarmOff} onSelect={onClear}>
          Remove reminder
        </MenuItem>
      )}
    </>
  )
}

/**
 * Custom… (spec 6.5) and Custom time… (spec 6.8): a date and time, in the future, in the viewer's own time zone.
 * `title` and `action` name what it's for (Remind me · Set reminder; Schedule message · Schedule).
 */
export function CustomReminder({
  open,
  onClose,
  onPick,
  title = 'Remind me',
  action = 'Set reminder',
}: {
  open: boolean
  onClose: () => void
  onPick: (at: Date) => void
  title?: string
  action?: string
}) {
  const inputId = useId()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const close = () => {
    setValue('')
    setError(null)
    onClose()
  }
  const submit = () => {
    const problem = customRemindError(value, new Date())
    if (problem) return setError(problem)
    onPick(new Date(value))
    close()
  }
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      description={`Times are in ${zone}.`}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            {action}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="flex flex-col gap-2"
      >
        <label htmlFor={inputId} className="sf-small font-medium text-sf-text">
          Date and time
        </label>
        <input
          id={inputId}
          type="datetime-local"
          value={value}
          min={toLocalInput(new Date())}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setValue(event.target.value)
            setError(null)
          }}
          className="sf-ui h-sf-input min-w-0 rounded-sf-md border border-sf-line-strong bg-sf-surface px-3 text-sf-text tabular-nums outline-none focus:border-sf-focus focus:shadow-[0_0_0_3px_var(--surface-mention)] max-md:h-11"
        />
        {error && (
          <p role="alert" className="sf-small m-0 text-sf-error">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
