import { useState, type FormEvent } from 'react'
import { Button } from '../components/ui/Button'
import { Field, inputClass } from '../components/ui/Field'
import { Sheet } from '../components/ui/Sheet'
import { api } from '../lib/api'

/** Change password, from the account menu. Other devices are signed out; this one stays signed in. */
export function ChangePasswordSheet({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (next !== repeat) return setError("The two new passwords don't match.")
    setBusy(true)
    setError('')
    try {
      await api('/api/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } })
      setDone(true)
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Change password"
      description={done ? undefined : 'You stay signed in here; other phones and computers are signed out.'}
      footer={
        done ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="change-password-form" disabled={busy}>
              {busy ? 'Saving…' : 'Change password'}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <p className="text-sm text-fg-secondary">Your password is changed.</p>
      ) : (
        <form id="change-password-form" onSubmit={submit} className="space-y-4">
          <Field label="Current password">
            <input className={inputClass} type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" required />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <input className={inputClass} type="password" value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" required />
          </Field>
          <Field label="Repeat new password">
            <input className={inputClass} type="password" value={repeat} onChange={(event) => setRepeat(event.target.value)} autoComplete="new-password" required />
          </Field>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </form>
      )}
    </Sheet>
  )
}
