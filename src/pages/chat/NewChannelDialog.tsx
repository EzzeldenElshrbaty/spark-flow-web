import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { useChannels, useCreateChannel } from '@/api/chat'
import { useMe, useUsers } from '@/api/users'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/sf/Button'
import { fieldClass, labelClass } from '@/components/sf/field'
import { Modal, ModalCancelButton } from '@/components/sf/Modal'
import { useFormCheck } from '@/lib/useFormCheck'
import { channelFormErrors, MAX_TOPIC, type ChannelValues } from '@/lib/channelForm'
import { paths } from '@/lib/paths'
import { isActive } from '@/lib/people'

/**
 * New channel (name, topic, private, people), as a chat dialog (UX Phase 3, 3.1). Private is chosen once, when the
 * channel is made. You are always in a channel you make; the list shows everyone else in the workspace. An existing
 * channel's details are in Channel details (spec 6.10).
 */
export function NewChannelDialog({ workspaceId, workspaceSlug, onClose }: { workspaceId: string; workspaceSlug: string; onClose: () => void }) {
  const ids = useId()
  const navigate = useNavigate()
  const me = useMe().data
  // Not me, and nobody deactivated (slice 3).
  const people = (useUsers(workspaceId).data ?? []).filter((u) => u.id !== me?.id && isActive(u))
  const taken = (useChannels(workspaceId).data ?? []).filter((c) => c.kind === 'channel').map((c) => c.name ?? '')
  const create = useCreateChannel()
  const [values, setValues] = useState<ChannelValues>({ name: '', topic: '', isPrivate: false, memberIds: [] })
  // Errors show from the first Create and follow each change after it (UX Phase 4, 4.4).
  const { errors, attempt } = useFormCheck(channelFormErrors(values, taken))
  const set = <K extends keyof ChannelValues>(k: K, v: ChannelValues[K]) => setValues((s) => ({ ...s, [k]: v }))
  const pending = create.isPending
  const failure = create.error as Error | null

  const save = () => {
    // Enter again while it creates sends nothing (final review).
    if (pending || !attempt()) return
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
  const row = 'sf-ui flex items-center gap-2.5 rounded-sf-sm px-2 py-1.5 text-sf-text max-md:min-h-11'

  return (
    <Modal
      open
      onClose={onClose}
      // Closing with changes asks first (UX Phase 1, 1.2).
      dirty={values.name.trim() !== '' || values.topic.trim() !== '' || values.isPrivate || values.memberIds.length > 0}
      discardQuestion="Discard this new channel?"
      title="New channel"
      description="A place for a topic or a team. A private channel shows only to the people in it."
      footer={
        <>
          <ModalCancelButton touch disabled={pending} />
          <Button touch variant="primary" onClick={save} disabled={pending}>
            {pending ? 'Creating…' : 'Create channel'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div>
          <label htmlFor={`${ids}-name`} className={labelClass}>
            Name
            <span className="text-sf-accent"> *</span>
          </label>
          <span className="flex items-center gap-1.5">
            <span className="sf-ui text-sf-text-muted" aria-hidden>
              #
            </span>
            <input
              id={`${ids}-name`}
              className={fieldClass}
              value={values.name}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={`${ids}-name-hint`}
              onChange={(e) => set('name', e.target.value.toLowerCase().replace(/\s+/g, '-'))}
              placeholder="design"
            />
          </span>
          <p id={`${ids}-name-hint`} className={errors.name ? 'sf-small mt-1 mb-0 text-sf-error' : 'sf-meta mt-1 mb-0 text-sf-text-muted'}>
            {errors.name ?? 'Lowercase letters, numbers and hyphens.'}
          </p>
        </div>
        <div>
          <label htmlFor={`${ids}-topic`} className={labelClass}>
            Topic <span className="text-sf-text-muted">(optional)</span>
          </label>
          <input
            id={`${ids}-topic`}
            className={fieldClass}
            value={values.topic}
            aria-invalid={Boolean(errors.topic)}
            aria-describedby={`${ids}-topic-hint`}
            onChange={(e) => set('topic', e.target.value)}
            placeholder="What it’s for"
          />
          <p id={`${ids}-topic-hint`} className={errors.topic ? 'sf-small mt-1 mb-0 text-sf-error' : 'sf-meta mt-1 mb-0 text-sf-text-muted'}>
            {errors.topic ?? `Up to ${MAX_TOPIC} characters.`}
          </p>
        </div>
        <label className="flex cursor-pointer items-start gap-2.5">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent-fill)]" checked={values.isPrivate} onChange={(e) => set('isPrivate', e.target.checked)} />
          <span>
            <span className="sf-ui-medium block text-sf-text">Private</span>
            <span className="sf-meta block text-sf-text-muted">Only the people you add see it. This can’t be changed later.</span>
          </span>
        </label>
        <fieldset className="m-0 border-0 p-0" aria-describedby={errors.members ? `${ids}-members-error` : undefined}>
          <legend className={labelClass}>People</legend>
          <ul className="m-0 max-h-72 list-none space-y-0.5 overflow-y-auto rounded-sf-md border border-sf-line p-1">
            {/* I'm in a channel I make. */}
            {me && (
              <li>
                <label className={`${row} text-sf-text-muted`}>
                  <input type="checkbox" className="size-4 accent-[var(--accent-fill)]" checked disabled />
                  <Avatar name={me.name} size={24} decorative />
                  <span className="min-w-0 flex-1 truncate">{me.name} · you</span>
                </label>
              </li>
            )}
            {people.map((u) => (
              <li key={u.id}>
                <label className={`${row} cursor-pointer hover:bg-sf-surface-hover`}>
                  <input type="checkbox" className="size-4 accent-[var(--accent-fill)]" checked={values.memberIds.includes(u.id)} onChange={() => toggle(u.id)} />
                  <Avatar name={u.name} size={24} decorative />
                  <span className="min-w-0 flex-1 truncate">
                    {u.name}
                    {u.title && <span className="text-sf-text-muted"> · {u.title}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {errors.members && (
            <p id={`${ids}-members-error`} className="sf-small mt-1 mb-0 text-sf-error">
              {errors.members}
            </p>
          )}
        </fieldset>
        {failure && (
          <p role="alert" className="sf-small m-0 text-sf-error">
            {failure.message}
          </p>
        )}
        {/* Enter in a field creates it, as the footer's button does. */}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
