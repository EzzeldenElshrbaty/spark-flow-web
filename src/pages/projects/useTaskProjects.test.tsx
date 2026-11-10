// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSummary } from '@/api/types'
import { useTaskProjects } from '@/pages/projects/useTaskProjects'

let projects: ProjectSummary[] | undefined
const manages = new Set<string>()
vi.mock('@/api/projects', () => ({ useProjectSummaries: () => ({ data: projects }) }))
vi.mock('@/lib/usePermission', () => ({
  usePermission: () => (action: string, ctx: { project: { id: string } }) => action === 'task.manage' && manages.has(ctx.project.id),
}))
afterEach(cleanup)

const summary = (id: string, archivedAt: string | null = null) => ({ id, name: id, archivedAt }) as ProjectSummary

describe('useTaskProjects (New task, and /task in any channel)', () => {
  it('lists the projects I may add tasks to, in their order, never an archived one', () => {
    projects = [summary('p-nex'), summary('p-old', '2026-10-01T00:00:00Z'), summary('p-mob'), summary('p-des')]
    manages.clear()
    for (const id of ['p-mob', 'p-old', 'p-nex']) manages.add(id)
    expect(renderHook(() => useTaskProjects('ws-eng')).result.current?.map((p) => p.id)).toEqual(['p-nex', 'p-mob'])
  })

  it('is undefined while the projects load, so a caller can tell loading from none', () => {
    projects = undefined
    expect(renderHook(() => useTaskProjects('ws-eng')).result.current).toBeUndefined()
  })
})
