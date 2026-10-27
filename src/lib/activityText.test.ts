import { describe, expect, it } from 'vitest'
import type { ActivityEntry } from '@/api/types'
import { changeLines, describeActivity } from './activityText'

const ctx = (over: Partial<Parameters<typeof describeActivity>[1]> = {}) => ({
  nameOf: (id: string) => ({ 'u-2': 'Nour', 'u-3': 'Mariam' })[id] ?? 'Someone',
  columnLabel: (id: string) => ({ todo: 'To do', done: 'Shipped' })[id],
  phaseName: (id: string) => ({ 'ph-1': 'Build' })[id],
  withKey: true,
  ...over,
})
const e = (over: Partial<ActivityEntry>): ActivityEntry => ({ id: 'a', projectId: 'p', taskKey: 'NEX-1', actorId: 'u-2', at: '2026-10-28T10:00:00.000Z', kind: 'task.created', changes: [], ...over })

describe('describeActivity', () => {
  it('created, archived, restored', () => {
    expect(describeActivity(e({}), ctx())).toBe('Nour created NEX-1')
    expect(describeActivity(e({ kind: 'task.archived' }), ctx())).toBe('Nour archived NEX-1')
    expect(describeActivity(e({ kind: 'task.restored' }), ctx())).toBe('Nour restored NEX-1')
  })

  it('a line written before a rename keeps the old name; with no snapshot, the live name', () => {
    expect(describeActivity(e({ kind: 'task.moved', changes: [{ field: 'status', from: 'todo', to: 'done', fromLabel: 'To do', toLabel: 'Done' }] }), ctx())).toBe('Nour moved NEX-1 from To do to Done')
    expect(describeActivity(e({ kind: 'task.moved', changes: [{ field: 'status', from: 'todo', to: 'done' }] }), ctx())).toBe('Nour moved NEX-1 from To do to Shipped')
    expect(describeActivity(e({ kind: 'task.moved', changes: [{ field: 'status', from: 'col-qa', to: 'todo', fromLabel: 'QA', toLabel: 'To do' }] }), ctx())).toBe('Nour moved NEX-1 from QA to To do')
  })

  it('one changed field reads in full; an empty value reads as —; the description says only that it changed', () => {
    expect(describeActivity(e({ kind: 'task.changed', changes: [{ field: 'assigneeId', from: null, to: 'u-3' }] }), ctx())).toBe('Nour changed the assignee of NEX-1 from — to Mariam')
    expect(describeActivity(e({ kind: 'task.changed', changes: [{ field: 'dueAt', from: '2026-10-03T00:00:00.000Z', to: '2026-10-05T00:00:00.000Z' }] }), ctx())).toBe('Nour changed the due date of NEX-1 from 3 Oct 2026 to 5 Oct 2026')
    expect(describeActivity(e({ kind: 'task.changed', changes: [{ field: 'description', from: null, to: null }] }), ctx())).toBe('Nour changed the description of NEX-1')
  })

  it('several fields: a headline, then one line each', () => {
    const entry = e({ kind: 'task.changed', changes: [{ field: 'priority', from: 'low', to: 'high' }, { field: 'phaseId', from: null, to: 'ph-1' }, { field: 'estimateHours', from: '4', to: '6' }] })
    expect(describeActivity(entry, ctx())).toBe('Nour changed 3 fields of NEX-1')
    expect(changeLines(entry, ctx())).toEqual(['Priority: Low → High', 'Phase: — → Build', 'Estimate: 4 h → 6 h'])
  })

  it("inside a task's history the key is dropped", () => {
    expect(describeActivity(e({ kind: 'task.changed', changes: [{ field: 'title', from: 'A', to: 'B' }] }), ctx({ withKey: false }))).toBe('Nour changed the title from A to B')
    expect(describeActivity(e({ kind: 'task.moved', changes: [{ field: 'status', from: 'todo', to: 'done' }] }), ctx({ withKey: false }))).toBe('Nour moved it from To do to Shipped')
    expect(describeActivity(e({ kind: 'comment.added', subject: 'bug' }), ctx({ withKey: false }))).toBe('Nour reported a bug')
  })

  it('comments, columns, phases, deliverables and the project', () => {
    expect(describeActivity(e({ kind: 'comment.added', subject: 'comment' }), ctx())).toBe('Nour commented on NEX-1')
    expect(describeActivity(e({ kind: 'comment.added', subject: 'bug' }), ctx())).toBe('Nour reported a bug on NEX-1')
    expect(describeActivity(e({ kind: 'comment.edited' }), ctx())).toBe('Nour edited a comment on NEX-1')
    expect(describeActivity(e({ kind: 'comment.deleted' }), ctx())).toBe('Nour deleted a comment on NEX-1')
    const col = { taskKey: null }
    expect(describeActivity(e({ ...col, kind: 'column.added', subject: 'QA', changes: [{ field: 'category', from: null, to: 'inProgress' }] }), ctx())).toBe('Nour added the column QA (In progress)')
    expect(describeActivity(e({ ...col, kind: 'column.renamed', subject: 'Testing', changes: [{ field: 'label', from: 'In review', to: 'Testing' }] }), ctx())).toBe('Nour renamed the column In review to Testing')
    expect(describeActivity(e({ ...col, kind: 'column.moved', subject: 'QA' }), ctx())).toBe('Nour moved the column QA')
    expect(describeActivity(e({ ...col, kind: 'column.typed', subject: 'QA', changes: [{ field: 'category', from: 'inProgress', to: 'done' }] }), ctx())).toBe('Nour changed the column QA to Done')
    expect(describeActivity(e({ ...col, kind: 'column.deleted', subject: 'QA', count: 1, changes: [{ field: 'moveTo', from: 'col-qa', to: 'todo', fromLabel: 'QA', toLabel: 'To do' }] }), ctx())).toBe('Nour deleted the column QA and moved 1 task to To do')
    expect(describeActivity(e({ ...col, kind: 'column.deleted', subject: 'QA', count: 3, changes: [{ field: 'moveTo', from: 'col-qa', to: 'gone', fromLabel: 'QA', toLabel: 'Old' }] }), ctx())).toBe('Nour deleted the column QA and moved 3 tasks to Old')
    expect(describeActivity(e({ ...col, kind: 'phase.added', subject: 'QA' }), ctx())).toBe('Nour added the phase QA')
    expect(describeActivity(e({ ...col, kind: 'phase.changed', subject: 'QA' }), ctx())).toBe('Nour changed the phase QA')
    expect(describeActivity(e({ ...col, kind: 'phase.removed', subject: 'QA' }), ctx())).toBe('Nour removed the phase QA')
    expect(describeActivity(e({ ...col, kind: 'project.changed' }), ctx())).toBe('Nour edited the project')
    expect(describeActivity(e({ ...col, kind: 'deliverable.added', subject: 'API docs' }), ctx())).toBe('Nour added the deliverable API docs')
    expect(describeActivity(e({ ...col, kind: 'deliverable.changed', subject: 'API docs' }), ctx())).toBe('Nour changed the deliverable API docs')
    expect(describeActivity(e({ ...col, kind: 'file.removed', subject: 'scope.pdf' }), ctx())).toBe('Nour removed the file scope.pdf')
    expect(describeActivity(e({ ...col, kind: 'deliverable.removed', subject: 'API docs' }), ctx())).toBe('Nour removed the deliverable API docs')
  })
})
