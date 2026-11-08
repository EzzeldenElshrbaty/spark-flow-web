import clsx from 'clsx'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useCreateProject, useTeams, useUpdateProject } from '@/api/projects'
import { useTickets } from '@/api/tickets'
import type { Project, ProjectStatus, ProjectSummary } from '@/api/types'
import { useUsers } from '@/api/users'
import { pickable } from '@/lib/people'
import { Button } from '@/components/ui/Button'
import { Field, inputClass, selectClass } from '@/components/ui/Field'
import { Sheet, SheetCancelButton } from '@/components/ui/Sheet'
import { toLocalInput } from '@/lib/format'
import { projectPeople } from '@/lib/projectPeople'
import { usePermission } from '@/lib/usePermission'
import { keyFromName, validateProject, type ProjectFormErrors, type ProjectFormValues } from './projectForm'
import { tasksLeftWith } from './taskForm'

const statuses: [ProjectStatus, string][] = [
  ['planned', 'Planned'],
  ['active', 'Active'],
  ['onHold', 'On hold'],
  ['delivered', 'Delivered'],
]
const day = (iso: string) => iso.slice(0, 10)
const toIso = (value: string) => new Date(`${value}T00:00:00.000Z`).toISOString()

function initial(project: Project | undefined): ProjectFormValues {
  const today = toLocalInput(new Date()).slice(0, 10)
  return project
    ? {
        name: project.name,
        key: project.key,
        clientName: project.clientName,
        description: project.description,
        links: project.links,
        managerId: project.managerId,
        memberIds: project.memberIds,
        teamIds: project.teamIds,
        methodology: project.methodology,
        startDate: day(project.startDate),
        dueDate: day(project.dueDate),
      }
    : { name: '', key: '', clientName: '', description: '', links: [], managerId: '', memberIds: [], teamIds: [], methodology: 'waterfall', startDate: today, dueDate: today }
}

/**
 * New project (Sales, Admin) or Edit project (also the project's manager), as a drawer. The key and the way of working
 * are set once, on create. Errors come back as sentences beside their field or under the buttons.
 */
export function ProjectSheet({
  workspaceId,
  project,
  takenKeys,
  onClose,
  onSaved,
}: {
  workspaceId: string
  project?: ProjectSummary
  takenKeys: string[]
  onClose: () => void
  onSaved: (project: Project) => void
}) {
  const people = useUsers(workspaceId).data ?? []
  // Who may be chosen: nobody deactivated (slice 3), unless the project already has them in that place.
  const managers = pickable(people, [project?.managerId])
  const members = pickable(people, project?.memberIds ?? [])
  const named = (u: (typeof people)[number]) => (u.deactivated ? `${u.name} (deactivated)` : u.name)
  const teams = useTeams(workspaceId).data ?? []
  const create = useCreateProject()
  const update = useUpdateProject()
  const [opened] = useState<ProjectFormValues>(() => initial(project))
  const [values, setValues] = useState(opened)
  const [keyTouched, setKeyTouched] = useState(Boolean(project))
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'planned')
  // Closing with changes asks first (UX Phase 1, 1.2).
  const dirty = JSON.stringify(values) !== JSON.stringify(opened) || status !== (project?.status ?? 'planned')
  const check = usePermission()
  // People and teams are assigned by the manager and Admin; Sales picks them only when creating (spec §4.3).
  const canPeople = project ? check('phase.manage', { project }) : true
  const [errors, setErrors] = useState<ProjectFormErrors>({})
  const saving = create.isPending || update.isPending
  const failure = (create.error ?? update.error) as Error | null
  // A key taken in another workspace is only known to the server: show it where the key is.
  const keyFailure = failure?.message.startsWith('Key ') ? failure.message : undefined

  const set = <K extends keyof ProjectFormValues>(field: K, value: ProjectFormValues[K]) => setValues((v) => ({ ...v, [field]: value }))
  // Taking people off (as members, or with a team) leaves their tasks with them: say whose, before saving.
  const tasks = useTickets(project?.id).data ?? []
  const removed = project
    ? projectPeople(project, people)
        .map((u) => u.id)
        .filter((id) => !projectPeople({ managerId: values.managerId, memberIds: values.memberIds, teamIds: values.teamIds }, people).some((u) => u.id === id))
    : []
  const leftWith = project ? tasksLeftWith(removed, tasks, project, people) : null
  const toggle = (field: 'memberIds' | 'teamIds', id: string) =>
    set(field, values[field].includes(id) ? values[field].filter((x) => x !== id) : [...values[field], id])

  const save = () => {
    const found = validateProject(values, project ? [] : takenKeys)
    setErrors(found)
    if (Object.keys(found).length) return
    const dates = { startDate: toIso(values.startDate), dueDate: toIso(values.dueDate) }
    const links = values.links.map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
    if (project) {
      const { key: _key, methodology: _m, managerId, memberIds, teamIds, ...editable } = values
      const people = canPeople ? { managerId, memberIds, teamIds } : {}
      update.mutate({ id: project.id, patch: { ...editable, ...people, ...dates, links, status } }, { onSuccess: onSaved })
    } else {
      create.mutate({ ...values, ...dates, links, workspaceId }, { onSuccess: onSaved })
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      dirty={dirty}
      discardQuestion={project ? 'Discard your changes?' : 'Discard this new project?'}
      variant="drawer"
      title={project ? 'Edit project' : 'New project'}
      description={project ? project.key : 'It gets its own chat and, for waterfall, five phases from start to due.'}
      footer={
        <>
          <SheetCancelButton />
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save project'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <Field label="Name" required error={errors.name}>
          <input
            className={inputClass}
            value={values.name}
            aria-invalid={Boolean(errors.name)}
            onChange={(e) => {
              set('name', e.target.value)
              if (!keyTouched) set('key', keyFromName(e.target.value))
            }}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Key" required error={errors.key ?? keyFailure} hint={project ? 'Keys don’t change once tasks use them.' : 'Task numbers start with it, such as NEX-101.'}>
            <input
              className={clsx(inputClass, 'font-mono uppercase')}
              value={values.key}
              disabled={Boolean(project)}
              maxLength={5}
              aria-invalid={Boolean(errors.key)}
              onChange={(e) => {
                setKeyTouched(true)
                set('key', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))
              }}
            />
          </Field>
          <Field label="Client">
            <input className={inputClass} value={values.clientName} onChange={(e) => set('clientName', e.target.value)} />
          </Field>
        </div>
        <Field label="About">
          <textarea className={inputClass} rows={3} value={values.description} onChange={(e) => set('description', e.target.value)} />
        </Field>

        {!project && (
          <div>
            <span className="mb-1.5 block text-sm font-medium text-fg-secondary">Way of working</span>
            <div className="inline-flex rounded-lg bg-surface-muted p-0.5 ring-1 ring-line" role="radiogroup" aria-label="Way of working">
              {(
                [
                  ['waterfall', 'Waterfall'],
                  ['agile', 'Agile'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={values.methodology === value}
                  onClick={() => set('methodology', value)}
                  className={clsx('rounded-md px-3 py-1.5 text-sm font-medium', values.methodology === value ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-fg-muted hover:text-fg')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start" required>
            <input type="date" className={inputClass} value={values.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
          <Field label="Due" required error={errors.dueDate}>
            <input type="date" className={inputClass} value={values.dueDate} aria-invalid={Boolean(errors.dueDate)} onChange={(e) => set('dueDate', e.target.value)} />
          </Field>
        </div>

        {project && (
          <Field label="Status">
            <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {statuses.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Project manager" required error={errors.managerId} hint={canPeople ? undefined : 'The project manager or Admin assigns people and teams.'}>
          <select className={selectClass} value={values.managerId} disabled={!canPeople} aria-invalid={Boolean(errors.managerId)} onChange={(e) => set('managerId', e.target.value)}>
            <option value="">Choose…</option>
            {managers.map((u) => (
              <option key={u.id} value={u.id}>
                {named(u)} · {u.title}
              </option>
            ))}
          </select>
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-fg-secondary">People</legend>
          <div className="grid max-h-44 gap-1 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-2">
            {members.map((u) => (
              <label key={u.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg-secondary hover:bg-surface-muted">
                <input type="checkbox" disabled={!canPeople} checked={values.memberIds.includes(u.id)} onChange={() => toggle('memberIds', u.id)} className="accent-brand-500" />
                <span className="truncate">{named(u)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {teams.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-fg-secondary">Teams</legend>
            <div className="flex flex-wrap gap-2">
              {teams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={values.teamIds.includes(t.id)}
                  disabled={!canPeople}
                  onClick={() => toggle('teamIds', t.id)}
                  className={clsx('rounded-full px-3 py-1 text-sm ring-1 disabled:cursor-default disabled:opacity-60', values.teamIds.includes(t.id) ? 'bg-accent-soft text-accent ring-accent-line' : 'text-fg-secondary ring-line hover:bg-surface-muted')}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {leftWith && <p className="text-sm text-amber-700 dark:text-amber-300">{leftWith}</p>}

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-fg-secondary">Links</legend>
          <div className="space-y-2">
            {values.links.map((link, i) => (
              <div key={i} className="flex gap-2">
                <input className={clsx(inputClass, 'w-1/3')} placeholder="Label" value={link.label} onChange={(e) => set('links', values.links.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))} />
                <input className={inputClass} placeholder="https://" value={link.url} onChange={(e) => set('links', values.links.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))} />
                <button type="button" aria-label="Remove link" onClick={() => set('links', values.links.filter((_, j) => j !== i))} className="rounded-md p-2 text-fg-muted hover:bg-surface-muted hover:text-fg">
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => set('links', [...values.links, { label: '', url: '' }])} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-strong">
              <Plus className="size-4" /> Add link
            </button>
            {errors.links && <p className="text-xs text-red-600 dark:text-red-400">{errors.links}</p>}
          </div>
        </fieldset>

        {failure && !keyFailure && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {failure.message}
          </p>
        )}
      </form>
    </Sheet>
  )
}
