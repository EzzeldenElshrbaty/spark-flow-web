// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSummary } from '@/api/types'
import { useTaskFromMessage } from '@/pages/chat/useTaskFromMessage'

let projects: ProjectSummary[] | undefined
let managesTasks = true
vi.mock('@/api/projects', () => ({ useProjectSummaries: () => ({ data: projects }), usePhases: () => ({ data: [] }) }))
vi.mock('@/api/tickets', () => ({ useSprints: () => ({ data: [] }) }))
vi.mock('@/api/users', () => ({ useUsers: () => ({ data: [] }) }))
vi.mock('@/lib/usePermission', () => ({ usePermission: () => () => managesTasks }))
vi.mock('@/pages/projects/TaskSheet', () => ({ TaskSheet: () => null }))

const nexus = { id: 'p-nex', name: 'Nexus Core', channelId: 'c-p-nex', methodology: 'agile' } as ProjectSummary
const inChannel = (channelId: string) => renderHook(() => useTaskFromMessage(channelId, 'ws-eng')).result.current

beforeEach(() => {
  projects = [nexus]
  managesTasks = true
})
afterEach(cleanup)

describe('useTaskFromMessage: why /task isn’t offered (spec 6.8)', () => {
  it('in a channel no project is linked to, says /task works in a project’s channel', () => {
    const general = inChannel('c-general')
    expect(general.fromCommand).toBeUndefined()
    expect(general.whyNoTask).toBe('/task works in a project’s channel.')
  })

  it('in a project’s channel where I can’t manage its tasks, names the project', () => {
    managesTasks = false
    const channel = inChannel('c-p-nex')
    expect(channel.fromCommand).toBeUndefined()
    expect(channel.whyNoTask).toBe('You can’t create tasks in Nexus Core.')
  })

  it('offers it where I manage the project’s tasks, and gives no reason while the projects load', () => {
    const channel = inChannel('c-p-nex')
    expect(channel.fromCommand?.projectName).toBe('Nexus Core')
    expect(channel.whyNoTask).toBeUndefined()
    projects = undefined
    expect(inChannel('c-general').whyNoTask).toBeUndefined()
  })
})
