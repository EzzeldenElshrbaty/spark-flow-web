import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useChannels, useCreateChannel } from '@/api/chat'
import { useMe, useUsers } from '@/api/users'
import { isActive } from '@/lib/people'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Field, inputClass } from '@/components/ui/Field'
import { Sheet, SheetCancelButton } from '@/components/ui/Sheet'
import { channelFormErrors, MAX_TOPIC, type ChannelValues } from '@/lib/channelForm'
import { paths } from '@/lib/paths'

/**
 * New channel (name, topic, private, people), as a drawer. Private is chosen once, when the channel is made. You are
 * always in a channel you make; the list shows everyone else in the workspace. An existing channel's details are in
 * Channel details (spec 6.10).
 */
export function ChannelSheet({ workspaceId, workspaceSlug, onClose }: { workspaceId: string; workspaceSlug: string; onClose: () => void }) {
  const navigate = useNavigate()
  const me = useMe().data
  // Not me, and nobody deactivated (slice 3).
  const people = (useUsers(workspaceId).data ?? []).filter((u) => u.id !== me?.id && isActive(u))
  const taken = (useChannels(workspaceId).data ?? []).filter((c) => c.kind === 'channel').map((c) => c.name ?? '')
  const create = useCreateChannel()
  const [values, setValues] = useState<ChannelValues>({ name: '', topic: '', isPrivate: false, memberIds: [] })
  const [errors, setErrors] = useState<ReturnType<typeof channelFormErrors>>({})
  const set = <K extends keyof ChannelValues>(k: K, v: ChannelValues[K]) => setValues((s) => ({ ...s, [k]: v }))
  const pending = create.isPending
  const failure = create.error as Error | null

  const save = () => {
    const found = channelFormErrors(values, taken)
    setErrors(found)
    if (Object.keys(found).length) return
    const memberIds = me ? [me.id, ...values.memberIds] : values.memberIds
    create.mutate(
      { workspaceId, name: values.name.trim(), topic: values.topic.trim(), isPrivate: values.isPrivate, memberIds },
      {
        onSuccess: (made) => {
          onClose()
          navigate(paths.channel(workspaceSlug, made.id))
        },
      },
    )
  }

  const toggle = (id: string) => set('memberIds', values.memberIds.includes(id) ? values.memberIds.filter((m) => m !== id) : [...values.memberIds, id])

  return (
    <Sheet
      open
      onClose={onClose}
      // Closing with changes asks first (UX Phase 1, 1.2).
      dirty={values.name.trim() !== '' || values.topic.trim() !== '' || values.isPrivate || values.memberIds.length > 0}
      discardQuestion="Discard this new channel?"
      variant="drawer"
      title="New channel"
      description="A place for a topic or a team. A private channel shows only to the people in it."
      footer={
        <>
          <SheetCancelButton disabled={pending} />
          <Button onClick={save} disabled={pending}>
            {pending ? 'Creating…' : 'Create channel'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required error={errors.name} hint="Lowercase letters, numbers and hyphens.">
          <span className="flex items-center gap-1.5">
            <span className="text-fg-muted" aria-hidden>
              #
            </span>
            <input className={inputClass} value={values.name} aria-invalid={Boolean(errors.name)} onChange={(e) => set('name', e.target.value.toLowerCase().replace(/\s+/g, '-'))} placeholder="design" />
          </span>
        </Field>
        <Field label="Topic" error={errors.topic} hint={`Up to ${MAX_TOPIC} characters.`}>
          <input className={inputClass} value={values.topic} aria-invalid={Boolean(errors.topic)} onChange={(e) => set('topic', e.target.value)} placeholder="What it's for" />
        </Field>
        <label className="flex items-start gap-2.5 text-sm text-fg-secondary">
          <input type="checkbox" className="mt-0.5 size-4 accent-brand-500" checked={values.isPrivate} onChange={(e) => set('isPrivate', e.target.checked)} />
          <span>
            <span className="font-medium text-fg">Private</span>
            <span className="block text-xs text-fg-muted">Only the people you add see it. This can't be changed later.</span>
          </span>
        </label>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-fg-secondary">People</legend>
          <ul className="max-h-72 space-y-0.5 overflow-y-auto rounded-lg border border-line p-1">
            {/* I'm in a channel I make. */}
            {me && (
              <li>
                <label className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-fg-muted">
                  <input type="checkbox" className="size-4 accent-brand-500" checked disabled />
                  <Avatar name={me.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{me.name} · you</span>
                </label>
              </li>
            )}
            {people.map((u) => (
              <li key={u.id}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-fg hover:bg-surface-muted">
                  <input type="checkbox" className="size-4 accent-brand-500" checked={values.memberIds.includes(u.id)} onChange={() => toggle(u.id)} />
                  <Avatar name={u.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate">
                    {u.name}
                    {u.title && <span className="text-fg-muted"> · {u.title}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {errors.members && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.members}</p>}
        </fieldset>
        {failure && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {failure.message}
          </p>
        )}
      </div>
    </Sheet>
  )
}
