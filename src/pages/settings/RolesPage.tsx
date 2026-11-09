import clsx from 'clsx'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useCreateRole, useDeleteRole, useRenameRole, useRoles, useSaveGrants } from '@/api/roles'
import type { Role, RoleChange } from '@/api/types'
import { ConfirmDeleteSheet } from '@/components/ConfirmDeleteSheet'
import { RowMenu, type RowMenuItem } from '@/components/RowMenu'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, inputClass, selectClass } from '@/components/ui/Field'
import { NoAccess } from '@/components/ui/NoAccess'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { LeaveGuard } from '@/components/ui/LeaveGuard'
import { Sheet, SheetCancelButton } from '@/components/ui/Sheet'
import { paths } from '@/lib/paths'
import { ALL_PERMISSIONS, PERMISSION_GROUPS, type Permission } from '@/lib/permissions'
import { useAccess } from '@/lib/usePermission'

/** The ticks I changed, by role: what each should be. Only those are sent, onto the role as the server has it then. */
type Draft = Record<string, Partial<Record<Permission, boolean>>>

const holdersLabel = (n: number) => (n === 0 ? 'Nobody' : n === 1 ? '1 person' : `${n} people`)

/** The ticks of one role that differ from what's saved (someone else may have saved the same since). */
const changedIn = (role: Role, draft: Draft) => ALL_PERMISSIONS.filter((p) => draft[role.id]?.[p] !== undefined && draft[role.id]![p] !== role.grants.includes(p))

/** Said for a changed tick, to screen readers too (the colour alone doesn't). */
const UNSAVED_ID = 'roles-unsaved'

/**
 * Settings → Roles and permissions (slice 1, spec §4.3): what each role may do, as the CRM's matrix. Ticks collect
 * until Save changes, which sends every changed role at once; the server refuses a change that leaves nobody able to
 * change settings, users and roles. Phones show one role at a time.
 */
export function RolesPage() {
  const { ws = '' } = useParams()
  const access = useAccess('settings.manage')
  const roles = useRoles()
  const saveGrants = useSaveGrants()
  const [draft, setDraft] = useState<Draft>({})
  const [saved, setSaved] = useState(false)
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<Role | null>(null)
  const [deleting, setDeleting] = useState<Role | null>(null)
  const remove = useDeleteRole()

  const back = (
    <Link to={paths.settings(ws)} className="mb-3 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
      <ArrowLeft className="size-4 rtl:-scale-x-100" /> Settings
    </Link>
  )
  const title = 'Roles and permissions'
  const subtitle = 'Choose what each role may do. People get every permission of every role they hold.'

  if (access === 'denied') {
    return (
      <>
        {back}
        <PageHeader title={title} />
        <NoAccess ws={ws} what="roles and permissions" />
      </>
    )
  }

  const list = roles.data ?? []
  const saving = saveGrants.isPending
  const isOn = (role: Role, permission: Permission) => draft[role.id]?.[permission] ?? role.grants.includes(permission)
  const changedOf = (role: Role) => changedIn(role, draft)
  const toggle = (role: Role, permission: Permission) => {
    setSaved(false)
    saveGrants.reset()
    const on = !isOn(role, permission)
    setDraft((d) => {
      const cells = { ...d[role.id] }
      // Back to what's saved: nothing to send for it.
      if (on === role.grants.includes(permission)) delete cells[permission]
      else cells[permission] = on
      const rest = { ...d, [role.id]: cells }
      if (Object.keys(cells).length === 0) delete rest[role.id]
      return rest
    })
  }
  const changes = list.reduce((sum, role) => sum + changedOf(role).length, 0)
  const submit = () => {
    const payload: RoleChange[] = list
      .map((role) => ({ role, cells: changedOf(role) }))
      .filter(({ cells }) => cells.length > 0)
      .map(({ role, cells }) => ({ roleId: role.id, add: cells.filter((p) => isOn(role, p)), remove: cells.filter((p) => !isOn(role, p)) }))
    saveGrants.mutateAsync(payload).then(
      () => {
        setDraft({})
        setSaved(true)
      },
      () => {},
    )
  }
  const menuFor = (role: Role): RowMenuItem[] => [
    { label: 'Rename', icon: Pencil, onSelect: () => setRenaming(role) },
    ...(!role.builtIn && role.holders === 0 ? [{ label: 'Delete', icon: Trash2, danger: true, onSelect: () => setDeleting(role) }] : []),
  ]

  const actions = (
    <>
      <Button variant="secondary" onClick={() => setAdding(true)} disabled={access !== 'allowed' || !roles.data}>
        <Plus className="size-4" /> Add role
      </Button>
      <Button onClick={submit} disabled={changes === 0 || saving}>
        {saving ? 'Saving…' : 'Save changes'}
      </Button>
    </>
  )

  let body
  if (roles.isError) body = <QueryError what="Roles" onRetry={() => void roles.refetch()} />
  else if (access === 'loading' || roles.isPending) body = <div className="h-96 animate-pulse rounded-xl bg-surface-strong" aria-busy="true" />
  else
    body = (
      <>
        <span id={UNSAVED_ID} hidden>
          Not saved yet
        </span>
        <Matrix roles={list} isOn={isOn} changedOf={changedOf} locked={saving} onToggle={toggle} menuFor={menuFor} />
        <OneRole roles={list} isOn={isOn} changedOf={changedOf} locked={saving} onToggle={toggle} menuFor={menuFor} />
        <p className="mt-3 max-w-3xl text-sm text-fg-muted">
          Whatever their roles, whoever manages a project can run it, and everyone can change their own messages, time and files.
        </p>
      </>
    )

  return (
    <>
      {back}
      {/* PageHeader's row, but the buttons wrap under the title on a phone instead of squeezing it. */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-[1_1_18rem]">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
      {/* What's pending, or what went wrong, beside the buttons that act on it. */}
      <div className="-mt-3 mb-4 flex min-h-6 flex-wrap items-center justify-end gap-3 text-sm">
        {saveGrants.error ? (
          <p role="alert" className="m-0 text-red-600 dark:text-red-400">
            {saveGrants.error.message}
          </p>
        ) : (
          <p role="status" className="m-0 text-fg-muted">
            {changes > 0 ? `${changes} ${changes === 1 ? 'change' : 'changes'} not saved` : saved ? 'Saved.' : ''}
          </p>
        )}
        {changes > 0 && (
          <Button
            variant="ghost"
            onClick={() => {
              setDraft({})
              saveGrants.reset()
            }}
            disabled={saving}
          >
            Discard
          </Button>
        )}
      </div>
      {body}
      <LeaveGuard dirty={changes > 0} description={changes === 1 ? '1 change to roles isn’t saved.' : `${changes} changes to roles aren’t saved.`} />
      {adding && <AddRoleSheet roles={list} onClose={() => setAdding(false)} />}
      {renaming && <RenameRoleSheet role={renaming} onClose={() => setRenaming(null)} />}
      <ConfirmDeleteSheet
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? ''}?`}
        description="Nobody holds this role. Deleting it can’t be undone."
        actionLabel="Delete role"
        onConfirm={() => remove.mutateAsync(deleting!.id)}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}

type MatrixProps = {
  roles: Role[]
  isOn: (role: Role, permission: Permission) => boolean
  /** The role's ticks that differ from what's saved. */
  changedOf: (role: Role) => Permission[]
  /** While saving: nothing can be ticked, so what's saved is what was sent. */
  locked: boolean
  onToggle: (role: Role, permission: Permission) => void
  menuFor: (role: Role) => RowMenuItem[]
}

/** Desktop and tablet: permissions down the side, roles across. The permission column stays put while it scrolls sideways. */
function Matrix({ roles, isOn, changedOf, locked, onToggle, menuFor }: MatrixProps) {
  return (
    <Card className="hidden overflow-x-auto md:block">
      <table aria-label="Permissions by role" className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="sticky start-0 z-10 bg-surface px-5 py-3 text-start text-xs font-medium text-fg-muted">
              Permission
            </th>
            {roles.map((role) => (
              <th key={role.id} scope="col" className="px-3 py-2 text-center align-bottom font-medium text-fg last:pe-5">
                <span className="flex items-center justify-center gap-0.5">
                  <span className="whitespace-nowrap">{role.name}</span>
                  <RowMenu label={`${role.name} actions`} items={menuFor(role)} />
                </span>
                <span className="block text-xs font-normal text-fg-muted">{holdersLabel(role.holders)}</span>
              </th>
            ))}
          </tr>
        </thead>
        {PERMISSION_GROUPS.map((group) => (
          <tbody key={group.label}>
            <tr>
              <th scope="rowgroup" colSpan={roles.length + 1} className="bg-surface-sunken py-2 text-start text-xs font-medium text-fg-muted">
                {/* Stays in view while the matrix scrolls sideways, like the permission names. */}
                <span className="sticky start-0 px-5">{group.label}</span>
              </th>
            </tr>
            {group.permissions.map((permission) => (
              <tr key={permission.id} className="group border-t border-line-subtle">
                <th scope="row" className="sticky start-0 z-10 bg-surface px-5 py-2.5 text-start font-normal text-fg group-hover:bg-surface-sunken">
                  {permission.label}
                </th>
                {roles.map((role) => {
                  const changed = changedOf(role).includes(permission.id)
                  return (
                    <td key={role.id} className={clsx('px-3 py-2.5 text-center last:pe-5', changed ? 'bg-accent-soft' : 'group-hover:bg-surface-sunken')}>
                      <input
                        type="checkbox"
                        checked={isOn(role, permission.id)}
                        disabled={locked}
                        onChange={() => onToggle(role, permission.id)}
                        aria-label={`${role.name}: ${permission.label}`}
                        aria-describedby={changed ? UNSAVED_ID : undefined}
                        className="size-4 cursor-pointer accent-brand-500 disabled:cursor-default"
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </Card>
  )
}

/** Phones: a matrix of five or more roles doesn't fit, so one role at a time, its permissions as a list. */
function OneRole({ roles, isOn, changedOf, locked, onToggle, menuFor }: MatrixProps) {
  const [roleId, setRoleId] = useState(roles[0]?.id ?? '')
  const role = roles.find((r) => r.id === roleId) ?? roles[0]
  const selectId = useId()
  if (!role) return null
  return (
    <div role="group" aria-label="One role’s permissions" className="md:hidden">
      <div className="mb-3 flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-fg-secondary">
            Role
          </label>
          <select id={selectId} className={selectClass} value={role.id} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {holdersLabel(r.holders)}
                {changedOf(r).length > 0 && ' · not saved'}
              </option>
            ))}
          </select>
        </div>
        <RowMenu label={`${role.name} actions`} items={menuFor(role)} />
      </div>
      <Card>
        {PERMISSION_GROUPS.map((group) => (
          <fieldset key={group.label} className="m-0 border-0 p-0">
            <legend className="w-full bg-surface-sunken px-4 py-2 text-xs font-medium text-fg-muted">{group.label}</legend>
            {group.permissions.map((permission) => {
              const changed = changedOf(role).includes(permission.id)
              return (
                <label key={permission.id} className={clsx('flex min-h-11 cursor-pointer items-center gap-3 border-t border-line-subtle px-4 py-2 text-sm text-fg', changed && 'bg-accent-soft')}>
                  <input
                    type="checkbox"
                    checked={isOn(role, permission.id)}
                    disabled={locked}
                    onChange={() => onToggle(role, permission.id)}
                    aria-describedby={changed ? UNSAVED_ID : undefined}
                    className="size-4 shrink-0 accent-brand-500"
                  />
                  {permission.label}
                </label>
              )
            })}
          </fieldset>
        ))}
      </Card>
    </div>
  )
}

/** Add role: a name, and optionally another role's permissions to start from. */
function AddRoleSheet({ roles, onClose }: { roles: Role[]; onClose: () => void }) {
  const create = useCreateRole()
  const [name, setName] = useState('')
  const [copyFrom, setCopyFrom] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = () => {
    if (!name.trim()) return setError('Name the role.')
    setError(null)
    create.mutate({ name: name.trim(), copyFrom: copyFrom || null }, { onSuccess: onClose })
  }
  return (
    <Sheet
      open
      onClose={onClose}
      dirty={name.trim() !== '' || copyFrom !== ''}
      discardQuestion="Discard this new role?"
      title="Add role"
      description="It starts with no permissions, or with another role’s."
      footer={
        <>
          <SheetCancelButton />
          <Button onClick={save} disabled={create.isPending}>
            {create.isPending ? 'Adding…' : 'Add role'}
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
        {/* A refusal (a name that's taken) is about the name: it shows under it. */}
        <Field label="Name" required error={error ?? create.error?.message}>
          <input className={inputClass} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Start from">
          <select className={selectClass} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">No permissions</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}'s permissions
              </option>
            ))}
          </select>
        </Field>
      </form>
    </Sheet>
  )
}

function RenameRoleSheet({ role, onClose }: { role: Role; onClose: () => void }) {
  const rename = useRenameRole()
  const [name, setName] = useState(role.name)
  const [error, setError] = useState<string | null>(null)
  const save = () => {
    if (!name.trim()) return setError('Name the role.')
    setError(null)
    if (name.trim() === role.name) return onClose()
    rename.mutate({ id: role.id, name: name.trim() }, { onSuccess: onClose })
  }
  return (
    <Sheet
      open
      onClose={onClose}
      dirty={name !== role.name}
      title={`Rename ${role.name}`}
      footer={
        <>
          <SheetCancelButton />
          <Button onClick={save} disabled={rename.isPending}>
            {rename.isPending ? 'Renaming…' : 'Rename'}
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
        <Field label="Name" required error={error ?? rename.error?.message}>
          <input className={inputClass} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </Field>
      </form>
    </Sheet>
  )
}
